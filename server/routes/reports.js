import { Router } from 'express';
import db from '../db/connection.js';
import { calculateMetrics } from '../services/metrics.js';
import { writeActivity, auditCtx } from '../services/activity_log.js';
import { AUDIT_ACTIONS_CATALOG } from '../services/audit_actions_catalog.js';
import { verifyChain } from '../db/activity_log_chain.js';
import { renderOsha300Pdf } from '../services/pdf/osha_300.js';
import { renderOsha301Pdf } from '../services/pdf/osha_301.js';
import { listAffectedPersons } from '../services/affected_persons.js';
import {
  listSevereNotificationsForIncident,
  getSevereNotification,
  logPhoneNotification,
} from '../services/osha_severe.js';
import {
  listSeriousInjuryTypes,
  listDangerousIncidentTypes,
  getNotificationForIncident as getNswForIncident,
  getNotificationByNumber as getNswByNumber,
  listNotificationsForOrg as listNswForOrg,
  logPhoneNotification as logNswPhone,
  logRegulatorRequestedWritten as logNswRegulatorRequested,
  logWrittenSubmitted as logNswWrittenSubmitted,
  setSitePreservation as setNswSitePreservation,
  setPcbu as setNswPcbu,
} from '../services/safework_nsw.js';
import { validateAbn } from '../services/abn_validator.js';
import {
  aggregate300A,
  createCertifiedSnapshot,
  getCertifiedSnapshot,
  CERTIFIER_TITLE_OPTIONS,
  OSHA_300A_AFFIRMATION_TEXT,
} from '../services/osha_300a.js';
import { itaDesignation } from '../services/osha_ita_designation.js';
import { renderOsha300APdf } from '../services/pdf/osha_300a.js';
import { generateItaCsv, buildItaRow } from '../services/csv/osha_ita.js';
import { validateItaSubmission } from '../services/csv/osha_ita_validator.js';

const router = Router();

// Hard cap on a single CSV export. Prevents accidental OOM from a wildcard
// pull on a multi-year activity_log. If hit, the response sets a hard-limit
// flag in the audit row so the EHS manager knows to narrow filters.
const AUDIT_EXPORT_HARD_LIMIT = 10000;

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

// Audit-log access is narrower than ELEVATED. Compliance/upper-management
// roles only — supervisors run operations day-to-day and shouldn't see the
// org-wide forensic trail. Mirrored on the FE in ReportsPage.jsx.
const AUDIT_ROLES = new Set(['ehs_officer', 'ehs_manager', 'admin']);
const canSeeAudit = (user) => AUDIT_ROLES.has(user?.role);

// Legacy alias retained for any callers that still reference the
// pre-WI-02 constant. New code reads OSHA_300A_AFFIRMATION_TEXT from
// services/osha_300a.js — the verbatim 29 CFR 1904.32(b)(3) wording.
const OSHA_300A_AFFIRMATION = OSHA_300A_AFFIRMATION_TEXT;

// Site-scoped metrics for live KPI cards (SiteDetail, embed components).
// Returns the same `calculateMetrics` shape used by /osha-300a, but standalone
// so callers don't have to pull case lists + types + certification. Year
// defaults to the current calendar year (not last year, unlike 300A).
router.get('/site-metrics', (req, res) => {
  const { site_id, year } = req.query;
  if (!site_id) return res.status(400).json({ error: 'site_id is required' });
  const site = db.prepare('SELECT id FROM sites WHERE id = ? AND org_id = ?')
    .get(Number(site_id), req.user.org_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });
  const y = year ? Number(year) : new Date().getFullYear();
  if (!Number.isInteger(y) || y < 1900 || y > 2999) {
    return res.status(400).json({ error: 'year must be a 4-digit year' });
  }
  res.json({ year: y, metrics: calculateMetrics(site.id, y) });
});

router.get('/osha-300', (req, res) => {
  const { site_id, year, format } = req.query;
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
  `).all(...params).map(e => {
    if (e.is_privacy_case) {
      e.employee_name = 'Privacy Case';
      e.job_title = '';
    }
    return e;
  });

  const site = site_id ? db.prepare('SELECT * FROM sites WHERE id = ? AND org_id = ?')
    .get(Number(site_id), orgId) : null;
  if (site_id && !site) return res.status(404).json({ error: 'Site not found' });

  if (format === 'pdf') {
    // 29 CFR 1904.30(a): the OSHA 300 Log is kept per-establishment. The
    // PDF rendering preserves that — without a site_id the renderer would
    // have to invent an establishment line, which would be confusing to an
    // inspector. Require it explicitly.
    if (!site) {
      return res.status(400).json({ error: 'site_id is required for PDF format (one Log per establishment, 29 CFR 1904.30(a)).' });
    }
    const org = db.prepare('SELECT name FROM organizations WHERE id = ?').get(orgId);
    const filename = `osha-300-${(site.establishment_id || site.name || 'site').toString().replace(/[^A-Za-z0-9_.-]/g, '_')}-${currentYear}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    writeActivity({
      org_id: orgId,
      entity_type: 'system',
      entity_id: null,
      action: 'osha_300_pdf_downloaded',
      description: `downloaded OSHA 300 PDF for ${site.name} (CY ${currentYear}) — ${entries.length} case(s)`,
      user_id: req.user.id,
      metadata: {
        site_id: site.id,
        period_year: Number(currentYear),
        case_count: entries.length,
      },
      ...auditCtx(req),
    });

    return renderOsha300Pdf(res, {
      year: Number(currentYear),
      entries,
      site,
      orgName: org?.name || '',
    });
  }

  res.json({
    entries,
    site: site ? { name: site.name, establishment_id: site.establishment_id } : null,
    year: Number(currentYear),
  });
});

router.get('/osha-300a', (req, res) => {
  const { site_id, year, format } = req.query;
  const currentYear = year || new Date().getFullYear() - 1;
  const orgId = req.user.org_id;

  if (!site_id) return res.status(400).json({ error: 'site_id is required' });

  const site = db.prepare('SELECT * FROM sites WHERE id = ? AND org_id = ?')
    .get(Number(site_id), orgId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  // WI-02: prefer the certified snapshot when one exists. Live aggregate
  // is the DRAFT view for in-progress summaries. Per 29 CFR 1904.32(b)(5)
  // the posted summary must not be altered; the snapshot is the
  // immutable artifact.
  const snapshot = getCertifiedSnapshot(orgId, site.id, Number(currentYear));

  const live = aggregate300A({ orgId, siteId: site.id, periodYear: Number(currentYear) });
  const metrics = calculateMetrics(site.id, Number(currentYear));
  const liveAvgEmployees = metrics.annualAvgEmployees || site.annual_avg_employees || 0;
  const liveHours = metrics.totalHoursWorked || 0;

  // Helper: pick certified totals when present, else live aggregate.
  const totalsFor = snapshot ? snapshot : live;

  // --- PDF / CSV download branches ---
  if (format === 'pdf' || format === 'csv') {
    const baseFn = (site.establishment_id || site.name || 'site').toString().replace(/[^A-Za-z0-9_.-]/g, '_');
    const company = db.prepare('SELECT name FROM organizations WHERE id = ?').get(orgId);

    if (format === 'pdf') {
      const filename = `osha-300a-${baseFn}-${currentYear}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      writeActivity({
        org_id: orgId, entity_type: 'system', entity_id: null,
        action: 'osha_300a_pdf_downloaded',
        description: `downloaded OSHA 300A PDF for ${site.name} (CY ${currentYear})${snapshot ? ' — certified' : ' — DRAFT'}`,
        user_id: req.user.id,
        metadata: {
          site_id: site.id, period_year: Number(currentYear),
          certified: !!snapshot,
          certification_id: snapshot?.certification_id || null,
        },
        ...auditCtx(req),
      });
      return renderOsha300APdf(res, {
        year: Number(currentYear),
        establishmentName: snapshot?.establishment_name || site.name,
        establishmentAddress: snapshot?.establishment_address || site.address,
        naicsCode: snapshot?.naics_code || site.naics_code,
        ein: snapshot?.ein || null,
        annualAvgEmployees: snapshot?.annual_avg_employees ?? liveAvgEmployees,
        totalHoursWorked: snapshot?.total_hours_worked ?? liveHours,
        totals: snapshot ? snapshot : live,
        certified: !!snapshot,
        cert: snapshot ? {
          signed_at: snapshot.signed_at,
          certifier_name: snapshot.certifier_name,
          certifier_title_label: snapshot.certifier_title_label,
        } : null,
        companyName: company?.name || '',
      });
    }

    if (format === 'csv') {
      // ITA CSV upload format per 29 CFR 1904.41. Requires a certified
      // snapshot — submitting un-certified totals would violate the
      // sign-then-submit ordering of 1904.32(b)(3) + 1904.41(a)(1).
      if (!snapshot) {
        return res.status(409).json({
          error: 'OSHA ITA CSV requires a certified 300A snapshot. Certify the summary before generating the submission file.',
          spec_ref: '29 CFR 1904.32(b)(3), 29 CFR 1904.41(a)(1)',
        });
      }
      // Pull the supplemental fields not on the cert snapshot: company
      // name + city/state/zip + industry_description + size +
      // establishment_type + change_reason. v1 takes them from query
      // string so the FE can pre-fill from a confirmation modal.
      const extra = {
        company_name: req.query.company_name || company?.name || '',
        ein: req.query.ein || '',
        city: req.query.city || '',
        state: req.query.state || '',
        zip: req.query.zip || '',
        industry_description: req.query.industry_description || '',
        size: req.query.size ? Number(req.query.size) : null,
        establishment_type: req.query.establishment_type ? Number(req.query.establishment_type) : null,
        change_reason: req.query.change_reason || '',
      };
      const row = buildItaRow(snapshot, extra);
      const validation = validateItaSubmission(row);
      if (!validation.ok) {
        return res.status(400).json({
          error: 'ITA submission validation failed — OSHA would reject this file.',
          ita_validation_errors: validation.errors,
        });
      }
      const csv = generateItaCsv([row]);
      const filename = `osha-ita-300a-${baseFn}-${currentYear}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      writeActivity({
        org_id: orgId, entity_type: 'system', entity_id: null,
        action: 'osha_ita_csv_downloaded',
        description: `downloaded OSHA ITA CSV for ${site.name} (CY ${currentYear})`,
        user_id: req.user.id,
        metadata: {
          site_id: site.id, period_year: Number(currentYear),
          certification_id: snapshot.certification_id,
        },
        ...auditCtx(req),
      });
      return res.send(csv);
    }
  }

  // --- JSON branch (default) ---
  // Backward-compat shape. New `snapshot` field added so the FE can
  // detect "live vs certified" without an extra request.
  res.json({
    year: Number(currentYear),
    site: {
      name: site.name,
      establishment_id: site.establishment_id,
      naics_code: site.naics_code,
      annual_avg_employees: liveAvgEmployees,
      total_hours_worked: liveHours,
    },
    cases: {
      deaths: totalsFor.total_deaths || 0,
      days_away: totalsFor.total_days_away_cases || 0,
      job_transfer: totalsFor.total_job_transfer_cases || 0,
      other_recordable: totalsFor.total_other_recordable_cases || 0,
      total_days_away: totalsFor.total_days_away || 0,
      total_days_restricted: totalsFor.total_days_restricted || 0,
    },
    types: {
      injuries: totalsFor.total_injuries || 0,
      skin_disorders: totalsFor.total_skin_disorders || 0,
      respiratory: totalsFor.total_respiratory || 0,
      poisonings: totalsFor.total_poisonings || 0,
      hearing_loss: totalsFor.total_hearing_loss || 0,
      other_illnesses: totalsFor.total_other_illnesses || 0,
    },
    metrics,
    certification: snapshot
      ? {
          id: snapshot.certification_id,
          signed_at: snapshot.signed_at,
          affirmation_text: snapshot.affirmation_text,
          certifier_title_key: snapshot.certifier_title_key,
          certifier_title_label: snapshot.certifier_title_label,
          certifier_name: snapshot.certifier_name,
          certifier_initials: snapshot.certifier_initials,
        }
      : null,
    snapshot: snapshot ? { has_snapshot: true, snapshot_id: snapshot.id, case_count: JSON.parse(snapshot.case_ids_snapshot || '[]').length } : { has_snapshot: false },
    affirmation_text: OSHA_300A_AFFIRMATION_TEXT,
    certifier_title_options: CERTIFIER_TITLE_OPTIONS,
  });
});

// WI-02: ITA designation lookup per 29 CFR 1904.41 (a)(1)(i)/(ii) + (a)(2).
// GET /reports/osha-300a/ita-designation?site_id=X[&employees=N]
// Surfaces whether the establishment must e-submit to OSHA.
router.get('/osha-300a/ita-designation', (req, res) => {
  const { site_id, employees } = req.query;
  if (!site_id) return res.status(400).json({ error: 'site_id is required' });
  const site = db.prepare('SELECT id, name, naics_code, annual_avg_employees FROM sites WHERE id = ? AND org_id = ?')
    .get(Number(site_id), req.user.org_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });
  // employees override (query param) lets the FE preview "what if our
  // headcount jumps to X"; default is the live work_hours / sites
  // figure used elsewhere.
  let employeeCount = employees ? Number(employees) : site.annual_avg_employees;
  if (!employeeCount) {
    const m = calculateMetrics(site.id);
    employeeCount = m.annualAvgEmployees || 0;
  }
  const result = itaDesignation(site.naics_code, employeeCount);
  res.json({
    site: { id: site.id, name: site.name, naics_code: site.naics_code },
    annual_avg_employees: employeeCount,
    designation: result,
    next_submission_deadline: result.required
      ? `March 2, ${new Date().getFullYear() + 1} — covering CY ${new Date().getFullYear()} per 29 CFR 1904.41(c)`
      : null,
  });
});

// 300A annual sign-off per 29 CFR 1904.32. Elevated roles only.
// Body: { site_id, year, typed_name, certifier_title_key }
//   - typed_name must match the user's account name (case-insensitive
//     trim) — the OSHA-style "wet signature" stand-in.
//   - certifier_title_key must be one of the 4 keys per 1904.32(b)(4)
//     (owner / corporate_officer / highest_ranking_official /
//     immediate_supervisor_of_highest_ranking). Pre-WI-02 callers can
//     also pass a `certifier_title` legacy field, which is treated as a
//     candidate key for backward compatibility.
// Atomic: creates the regulatory_certifications row AND an
// osha_300a_certified_summaries snapshot (WI-02 / 1904.32(b)(5)) in a
// single tx. The snapshot freezes the column totals that were certified
// against, so future 300 Log edits cannot retroactively alter the
// posted summary.
router.post('/osha-300a/certify', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Only an elevated role can certify the 300A summary.' });
  }
  const { site_id, year, typed_name } = req.body || {};
  const certifierTitleKey = req.body?.certifier_title_key || req.body?.certifier_title;
  if (!site_id || !year || !typed_name || !certifierTitleKey) {
    return res.status(400).json({
      error: 'site_id, year, typed_name, and certifier_title_key are required.',
      allowed_certifier_title_keys: CERTIFIER_TITLE_OPTIONS.map(o => o.key),
    });
  }

  // 1904.32(b)(4) allowlist gate. Fail loud rather than store free-text
  // titles that would defeat the dropdown contract.
  const allowedKeys = new Set(CERTIFIER_TITLE_OPTIONS.map(o => o.key));
  if (!allowedKeys.has(certifierTitleKey)) {
    return res.status(400).json({
      error: `certifier_title_key must be one of ${[...allowedKeys].join(', ')} per 29 CFR 1904.32(b)(4).`,
    });
  }

  const site = db.prepare('SELECT * FROM sites WHERE id = ? AND org_id = ?')
    .get(Number(site_id), req.user.org_id);
  if (!site) return res.status(404).json({ error: 'Site not found in your organization.' });

  // Typed-name match (loose case-insensitive trim).
  const expected = (req.user.name || '').trim().toLowerCase();
  const actual = (typed_name || '').trim().toLowerCase();
  if (!expected || expected !== actual) {
    return res.status(400).json({
      error: `Typed name must match your account name on file: "${req.user.name}".`,
    });
  }

  // Pre-check: already certified? Return 409 BEFORE running the
  // aggregation + snapshot work. The partial UNIQUE on
  // regulatory_certifications + the UNIQUE on osha_300a_certified_summaries
  // would catch this anyway, but the upfront check gives a cleaner error.
  const existing = db.prepare(`
    SELECT id FROM regulatory_certifications WHERE type='osha_300a' AND site_id=? AND period_year=?
  `).get(Number(site_id), Number(year));
  if (existing) {
    return res.status(409).json({ error: `300A for ${site.name} ${year} is already signed.` });
  }

  // Aggregate the live 300 Log + read employee count / hours from the
  // metrics service. These values get frozen onto the snapshot.
  const orgId = req.user.org_id;
  const totals = aggregate300A({ orgId, siteId: site.id, periodYear: Number(year) });
  const metrics = calculateMetrics(site.id, Number(year));
  const annualAvgEmployees = metrics.annualAvgEmployees || site.annual_avg_employees || 0;
  const totalHoursWorked = metrics.totalHoursWorked || 0;

  const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;
  const userAgent = req.headers['user-agent'] || null;

  let snapshotIds;
  try {
    snapshotIds = createCertifiedSnapshot({
      orgId,
      siteId: site.id,
      periodYear: Number(year),
      certifierUserId: req.user.id,
      certifierTitleKey,
      ipAddress, userAgent,
      establishmentName: site.name,
      establishmentAddress: site.address,
      naicsCode: site.naics_code,
      ein: req.body?.ein || null,
      annualAvgEmployees,
      totalHoursWorked,
      totals,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    throw err;
  }

  writeActivity({
    org_id: orgId,
    entity_type: 'system',
    entity_id: null,
    action: 'osha_300a_signed',
    description: `signed OSHA 300A for ${site.name} (CY ${year}) as "${certifierTitleKey}"`,
    user_id: req.user.id,
    metadata: {
      certification_id: snapshotIds.certification_id,
      snapshot_id: snapshotIds.snapshot_id,
      site_id: site.id,
      period_year: Number(year),
      certifier_title_key: certifierTitleKey,
      case_count: totals.case_ids_snapshot.length,
    },
    ip: ipAddress,
    user_agent: userAgent,
  });

  const snapshot = getCertifiedSnapshot(orgId, site.id, Number(year));
  res.status(201).json(snapshot);
});

router.post('/osha-300', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Only elevated roles can create manual 300 log entries.' });
  }
  const { site_id, employee_name, job_title, injury_date, location, description,
    classification, days_away_count, days_restricted_count, injury_type, is_privacy_case } = req.body;

  if (!site_id || !employee_name || !injury_date) {
    return res.status(400).json({ error: 'site_id, employee_name, and injury_date are required.' });
  }

  const site = db.prepare('SELECT id FROM sites WHERE id = ? AND org_id = ?').get(Number(site_id), req.user.org_id);
  if (!site) return res.status(404).json({ error: 'Site not found in your organization.' });

  const year = new Date(injury_date).getFullYear();
  const maxCase = db.prepare('SELECT MAX(case_number) as m FROM osha_300_log WHERE site_id = ? AND calendar_year = ?').get(Number(site_id), year);
  const caseNum = (maxCase?.m || 0) + 1;

  const cls = classification || 'other_recordable';

  const result = db.prepare(`
    INSERT INTO osha_300_log (org_id, site_id, incident_id, calendar_year, case_number,
      employee_name, job_title, injury_date, location, description,
      classification_death, classification_days_away, classification_job_transfer, classification_other,
      days_away_count, days_restricted_count, injury_type, is_privacy_case)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.org_id, Number(site_id), year, caseNum,
    employee_name, job_title || null, injury_date, location || null, description || null,
    cls === 'death' ? 1 : 0,
    cls === 'days_away' ? 1 : 0,
    cls === 'job_transfer' ? 1 : 0,
    cls === 'other_recordable' ? 1 : 0,
    Number(days_away_count) || 0, Number(days_restricted_count) || 0,
    injury_type || null, is_privacy_case ? 1 : 0,
  );

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'system',
    entity_id: null,
    action: 'osha_300_manual_entry',
    description: `manually added case #${caseNum} to OSHA 300 log for CY ${year}`,
    user_id: req.user.id,
    metadata: { osha_300_log_id: result.lastInsertRowid, site_id: Number(site_id), year },
    ...auditCtx(req),
  });

  const entry = db.prepare('SELECT * FROM osha_300_log WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(entry);
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

  // WI-A multi-person: the primary affected_person + their first injury take
  // precedence over the legacy type_data.injured_person JSON when present.
  // Pre-WI-A incidents (and any post-WI-A incident still using the legacy
  // shape) fall back to type_data.
  const persons = listAffectedPersons({ orgId: req.user.org_id, incidentId: incident.id });
  const primaryAp = persons.find(p => p.is_primary === 1) || persons[0] || null;
  const primaryInj = primaryAp?.injuries?.[0] || null;

  if (req.query.format === 'pdf') {
    // Form 301 is per-recordable case per 29 CFR 1904.29(b)(2). We don't
    // hard-block non-recordable PDFs (the FE hides the button instead) so
    // an inspector can still pull a "draft" 301 if needed during triage.

    // Build the renderer payload from the same shape the JSON branch
    // returns below — keeps the two surfaces in lockstep.
    const employee = {
      name: primaryAp?.name || td.injured_person?.name || td.affected_person?.name || '',
      address: primaryAp?.address || td.injured_person?.address || '',
      dob: primaryAp?.dob || td.injured_person?.dob || td.affected_person?.dob || '',
      hire_date: primaryAp?.date_hired || td.injured_person?.date_hired || td.injured_person?.hire_date || '',
      gender: primaryAp?.gender || td.injured_person?.gender || td.affected_person?.gender || '',
    };
    const physician = {
      name: primaryInj?.physician_name || td.physician_name || '',
      facility_name: primaryInj?.physician_facility || td.facility_name || '',
      facility_address: td.facility_address || '',
    };
    const caseInfo = {
      event_date: incident.incident_datetime,
      time_began_work: td.time_began_work || null,
      activity_before: td.activity_before || td.task_at_time || '',
      what_happened: incident.description || incident.title || '',
      description: incident.description || '',
      injury_summary: [
        (primaryInj?.body_part || (td.body_parts || []).join(', ')) || '',
        primaryInj?.injury_type || td.injury_type || td.illness_category || '',
      ].filter(Boolean).join(' — '),
      object_substance: primaryInj?.object_substance || td.object_substance || td.substance?.name || '',
      date_of_death: primaryInj?.date_of_death || incident.osha_date_of_death || '',
    };
    const completedBy = {
      name: req.user.name || '',
      title: req.user.role || '',
      phone: '',
      date: new Date().toISOString().slice(0, 10),
    };

    const year = incident.incident_datetime
      ? new Date(incident.incident_datetime).getFullYear()
      : new Date().getFullYear();
    const filename = `osha-301-${(incident.incident_number || incident.id).toString().replace(/[^A-Za-z0-9_.-]/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    writeActivity({
      org_id: req.user.org_id,
      entity_type: 'incident',
      entity_id: incident.id,
      action: 'osha_301_pdf_downloaded',
      description: `downloaded OSHA 301 PDF for incident ${incident.incident_number}`,
      user_id: req.user.id,
      metadata: {
        incident_id: incident.id,
        case_number: logEntry?.case_number || null,
        osha_recordable: incident.osha_recordable || 0,
      },
      ...auditCtx(req),
    });

    return renderOsha301Pdf(res, {
      incidentNumber: incident.incident_number,
      year,
      caseNumber: logEntry?.case_number,
      employee,
      physician,
      erTreated: primaryInj?.er_treated ?? incident.er_treated ?? null,
      hospitalized: primaryInj?.hospitalized ?? incident.hospitalized ?? null,
      case: caseInfo,
      completedBy,
    });
  }

  res.json({
    incident_number: incident.incident_number,
    case_number: logEntry?.case_number,
    employee: {
      name: td.injured_person?.name || td.affected_person?.name || '',
      job_title: td.injured_person?.job_title || td.affected_person?.job_title || '',
      department: td.injured_person?.department || incident.department || '',
      // Regulatory identity fields per 29 CFR 1904.29.
      // date_hired is the canonical key (wizard + affected_persons table);
      // hire_date kept as legacy fallback for any pre-wizard-rewrite data.
      dob: td.injured_person?.dob || td.affected_person?.dob || '',
      gender: td.injured_person?.gender || td.affected_person?.gender || '',
      hire_date: td.injured_person?.date_hired || td.injured_person?.hire_date || '',
      address: td.injured_person?.address || '',
      phone: td.injured_person?.phone || '',
    },
    incident: {
      date: incident.incident_datetime,
      location: `${incident.area || ''} ${incident.specific_location || ''}`.trim(),
      site: incident.site_name,
      site_address: incident.site_address,
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
    physician: {
      name: td.physician_name || '',
      phone: td.physician_phone || '',
      facility_name: td.facility_name || '',
      facility_address: td.facility_address || '',
    },
    er_treated: incident.er_treated || 0,
    hospitalized: incident.hospitalized || 0,
    hospitalization_date: incident.hospitalization_date || '',
    work_related: incident.osha_work_related || '',
    type_data: td,
  });
});

// ===================================================================
// OSHA 1904.39 severe-injury notifications (WI-07)
//
// Rows are auto-created on POST /incidents when evaluateSevereInjury()
// detects one of the four reportable categories — see
// services/osha_severe.js and the hook in routes/incidents.js.
// These endpoints expose the per-incident list and the phone-notified
// write path that discharges the obligation.
// ===================================================================

// GET /reports/osha-severe/:incidentId — list all severe-notification
// rows for this incident (zero or more, one per reportable category).
// Returns 404 if the incident isn't in the caller's org.
router.get('/osha-severe/:incidentId', (req, res) => {
  const inc = db.prepare('SELECT id FROM incidents WHERE id = ? AND org_id = ?')
    .get(Number(req.params.incidentId), req.user.org_id);
  if (!inc) return res.status(404).json({ error: 'Incident not found' });
  const rows = listSevereNotificationsForIncident(req.user.org_id, inc.id);
  res.json({ notifications: rows });
});

// POST /reports/osha-severe/:notificationId/phone-notified — log the
// 1904.39(a)(3) phone call discharging the obligation.
// Body: { area_office, osha_reference, notes }
// All fields optional. Captures who, when, which office, OSHA's case
// reference. Idempotent — re-posting a notification that's already
// submitted returns 200 with the unchanged row.
router.post('/osha-severe/:notificationId/phone-notified', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Only elevated roles can log a regulatory phone notification.' });
  }
  const id = Number(req.params.notificationId);
  const existing = getSevereNotification(req.user.org_id, id);
  if (!existing) return res.status(404).json({ error: 'Severe notification not found' });

  const { area_office, osha_reference, notes } = req.body || {};
  const wasUnsubmitted = !existing.phone_notified_at;
  const updated = logPhoneNotification({
    orgId: req.user.org_id,
    notificationId: id,
    userId: req.user.id,
    areaOffice: area_office,
    oshaReference: osha_reference,
    notes,
  });

  if (wasUnsubmitted) {
    writeActivity({
      org_id: req.user.org_id,
      entity_type: 'incident',
      entity_id: existing.incident_id,
      action: 'osha_severe_phone_notified',
      description: `logged OSHA 1904.39 phone notification (${existing.category}) — deadline ${existing.deadline_at}`,
      user_id: req.user.id,
      metadata: {
        severe_notification_id: id,
        category: existing.category,
        area_office: area_office || null,
        osha_reference: osha_reference || null,
      },
      ...auditCtx(req),
    });
  }

  res.json(updated);
});

// ===================================================================
// SafeWork NSW notifications (WI-06) — WHS Act 2011 (NSW) Part 3
//
// Rows are auto-created on POST /incidents (and PATCH) when
// evaluateSafeworkNsw classifies the event as notifiable. These
// endpoints expose the per-incident view + the lifecycle write paths.
//
// Compliance-framework gating: all routes require the caller's org
// to list `safework_nsw` in compliance_frameworks. Otherwise 403.
// ===================================================================

function isNswOrg(req) {
  const frameworks = req.user?.compliance_frameworks;
  if (!Array.isArray(frameworks)) return false;
  return frameworks.includes('safework_nsw');
}

function requireNswOrg(req, res) {
  if (!isNswOrg(req)) {
    res.status(403).json({ error: 'SafeWork NSW reporting is not enabled for your organization.' });
    return false;
  }
  return true;
}

// GET /reports/safework-nsw/lookups — both enum tables for the
// wizard / FE pickers. Returns verbatim Act labels + section refs.
router.get('/safework-nsw/lookups', (req, res) => {
  if (!requireNswOrg(req, res)) return;
  res.json({
    serious_injury_types: listSeriousInjuryTypes(),
    dangerous_incident_types: listDangerousIncidentTypes(),
  });
});

// GET /reports/safework-nsw — list all notifications for the caller's
// org (optionally filtered by site / year). Mirrors GET /reports/riddor.
router.get('/safework-nsw', (req, res) => {
  if (!requireNswOrg(req, res)) return;
  const { site_id, year } = req.query;
  const rows = listNswForOrg(req.user.org_id, { siteId: site_id, year });
  res.json({ notifications: rows, year: year ? Number(year) : null });
});

// GET /reports/safework-nsw/:incidentId — single notification row.
router.get('/safework-nsw/:incidentId', (req, res) => {
  if (!requireNswOrg(req, res)) return;
  const inc = db.prepare('SELECT id FROM incidents WHERE id = ? AND org_id = ?')
    .get(Number(req.params.incidentId), req.user.org_id);
  if (!inc) return res.status(404).json({ error: 'Incident not found' });
  const row = getNswForIncident(req.user.org_id, inc.id);
  if (!row) return res.status(404).json({ error: 'No SafeWork NSW notification for this incident' });
  res.json(row);
});

// POST /reports/safework-nsw/:notificationId/phone-notified — log the
// s.38(1)/(3)/(4) phone call. Elevated-only. Idempotent.
router.post('/safework-nsw/:notificationId/phone-notified', (req, res) => {
  if (!requireNswOrg(req, res)) return;
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Only elevated roles can log a regulatory phone notification.' });
  }
  const id = Number(req.params.notificationId);
  const existing = db.prepare('SELECT * FROM safework_nsw_notifications WHERE id = ? AND org_id = ?')
    .get(id, req.user.org_id);
  if (!existing) return res.status(404).json({ error: 'SafeWork NSW notification not found' });

  const { regulator_office, notes } = req.body || {};
  const wasUnsubmitted = !existing.phone_notified_at;
  const updated = logNswPhone({
    orgId: req.user.org_id, notificationId: id, userId: req.user.id,
    regulatorOffice: regulator_office, notes,
  });

  if (wasUnsubmitted) {
    writeActivity({
      org_id: req.user.org_id,
      entity_type: 'incident',
      entity_id: existing.incident_id,
      action: 'safework_nsw_phone_notified',
      description: `logged SafeWork NSW phone notification (${existing.nsw_number}) per WHS Act s.38(1)`,
      user_id: req.user.id,
      metadata: {
        nsw_notification_id: id,
        nsw_number: existing.nsw_number,
        regulator_office: regulator_office || null,
      },
      ...auditCtx(req),
    });
  }
  res.json(updated);
});

// POST /reports/safework-nsw/:notificationId/regulator-requested-written
// — log the s.38(4)(b) "regulator requests written notice" event.
// This is what starts the 48h written-deadline clock. Body may carry
// an explicit `requested_at` ISO timestamp (defaults to now).
router.post('/safework-nsw/:notificationId/regulator-requested-written', (req, res) => {
  if (!requireNswOrg(req, res)) return;
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Only elevated roles can log a regulator request.' });
  }
  const id = Number(req.params.notificationId);
  const existing = db.prepare('SELECT * FROM safework_nsw_notifications WHERE id = ? AND org_id = ?')
    .get(id, req.user.org_id);
  if (!existing) return res.status(404).json({ error: 'SafeWork NSW notification not found' });

  const wasNotRequested = !existing.regulator_requested_written_at;
  const updated = logNswRegulatorRequested({
    orgId: req.user.org_id, notificationId: id, userId: req.user.id,
    requestedAtIso: req.body?.requested_at,
  });
  if (wasNotRequested) {
    writeActivity({
      org_id: req.user.org_id,
      entity_type: 'incident',
      entity_id: existing.incident_id,
      action: 'safework_nsw_regulator_requested_written',
      description: `regulator requested written notice for ${existing.nsw_number} — 48h deadline starts now (s.38(4)(b))`,
      user_id: req.user.id,
      metadata: {
        nsw_notification_id: id,
        nsw_number: existing.nsw_number,
        written_deadline: updated.written_deadline,
      },
      ...auditCtx(req),
    });
  }
  res.json(updated);
});

// POST /reports/safework-nsw/:notificationId/written-submitted — log
// the submission of the s.38(5) written notice. Elevated-only.
router.post('/safework-nsw/:notificationId/written-submitted', (req, res) => {
  if (!requireNswOrg(req, res)) return;
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Only elevated roles can log a written submission.' });
  }
  const id = Number(req.params.notificationId);
  const existing = db.prepare('SELECT * FROM safework_nsw_notifications WHERE id = ? AND org_id = ?')
    .get(id, req.user.org_id);
  if (!existing) return res.status(404).json({ error: 'SafeWork NSW notification not found' });

  const { reference, notes } = req.body || {};
  const wasUnsubmitted = !existing.written_submitted_at;
  const updated = logNswWrittenSubmitted({
    orgId: req.user.org_id, notificationId: id, userId: req.user.id,
    reference, notes,
  });
  if (wasUnsubmitted) {
    writeActivity({
      org_id: req.user.org_id,
      entity_type: 'incident',
      entity_id: existing.incident_id,
      action: 'safework_nsw_written_submitted',
      description: `submitted SafeWork NSW written notice for ${existing.nsw_number} (s.38(5))`,
      user_id: req.user.id,
      metadata: {
        nsw_notification_id: id,
        nsw_number: existing.nsw_number,
        reference: reference || null,
      },
      ...auditCtx(req),
    });
  }
  res.json(updated);
});

// POST /reports/safework-nsw/:notificationId/site-preservation — log
// the s.39 site-preservation status + any permitted disturbance basis.
router.post('/safework-nsw/:notificationId/site-preservation', (req, res) => {
  if (!requireNswOrg(req, res)) return;
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Only elevated roles can update site preservation.' });
  }
  const id = Number(req.params.notificationId);
  const existing = db.prepare('SELECT * FROM safework_nsw_notifications WHERE id = ? AND org_id = ?')
    .get(id, req.user.org_id);
  if (!existing) return res.status(404).json({ error: 'SafeWork NSW notification not found' });

  const { status, notes, inspector_arrived_at } = req.body || {};
  const ALLOWED = new Set([
    'preserved',
    'disturbed_to_assist_injured',
    'disturbed_to_remove_deceased',
    'disturbed_to_make_safe',
    'disturbed_for_police',
    'disturbed_with_inspector_permission',
    'released_by_inspector',
  ]);
  if (status && !ALLOWED.has(status)) {
    return res.status(400).json({ error: `Invalid site_preservation_status. Allowed values: ${[...ALLOWED].join(', ')}` });
  }
  const updated = setNswSitePreservation({
    orgId: req.user.org_id, notificationId: id, status, notes,
    inspectorArrivedAt: inspector_arrived_at,
  });
  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'incident',
    entity_id: existing.incident_id,
    action: 'safework_nsw_site_preservation_updated',
    description: `site preservation status set to '${status || '—'}' for ${existing.nsw_number} (s.39)`,
    user_id: req.user.id,
    metadata: { nsw_notification_id: id, status: status || null },
    ...auditCtx(req),
  });
  res.json(updated);
});

// POST /reports/safework-nsw/:notificationId/pcbu — set PCBU identity.
// ABN is validated via the ATO mod-89 checksum.
router.post('/safework-nsw/:notificationId/pcbu', (req, res) => {
  if (!requireNswOrg(req, res)) return;
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Only elevated roles can update PCBU details.' });
  }
  const id = Number(req.params.notificationId);
  const existing = db.prepare('SELECT * FROM safework_nsw_notifications WHERE id = ? AND org_id = ?')
    .get(id, req.user.org_id);
  if (!existing) return res.status(404).json({ error: 'SafeWork NSW notification not found' });

  const { name, abn, anzsic_code } = req.body || {};
  if (abn) {
    const v = validateAbn(abn);
    if (!v.ok) {
      return res.status(400).json({ error: `Invalid ABN — ${v.reason}.`, abn_validation: v });
    }
  }
  if (anzsic_code !== undefined && anzsic_code !== null && anzsic_code !== '') {
    if (!/^\d{4}$/.test(String(anzsic_code))) {
      return res.status(400).json({ error: 'ANZSIC code must be 4 digits.' });
    }
  }
  const updated = setNswPcbu({
    orgId: req.user.org_id, notificationId: id,
    name, abn: abn ? validateAbn(abn).normalized : null, anzsicCode: anzsic_code,
  });
  res.json(updated);
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

// ---------------------------------------------------------------------------
// Audit-log export (P3-A1 chunk 3)
//
// Internal forensic trail surface for the EHS manager. Not "submitted to the
// authority" automatically — the manager downloads the CSV and includes it in
// whatever submission an inspector requests. The export itself is logged
// (action='audit_log_exported') so the chain of custody is provable: who
// pulled which slice, when, with what filters.
// ---------------------------------------------------------------------------

// Resolve a human-readable entity number (e.g. "INC-2026-0150", "CAPA-048")
// to {entity_type, entity_id}. Returns null if the prefix is unrecognized
// or the row doesn't exist in the org. Case-insensitive on the prefix.
function resolveEntityNumber(orgId, raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  const lookups = [
    { prefix: 'INC-',  type: 'incident',      table: 'incidents',      col: 'incident_number' },
    { prefix: 'INV-',  type: 'investigation', table: 'investigations', col: 'investigation_number' },
    { prefix: 'CAPA-', type: 'capa',          table: 'capas',          col: 'capa_number' },
    { prefix: 'AST-',  type: 'asset',         table: 'assets',         col: 'asset_number' },
    { prefix: 'DOC-',  type: 'document',      table: 'documents',      col: 'document_number' },
    { prefix: 'INS-',  type: 'inspection',    table: 'inspections',    col: 'inspection_number' },
  ];
  for (const l of lookups) {
    if (s.startsWith(l.prefix)) {
      const row = db.prepare(`SELECT id FROM ${l.table} WHERE ${l.col} = ? AND org_id = ?`).get(s, orgId);
      if (row) return { entity_type: l.type, entity_id: row.id, raw: s };
      return { entity_type: l.type, entity_id: -1, raw: s, not_found: true };
    }
  }
  return null;
}

function buildAuditWhere(orgId, query) {
  const where = ['al.org_id = ?'];
  const params = [orgId];

  // entity_number takes precedence over entity_type + entity_id when present.
  // Resolves to a (type, id) pair; if the number doesn't exist we still apply
  // a type filter and force entity_id = -1 so the result set is empty (rather
  // than silently widening to "all incidents" when the user typo'd the number).
  let resolvedType = null;
  let resolvedId = null;
  if (query.entity_number) {
    const r = resolveEntityNumber(orgId, query.entity_number);
    if (r) {
      resolvedType = r.entity_type;
      resolvedId = r.entity_id;
    } else {
      // Unrecognized prefix — fall through to whatever the user picked
      // explicitly via entity_type / entity_id.
    }
  }

  if (resolvedType) {
    where.push('al.entity_type = ?');
    params.push(resolvedType);
    if (resolvedId !== null) {
      where.push('al.entity_id = ?');
      params.push(resolvedId);
    }
  } else {
    if (query.entity_type) {
      const types = String(query.entity_type).split(',').map(s => s.trim()).filter(Boolean);
      if (types.length > 0) {
        where.push(`al.entity_type IN (${types.map(() => '?').join(',')})`);
        params.push(...types);
      }
    }
    if (query.entity_id) { where.push('al.entity_id = ?'); params.push(Number(query.entity_id)); }
  }

  // actor_id accepts a single id or a comma-separated list (FE multi-picker
  // sends e.g. actor_id=1,3 to match "everything Elena and James did").
  if (query.actor_id) {
    const ids = String(query.actor_id).split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
    if (ids.length === 1) {
      where.push('al.user_id = ?');
      params.push(ids[0]);
    } else if (ids.length > 1) {
      where.push(`al.user_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
  }
  // `action` accepts a single value or comma-separated list — multi-select
  // from the FE picker sends e.g. action=site_created,site_updated.
  if (query.action) {
    const actions = String(query.action).split(',').map(s => s.trim()).filter(Boolean);
    if (actions.length === 1) {
      where.push('al.action = ?');
      params.push(actions[0]);
    } else if (actions.length > 1) {
      where.push(`al.action IN (${actions.map(() => '?').join(',')})`);
      params.push(...actions);
    }
  }

  // `entity_action_pairs` — comma-separated 'entity_type:action' tuples.
  // Each pair is AND'd internally (entity_type AND action) and pairs are
  // OR'd. This lets the FE filter precisely "incident.created OR capa.completed"
  // without the cross-product issue that separate entity_type/action lists
  // produce when the same action name appears under multiple entity types
  // (e.g. 'created' belongs to incident, capa, AND investigation).
  if (query.entity_action_pairs) {
    const pairs = String(query.entity_action_pairs).split(',')
      .map(s => s.trim())
      .map(s => {
        const i = s.indexOf(':');
        if (i <= 0 || i === s.length - 1) return null;
        return { t: s.slice(0, i).trim(), a: s.slice(i + 1).trim() };
      })
      .filter(p => p && p.t && p.a);
    if (pairs.length > 0) {
      const orClauses = pairs.map(() => '(al.entity_type = ? AND al.action = ?)').join(' OR ');
      where.push(`(${orClauses})`);
      for (const p of pairs) { params.push(p.t, p.a); }
    }
  }
  if (query.from) { where.push('al.created_at >= ?'); params.push(query.from); }
  // `to` is treated as exclusive upper bound (so passing 2026-05-07 returns
  // everything strictly before that date — i.e., all of 2026-05-06).
  if (query.to) { where.push('al.created_at < ?'); params.push(query.to); }
  if (query.q) { where.push('al.description LIKE ?'); params.push(`%${query.q}%`); }

  return { where: where.join(' AND '), params };
}

// Catalog UNION distinct-from-DB pairs. The catalog ensures EVERY known
// action verb is filterable BEFORE the first trigger — important for an
// EHS supervisor pulling forensics on a fresh tenant or a brand-new
// action verb (e.g. "show me every CAPA closure" before any have closed).
// Pairs the BE writes that aren't in the catalog (forgot to add) still
// surface via the DB-distinct fallback so nothing is silently invisible.
//
// `count` is null for catalog-only entries (never triggered yet), >0 for
// triggered entries. FE picker can render "—" or hide the count badge
// when null.
router.get('/audit-log/actions', (req, res) => {
  if (!canSeeAudit(req.user)) {
    return res.status(403).json({ error: 'Audit log access is limited to EHS compliance roles.' });
  }
  const dbRows = db.prepare(`
    SELECT entity_type, action, COUNT(*) AS count
    FROM activity_log
    WHERE org_id = ?
    GROUP BY entity_type, action
  `).all(req.user.org_id);

  const dbByKey = new Map(
    dbRows.map(r => [`${r.entity_type}|${r.action}`, r.count])
  );

  // Start with catalog (preserves logical lifecycle ordering within entity).
  const out = [];
  const seen = new Set();
  for (const c of AUDIT_ACTIONS_CATALOG) {
    const key = `${c.entity_type}|${c.action}`;
    out.push({
      entity_type: c.entity_type,
      action: c.action,
      count: dbByKey.get(key) ?? null,
    });
    seen.add(key);
  }
  // Append any DB pairs the catalog forgot — defensive against drift.
  for (const r of dbRows) {
    const key = `${r.entity_type}|${r.action}`;
    if (!seen.has(key)) {
      out.push({ entity_type: r.entity_type, action: r.action, count: r.count });
    }
  }
  res.json({ actions: out });
});

router.get('/audit-log', (req, res) => {
  if (!canSeeAudit(req.user)) {
    return res.status(403).json({ error: 'Audit log access is limited to EHS compliance roles.' });
  }
  const orgId = req.user.org_id;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const offset = (page - 1) * limit;

  const { where, params } = buildAuditWhere(orgId, req.query);

  const total = db.prepare(`SELECT COUNT(*) as c FROM activity_log al WHERE ${where}`)
    .get(...params).c;

  const rows = db.prepare(`
    SELECT al.id, al.org_id, al.entity_type, al.entity_id, al.action, al.description,
           al.user_id, al.metadata, al.created_at,
           al.ip_address, al.user_agent, al.field_diffs,
           al.prev_hash, al.entry_hash,
           u.name AS user_name, u.initials AS user_initials, u.email AS user_email
    FROM activity_log al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE ${where}
    ORDER BY al.created_at DESC, al.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({ rows, total, page, limit });
});

// WI-C: forensic chain-integrity check. Admin-only; returns whether the
// activity_log hash chain for the caller's org verifies cleanly or where
// the first break is. Inspectors can request a run of this before pulling
// an audit-log CSV so the exported trail is provably untampered.
router.get('/audit-log/verify', (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Chain verification is admin-only.' });
  }
  const result = verifyChain(db, req.user.org_id);
  res.json(result);
});

router.get('/audit-log/export.csv', (req, res) => {
  if (!canSeeAudit(req.user)) {
    return res.status(403).json({ error: 'Audit log access is limited to EHS compliance roles.' });
  }
  const orgId = req.user.org_id;
  const { where, params } = buildAuditWhere(orgId, req.query);

  const rows = db.prepare(`
    SELECT al.id, al.created_at, al.entity_type, al.entity_id, al.action, al.description,
           al.user_id, al.metadata,
           al.ip_address, al.user_agent, al.field_diffs, al.entry_hash,
           u.name AS user_name, u.email AS user_email
    FROM activity_log al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE ${where}
    ORDER BY al.created_at DESC, al.id DESC
    LIMIT ?
  `).all(...params, AUDIT_EXPORT_HARD_LIMIT);

  // RFC 4180-ish CSV escape: wrap in quotes when the value contains a comma,
  // quote, CR, or LF; double any embedded quotes.
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };

  const header = [
    'id', 'created_at', 'entity_type', 'entity_id', 'action', 'description',
    'user_id', 'user_name', 'user_email', 'metadata',
    'ip_address', 'user_agent', 'field_diffs', 'entry_hash',
  ];

  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.id, r.created_at, r.entity_type, r.entity_id ?? '', r.action,
      r.description, r.user_id ?? '', r.user_name ?? '', r.user_email ?? '',
      r.metadata ?? '{}',
      r.ip_address ?? '', r.user_agent ?? '', r.field_diffs ?? '',
      r.entry_hash ?? '',
    ].map(escape).join(','));
  }
  // Excel-compatible: BOM for UTF-8 + CRLF row separator (matches what tools
  // ingest cleanly without "fix encoding" warnings).
  const csv = '﻿' + lines.join('\r\n') + '\r\n';

  writeActivity({
    org_id: orgId,
    entity_type: 'system',
    entity_id: null,
    action: 'audit_log_exported',
    description: `exported ${rows.length} audit-log row(s) as CSV`,
    user_id: req.user.id,
    metadata: {
      filters: req.query,
      row_count: rows.length,
      hit_hard_limit: rows.length >= AUDIT_EXPORT_HARD_LIMIT,
    },
    ...auditCtx(req),
  });

  const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

export default router;
