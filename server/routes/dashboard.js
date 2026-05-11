import { Router } from 'express';
import db from '../db/connection.js';
import { calculateOrgMetrics } from '../services/metrics.js';

const router = Router();

router.get('/', (req, res) => {
  const orgId = req.user.org_id;

  const openIncidents = db.prepare("SELECT COUNT(*) as c FROM incidents WHERE org_id = ? AND status != 'Closed'").get(orgId).c;

  const trackCounts = db.prepare(`
    SELECT track, COUNT(*) as count FROM incidents WHERE org_id = ? AND status != 'Closed' GROUP BY track
  `).all(orgId);

  const overdueCAPAs = db.prepare(`
    SELECT COUNT(*) as c FROM capas WHERE org_id = ? AND due_date < datetime('now') AND status NOT IN ('closed')
  `).get(orgId).c;

  // Maintenance KPIs (P3-OP1). Overdue count is org-wide; pm_compliance_pct
  // is the share of last-90-day completions that landed at or before their
  // scheduled next_due. Inspectors on ISO 55001 audits ask for this exact
  // metric. NULL when there's no completion history to avoid 0%-vs-no-data
  // ambiguity.
  const maintenanceOverdueCount = db.prepare(`
    SELECT COUNT(*) as c FROM asset_maintenance_schedules
    WHERE org_id = ? AND active = 1 AND next_due < date('now')
  `).get(orgId).c;

  const pmRow = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN date(e.completed_at) <= s.scheduled_due THEN 1 ELSE 0 END) as on_time
    FROM asset_maintenance_events e
    JOIN asset_maintenance_schedules s_curr ON s_curr.id = e.schedule_id
    -- Reconstruct the next_due that was active when the event was logged: the
    -- prior event's completed_at + interval, or start_date if first event.
    JOIN (
      SELECT e2.id as eid,
        COALESCE(
          (SELECT date(prev.completed_at, '+' || ms.interval_days || ' days')
           FROM asset_maintenance_events prev
           WHERE prev.schedule_id = e2.schedule_id AND prev.completed_at < e2.completed_at
           ORDER BY prev.completed_at DESC LIMIT 1),
          ms.start_date
        ) as scheduled_due
      FROM asset_maintenance_events e2
      JOIN asset_maintenance_schedules ms ON ms.id = e2.schedule_id
      WHERE e2.org_id = ? AND e2.completed_at >= date('now', '-90 days')
    ) s ON s.eid = e.id
    WHERE e.org_id = ? AND e.completed_at >= date('now', '-90 days')
  `).get(orgId, orgId);

  const pmCompliancePct = pmRow.total > 0
    ? Math.round((pmRow.on_time / pmRow.total) * 100)
    : null;

  const incidentsByType = db.prepare(`
    SELECT type, COUNT(*) as count FROM incidents
    WHERE org_id = ? AND created_at >= datetime('now', '-30 days')
    GROUP BY type ORDER BY count DESC
  `).all(orgId);

  const recentIncidents = db.prepare(`
    SELECT i.*, s.name as site_name, u.name as reporter_name, u.initials as reporter_initials,
           a.name as assignee_name, a.initials as assignee_initials
    FROM incidents i
    LEFT JOIN sites s ON s.id = i.site_id
    LEFT JOIN users u ON u.id = i.reported_by
    LEFT JOIN users a ON a.id = i.assigned_to
    WHERE i.org_id = ?
    ORDER BY i.created_at DESC LIMIT 5
  `).all(orgId);

  const recentActivity = db.prepare(`
    SELECT al.*, u.name as user_name, u.initials as user_initials
    FROM activity_log al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE al.org_id = ?
    ORDER BY al.created_at DESC LIMIT 10
  `).all(orgId);

  // Org-wide TRIR/DART/LTIR/Severity Rate for the current calendar year.
  // Aggregated from work_hours + osha_300_log across every site the org
  // owns, divided by the OSHA 200,000-hour denominator once at the org
  // level (averaging per-site rates would weight small sites equally
  // with large sites and is not what OSHA 1904 measures).
  const metrics = calculateOrgMetrics(orgId);

  res.json({
    kpis: {
      trir: metrics.trir,
      dart: metrics.dart,
      ltir: metrics.ltir,
      severityRate: metrics.severityRate,
      totalRecordableCases: metrics.totalRecordableCases,
      dartCases: metrics.dartCases,
      daysAwayCases: metrics.daysAwayCases,
      totalDaysAway: metrics.totalDaysAway,
      totalHoursWorked: metrics.totalHoursWorked,
      sitesWithData: metrics.sitesWithData,
      siteCount: metrics.siteCount,
      openIncidents,
      overdueCAPAs,
      maintenanceOverdueCount,
      pmCompliancePct,
      pmEventsLast90: pmRow.total || 0,
      pmOnTimeLast90: pmRow.on_time || 0,
      trackCounts: Object.fromEntries(trackCounts.map(r => [r.track, r.count])),
    },
    incidentsByType,
    recentIncidents,
    recentActivity,
  });
});

export default router;
