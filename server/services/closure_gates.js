import db from '../db/connection.js';

export function evaluateClosureGates(incidentId, orgId) {
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(incidentId, orgId);
  if (!incident) return null;

  const track = incident.track || 'C';
  const isA = track === 'A';
  const isB = track === 'B';
  const needsCapa = isA || isB;

  // Linked investigations
  const investigations = db.prepare(
    'SELECT id, investigation_number, status, root_cause_summary FROM investigations WHERE incident_id = ? AND org_id = ?'
  ).all(incidentId, orgId);

  // All CAPAs: direct + via investigation
  const invIds = investigations.map(i => i.id);
  let capas = db.prepare(
    'SELECT id, capa_number, status, title FROM capas WHERE incident_id = ? AND org_id = ?'
  ).all(incidentId, orgId);

  if (invIds.length > 0) {
    const placeholders = invIds.map(() => '?').join(',');
    const invCapas = db.prepare(
      `SELECT id, capa_number, status, title FROM capas WHERE investigation_id IN (${placeholders}) AND org_id = ?`
    ).all(...invIds, orgId);
    const seen = new Set(capas.map(c => c.id));
    for (const c of invCapas) {
      if (!seen.has(c.id)) capas.push(c);
    }
  }

  const openCapas = capas.filter(c => c.status !== 'closed');
  const capasComplete = {
    required: needsCapa,
    passed: !needsCapa || openCapas.length === 0,
    detail: !needsCapa
      ? 'Not required for Track C'
      : openCapas.length === 0
        ? `All ${capas.length} CAPA(s) verified effective`
        : `${openCapas.length} of ${capas.length} CAPA(s) still open`,
    total: capas.length,
    closed: capas.length - openCapas.length,
    open: openCapas.map(c => ({ id: c.id, capa_number: c.capa_number, status: c.status, title: c.title })),
  };

  const allInvClosed = investigations.every(i => i.status === 'closed');
  const investigationClosed = {
    required: needsCapa && investigations.length > 0,
    passed: investigations.length === 0 || allInvClosed,
    detail: investigations.length === 0
      ? 'No investigation linked'
      : allInvClosed
        ? `Investigation${investigations.length > 1 ? 's' : ''} closed`
        : `${investigations.filter(i => i.status !== 'closed').length} investigation(s) still open`,
    investigations: investigations.map(i => ({ id: i.id, investigation_number: i.investigation_number, status: i.status })),
  };

  const hasRootCause = investigations.some(i => i.root_cause_summary && i.root_cause_summary.trim().length > 0);
  const rootCauseDocumented = {
    required: isA,
    passed: !isA || investigations.length === 0 || hasRootCause,
    detail: !isA
      ? 'Not required for this track'
      : investigations.length === 0
        ? 'No investigation — N/A'
        : hasRootCause
          ? 'Root cause documented'
          : 'Root cause summary missing from investigation',
  };

  const oshaRequired = isA && incident.osha_recordable === 1;
  let oshaExists = false;
  if (oshaRequired) {
    const row = db.prepare('SELECT id FROM osha_300_log WHERE incident_id = ?').get(incidentId);
    oshaExists = !!row;
  }
  const osha300Entry = {
    required: oshaRequired,
    passed: !oshaRequired || oshaExists,
    detail: !oshaRequired
      ? incident.osha_recordable ? 'Not required for this track' : 'Not OSHA recordable'
      : oshaExists ? 'OSHA 300 log entry exists' : 'OSHA 300 log entry missing',
  };

  const riddorRequired = isA && incident.riddor_reportable === 1;
  let riddorFiled = false;
  if (riddorRequired) {
    const row = db.prepare(
      "SELECT id FROM riddor_reports WHERE incident_id = ? AND status IN ('phone_reported','submitted')"
    ).get(incidentId);
    riddorFiled = !!row;
  }
  const riddorFiledGate = {
    required: riddorRequired,
    passed: !riddorRequired || riddorFiled,
    detail: !riddorRequired
      ? incident.riddor_reportable ? 'Not required for this track' : 'Not RIDDOR reportable'
      : riddorFiled ? 'RIDDOR report filed' : 'RIDDOR report not yet filed',
  };

  const pendingReq = db.prepare(
    "SELECT id, status, requested_by FROM closure_requests WHERE incident_id = ? AND status = 'pending'"
  ).get(incidentId);
  const approvedReq = db.prepare(
    "SELECT id FROM closure_requests WHERE incident_id = ? AND status = 'approved'"
  ).get(incidentId);
  const managerApproval = {
    required: isA,
    passed: !isA || !!approvedReq,
    detail: !isA
      ? 'Not required for this track'
      : approvedReq
        ? 'Manager approval granted'
        : pendingReq
          ? 'Closure request pending review'
          : 'No closure request submitted',
    pendingRequest: pendingReq ? { id: pendingReq.id, status: pendingReq.status } : null,
  };

  const gates = {
    capasComplete,
    investigationClosed,
    rootCauseDocumented,
    osha300Entry,
    riddorFiled: riddorFiledGate,
    managerApproval,
  };

  const prerequisitesPassed = capasComplete.passed && investigationClosed.passed &&
    rootCauseDocumented.passed && osha300Entry.passed && riddorFiledGate.passed;

  const canClose = track === 'C' || (track === 'B' && prerequisitesPassed) ||
    (track === 'A' && prerequisitesPassed && managerApproval.passed);

  return {
    track,
    canClose,
    requiresApproval: isA,
    gates,
  };
}
