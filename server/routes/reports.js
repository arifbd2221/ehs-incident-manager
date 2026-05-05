import { Router } from 'express';
import db from '../db/connection.js';
import { calculateMetrics } from '../services/metrics.js';

const router = Router();

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
  });
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
