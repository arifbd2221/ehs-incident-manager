// client/src/api/safework_nsw.js — WI-06 SafeWork NSW notifications client.
//
// All endpoints require the caller's org to list 'safework_nsw' in
// compliance_frameworks; otherwise the BE returns 403. The FE gates
// the routes that call into these via the frameworkVisibility helper
// (see client/src/utils/frameworks.js).
//
// Lifecycle write paths are idempotent — second submits on already-set
// state return the unchanged row.

import api from './client';

export const getSafeworkNswLookups = () =>
  api.get('/reports/safework-nsw/lookups').then(r => r.data);

export const getSafeworkNswForIncident = (incidentId) =>
  api.get(`/reports/safework-nsw/${incidentId}`).then(r => r.data);

export const listSafeworkNsw = (params) =>
  api.get('/reports/safework-nsw', { params }).then(r => r.data);

// s.38(1)(3)(4) phone notification — body: { regulator_office?, notes? }
export const logSafeworkNswPhoneNotified = (notificationId, data) =>
  api.post(`/reports/safework-nsw/${notificationId}/phone-notified`, data).then(r => r.data);

// s.38(4)(b) — regulator requests written notice. Starts the 48h clock.
// Optional body: { requested_at: ISO timestamp } — defaults to now.
export const logSafeworkNswRegulatorRequested = (notificationId, data) =>
  api.post(`/reports/safework-nsw/${notificationId}/regulator-requested-written`, data || {}).then(r => r.data);

// s.38(5) — written notice submitted. Body: { reference?, notes? }
export const logSafeworkNswWrittenSubmitted = (notificationId, data) =>
  api.post(`/reports/safework-nsw/${notificationId}/written-submitted`, data).then(r => r.data);

// s.39 — site preservation. Body: { status, notes?, inspector_arrived_at? }
export const setSafeworkNswSitePreservation = (notificationId, data) =>
  api.post(`/reports/safework-nsw/${notificationId}/site-preservation`, data).then(r => r.data);

// PCBU identity. Body: { name?, abn?, anzsic_code? }
// ABN is validated server-side via the ATO checksum.
export const setSafeworkNswPcbu = (notificationId, data) =>
  api.post(`/reports/safework-nsw/${notificationId}/pcbu`, data).then(r => r.data);
