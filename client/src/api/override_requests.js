// client/src/api/override_requests.js — WI-B recordability override
// approval workflow client. Backend routes in server/routes/override_requests.js.

import api from './client';

// Create a new override request against an incident's recordability field.
//   incidentId: number
//   payload: { field: 'osha_recordable' | 'riddor_reportable',
//              proposed_value: 0 | 1, reason: string }
export const createOverrideRequest = (incidentId, payload) =>
  api.post(`/incidents/${incidentId}/override-requests`, payload).then(r => r.data);

// All requests (pending + decided + withdrawn) for one incident.
export const listOverrideRequestsForIncident = (incidentId) =>
  api.get(`/incidents/${incidentId}/override-requests`).then(r => r.data);

// Global pending queue for the caller's org (elevated roles only — server
// returns 403 to workers). Used by ApprovalsPage.
export const listPendingOverrideRequests = () =>
  api.get('/override-requests', { params: { status: 'pending' } }).then(r => r.data);

export const getOverrideRequest = (rid) =>
  api.get(`/override-requests/${rid}`).then(r => r.data);

export const approveOverrideRequest = (rid, decision_note) =>
  api.post(`/override-requests/${rid}/approve`, { decision_note }).then(r => r.data);

export const rejectOverrideRequest = (rid, decision_note) =>
  api.post(`/override-requests/${rid}/reject`, { decision_note }).then(r => r.data);

export const withdrawOverrideRequest = (rid) =>
  api.post(`/override-requests/${rid}/withdraw`).then(r => r.data);
