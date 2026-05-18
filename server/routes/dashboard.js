import { Router } from 'express';
import db from '../db/connection.js';
import { calculateOrgMetrics, calculateMetrics } from '../services/metrics.js';

const router = Router();

router.get('/', (req, res) => {
  const orgId = req.user.org_id;
  const siteId = req.query.site_id ? Number(req.query.site_id) : null;

  const sc = siteId ? ' AND site_id = ?' : '';
  const sp = siteId ? [siteId] : [];

  const openIncidents = db.prepare(
    `SELECT COUNT(*) as c FROM incidents WHERE org_id = ? AND status != 'Closed'${sc}`
  ).get(orgId, ...sp).c;

  const trackCounts = db.prepare(
    `SELECT track, COUNT(*) as count FROM incidents WHERE org_id = ? AND status != 'Closed'${sc} GROUP BY track`
  ).all(orgId, ...sp);

  const overdueCAPAs = siteId
    ? db.prepare(`
        SELECT COUNT(*) as c FROM capas c2
        LEFT JOIN incidents i_src ON i_src.id = c2.incident_id
        LEFT JOIN investigations inv ON inv.id = c2.investigation_id
        LEFT JOIN incidents i_inv ON i_inv.id = inv.incident_id
        WHERE c2.org_id = ? AND c2.due_date < datetime('now') AND c2.status NOT IN ('closed')
          AND COALESCE(i_src.site_id, i_inv.site_id) = ?
      `).get(orgId, siteId).c
    : db.prepare(`
        SELECT COUNT(*) as c FROM capas WHERE org_id = ? AND due_date < datetime('now') AND status NOT IN ('closed')
      `).get(orgId).c;

  const maintenanceOverdueCount = siteId
    ? db.prepare(`
        SELECT COUNT(*) as c FROM asset_maintenance_schedules ams
        JOIN assets a ON a.id = ams.asset_id
        WHERE ams.org_id = ? AND ams.active = 1 AND ams.next_due < date('now') AND a.site_id = ?
      `).get(orgId, siteId).c
    : db.prepare(`
        SELECT COUNT(*) as c FROM asset_maintenance_schedules
        WHERE org_id = ? AND active = 1 AND next_due < date('now')
      `).get(orgId).c;

  const pmQuery = siteId
    ? `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN date(e.completed_at) <= s.scheduled_due THEN 1 ELSE 0 END) as on_time
      FROM asset_maintenance_events e
      JOIN asset_maintenance_schedules s_curr ON s_curr.id = e.schedule_id
      JOIN assets ast ON ast.id = s_curr.asset_id
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
        JOIN assets a2 ON a2.id = ms.asset_id
        WHERE e2.org_id = ? AND e2.completed_at >= date('now', '-90 days') AND a2.site_id = ?
      ) s ON s.eid = e.id
      WHERE e.org_id = ? AND e.completed_at >= date('now', '-90 days') AND ast.site_id = ?`
    : `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN date(e.completed_at) <= s.scheduled_due THEN 1 ELSE 0 END) as on_time
      FROM asset_maintenance_events e
      JOIN asset_maintenance_schedules s_curr ON s_curr.id = e.schedule_id
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
      WHERE e.org_id = ? AND e.completed_at >= date('now', '-90 days')`;

  const pmRow = siteId
    ? db.prepare(pmQuery).get(orgId, siteId, orgId, siteId)
    : db.prepare(pmQuery).get(orgId, orgId);

  const pmCompliancePct = pmRow.total > 0
    ? Math.round((pmRow.on_time / pmRow.total) * 100)
    : null;

  const incidentsByType = db.prepare(
    `SELECT type, COUNT(*) as count FROM incidents
     WHERE org_id = ? AND created_at >= datetime('now', '-30 days')${sc}
     GROUP BY type ORDER BY count DESC`
  ).all(orgId, ...sp);

  const recentIncidents = db.prepare(
    `SELECT i.*, s.name as site_name, u.name as reporter_name, u.initials as reporter_initials,
            a.name as assignee_name, a.initials as assignee_initials
     FROM incidents i
     LEFT JOIN sites s ON s.id = i.site_id
     LEFT JOIN users u ON u.id = i.reported_by
     LEFT JOIN users a ON a.id = i.assigned_to
     WHERE i.org_id = ?${siteId ? ' AND i.site_id = ?' : ''}
     ORDER BY i.created_at DESC LIMIT 5`
  ).all(orgId, ...sp);

  const recentActivity = siteId
    ? db.prepare(`
        SELECT al.*, u.name as user_name, u.initials as user_initials
        FROM activity_log al
        LEFT JOIN users u ON u.id = al.user_id
        LEFT JOIN incidents i ON al.entity_type = 'incident' AND i.id = al.entity_id
        LEFT JOIN investigations inv ON al.entity_type = 'investigation' AND inv.id = al.entity_id
        LEFT JOIN incidents inv_i ON inv_i.id = inv.incident_id
        LEFT JOIN capas cap ON al.entity_type = 'capa' AND cap.id = al.entity_id
        LEFT JOIN incidents cap_i ON cap_i.id = cap.incident_id
        LEFT JOIN inspections ins ON al.entity_type = 'inspection' AND ins.id = al.entity_id
        WHERE al.org_id = ? AND COALESCE(i.site_id, inv_i.site_id, cap_i.site_id, ins.site_id) = ?
        ORDER BY al.created_at DESC LIMIT 10
      `).all(orgId, siteId)
    : db.prepare(`
        SELECT al.*, u.name as user_name, u.initials as user_initials
        FROM activity_log al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE al.org_id = ?
        ORDER BY al.created_at DESC LIMIT 10
      `).all(orgId);

  const metrics = siteId
    ? calculateMetrics(siteId)
    : calculateOrgMetrics(orgId);

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
