import { Router } from 'express';
import db from '../db/connection.js';
import { calculateMetrics } from '../services/metrics.js';

const router = Router();

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

const OSHA_300A_AFFIRMATION =
  'I certify that I have examined this document and that to the best of my knowledge the entries are true, accurate, and complete.';

router.get('/osha-300', (req, res) => {
  const { site_id, year } = req.query;
  const currentYear = year || new Date().getFullYear();
  const orgId = req.user.org_id;

  let where = ['o.org_id = ?', 'o.calendar_year = ?'];
  let params = [orgId, Number(currentYear)];

  if (site_id) { where.push('o.site_id = ?'); params.push(Number(site_id)); }

  const entries = db.prepare(`
    SELECT o.*, s.name as site_name, s.establishment_id
    FROM osha_300_log o
    LEFT JOIN sites s ON s.id = o.site_id
    WHERE ${where.join(' AND ')}
    ORDER BY o.case_number DESC
  `).all(...params);

  const site = site_id ? db.prepare('SELECT * FROM sites WHERE id = ?').get(Number(site_id)) : null;

  res.json({
    entries,
    site: site ? { name: site.name, establishment_id: site.establishment_id } : null,
    year: Number(currentYear),
  });
});

router.get('/osha-300a', (req, res) => {
  const { site_id, year } = req.query;
  const currentYear = year || new Date().getFullYear() - 1;
  const orgId = req.user.org_id;

  if (!site_id) return res.status(400).json({ error: 'site_id is required' });

  const metrics = calculateMetrics(Number(site_id), Number(currentYear));

  const cases = db.prepare(`
    SELECT
      SUM(classification_death) as deaths,
      SUM(classification_days_away) as days_away,
      SUM(classification_job_transfer) as job_transfer,
      SUM(classification_other) as other_recordable,
      SUM(days_away_count) as total_days_away,
      SUM(days_restricted_count) as total_days_restricted
    FROM osha_300_log WHERE site_id = ? AND calendar_year = ?
  `).get(Number(site_id), Number(currentYear));

  const types = db.prepare(`
    SELECT injury_type, COUNT(*) as count
    FROM osha_300_log WHERE site_id = ? AND calendar_year = ?
    GROUP BY injury_type
  `).all(Number(site_id), Number(currentYear));

  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(Number(site_id));

  // Surface the 300A signed cert for this site/year if one exists. The
  // UI uses this to show "Signed by X on Y" instead of the Certify button.
  const certification = db.prepare(`
    SELECT rc.id, rc.signed_at, rc.affirmation_text, rc.certifier_title,
           u.name as certifier_name, u.initials as certifier_initials
    FROM regulatory_certifications rc
    LEFT JOIN users u ON u.id = rc.certifier_user_id
    WHERE rc.type = 'osha_300a' AND rc.site_id = ? AND rc.period_year = ?
    ORDER BY rc.signed_at DESC LIMIT 1
  `).get(Number(site_id), Number(currentYear));

  res.json({
    year: Number(currentYear),
    site: { name: site?.name, establishment_id: site?.establishment_id, naics_code: site?.naics_code, annual_avg_employees: site?.annual_avg_employees, total_hours_worked: site?.total_hours_worked },
    cases: {
      deaths: cases?.deaths || 0,
      days_away: cases?.days_away || 0,
      job_transfer: cases?.job_transfer || 0,
      other_recordable: cases?.other_recordable || 0,
      total_days_away: cases?.total_days_away || 0,
      total_days_restricted: cases?.total_days_restricted || 0,
    },
    types,
    metrics,
    certification: certification || null,
    affirmation_text: OSHA_300A_AFFIRMATION,
  });
});

// 300A annual sign-off (per OSHA 1904.32). Elevated roles only.
// Body: { site_id, year, typed_name, certifier_title }
//   typed_name must match the user's name (case-insensitive trim) — that's
//   the OSHA-style "wet signature" stand-in. The activity_log row uses
//   entity_type='system' since 300A spans an entire site/year and isn't
//   tied to any single incident.
router.post('/osha-300a/certify', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Only an elevated role can certify the 300A summary.' });
  }
  const { site_id, year, typed_name, certifier_title } = req.body || {};
  if (!site_id || !year || !typed_name || !certifier_title) {
    return res.status(400).json({ error: 'site_id, year, typed_name, and certifier_title are required.' });
  }

  const site = db.prepare('SELECT id, name FROM sites WHERE id = ? AND org_id = ?').get(site_id, req.user.org_id);
  if (!site) return res.status(404).json({ error: 'Site not found in your organization.' });

  // OSHA-style: the certifier's typed name must match their account name.
  // Loose match (trim + case-insensitive) so trailing spaces / case don't
  // trip up an honest signer.
  const expected = (req.user.name || '').trim().toLowerCase();
  const actual = (typed_name || '').trim().toLowerCase();
  if (!expected || expected !== actual) {
    return res.status(400).json({
      error: `Typed name must match your account name on file: "${req.user.name}".`,
    });
  }

  // Idempotency: if already signed for this site/year, return the existing
  // cert rather than 409. Easier UX — sign-once-per-year is the OSHA rule.
  const existing = db.prepare(`
    SELECT id FROM regulatory_certifications WHERE type='osha_300a' AND site_id=? AND period_year=?
  `).get(Number(site_id), Number(year));
  if (existing) {
    return res.status(409).json({ error: `300A for ${site.name} ${year} is already signed.` });
  }

  const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;
  const userAgent = req.headers['user-agent'] || null;

  const result = db.prepare(`
    INSERT INTO regulatory_certifications (
      type, site_id, period_year, certifier_user_id, certifier_title,
      affirmation_text, ip_address, user_agent
    ) VALUES ('osha_300a', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(site_id), Number(year), req.user.id,
    certifier_title.trim(), OSHA_300A_AFFIRMATION,
    ipAddress, userAgent,
  );

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, metadata)
    VALUES (?, 'system', NULL, 'osha_300a_signed', ?, ?, ?)
  `).run(
    req.user.org_id,
    `signed OSHA 300A for ${site.name} (CY ${year}) as "${certifier_title.trim()}"`,
    req.user.id,
    JSON.stringify({ certification_id: result.lastInsertRowid, site_id: Number(site_id), period_year: Number(year) }),
  );

  const cert = db.prepare(`
    SELECT rc.id, rc.signed_at, rc.affirmation_text, rc.certifier_title,
           u.name as certifier_name, u.initials as certifier_initials
    FROM regulatory_certifications rc
    LEFT JOIN users u ON u.id = rc.certifier_user_id
    WHERE rc.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(cert);
});

router.get('/osha-301/:incidentId', (req, res) => {
  const incident = db.prepare(`
    SELECT i.*, s.name as site_name, s.address as site_address,
           u.name as reporter_name
    FROM incidents i
    LEFT JOIN sites s ON s.id = i.site_id
    LEFT JOIN users u ON u.id = i.reported_by
    WHERE i.id = ? AND i.org_id = ?
  `).get(req.params.incidentId, req.user.org_id);

  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  const td = JSON.parse(incident.type_data || '{}');
  const logEntry = db.prepare('SELECT case_number FROM osha_300_log WHERE incident_id = ?').get(incident.id);

  res.json({
    incident_number: incident.incident_number,
    case_number: logEntry?.case_number,
    employee: {
      name: td.injured_person?.name || td.affected_person?.name || '',
      job_title: td.injured_person?.job_title || td.affected_person?.job_title || '',
      department: td.injured_person?.department || incident.department || '',
      hire_date: td.injured_person?.hire_date || '',
    },
    incident: {
      date: incident.incident_datetime,
      location: `${incident.area || ''} ${incident.specific_location || ''}`.trim(),
      site: incident.site_name,
      description: incident.description,
      title: incident.title,
    },
    injury: {
      type: td.injury_type || td.illness_category || '',
      body_part: (td.body_parts || []).join(', '),
      object_substance: td.object_substance || td.substance?.name || '',
      mechanism: td.mechanism || '',
    },
    classification: {
      type: incident.osha_recordability_type,
      days_away: incident.osha_days_away,
      days_restricted: incident.osha_days_restricted,
      date_of_death: incident.osha_date_of_death,
    },
    treatment: td.treatment || td.treatments || [],
    type_data: td,
  });
});

router.get('/riddor', (req, res) => {
  const { site_id, year } = req.query;
  const currentYear = year || new Date().getFullYear();
  const orgId = req.user.org_id;

  let where = ['r.org_id = ?'];
  let params = [orgId];

  if (site_id) { where.push('r.site_id = ?'); params.push(Number(site_id)); }
  if (year) { where.push("strftime('%Y', r.event_date) = ?"); params.push(String(currentYear)); }

  const reports = db.prepare(`
    SELECT r.*, s.name as site_name, i.incident_number, i.title as incident_title
    FROM riddor_reports r
    LEFT JOIN sites s ON s.id = r.site_id
    LEFT JOIN incidents i ON i.id = r.incident_id
    WHERE ${where.join(' AND ')}
    ORDER BY r.event_date DESC
  `).all(...params);

  const stats = {
    specified_injuries: reports.filter(r => r.category === 'specified_injury').length,
    over_7_day: reports.filter(r => r.category === 'over_7_day').length,
    dangerous_occurrences: reports.filter(r => r.category === 'dangerous_occurrence').length,
    fatalities: reports.filter(r => r.category === 'fatality').length,
    diseases: reports.filter(r => r.category === 'disease').length,
  };

  res.json({ reports, stats, year: Number(currentYear) });
});

router.get('/metrics', (req, res) => {
  const { site_id } = req.query;
  if (!site_id) return res.status(400).json({ error: 'site_id is required' });
  const metrics = calculateMetrics(Number(site_id));
  res.json(metrics);
});

export default router;
