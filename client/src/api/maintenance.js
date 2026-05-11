import api from './client';

// P3-OP1 — asset maintenance schedules + events.
// Mirrors the shape of api/workHours.js (manual CRUD + a specialized
// completion endpoint). The schedule object returned by every endpoint
// carries a server-computed `status` ('ok' | 'due_soon' | 'overdue' |
// 'inactive') so the FE doesn't redo the date math.

export const listSchedules = (params = {}) =>
  api.get('/maintenance-schedules', { params }).then(r => r.data);

export const getSchedule = (id) =>
  api.get(`/maintenance-schedules/${id}`).then(r => r.data);

export const createSchedule = (data) =>
  api.post('/maintenance-schedules', data).then(r => r.data);

export const updateSchedule = (id, data) =>
  api.patch(`/maintenance-schedules/${id}`, data).then(r => r.data);

export const deleteSchedule = (id) =>
  api.delete(`/maintenance-schedules/${id}`).then(r => r.data);

// outcome: 'pass' | 'fail' | 'conditional'; notes ≤1000 chars; completed_at
// optional ISO YYYY-MM-DD (defaults server-side to today UTC).
export const completeSchedule = (id, { outcome, notes, completed_at }) =>
  api.post(`/maintenance-schedules/${id}/complete`, { outcome, notes, completed_at }).then(r => r.data);

// Body matches CAPA POST shape: title, description?, owner_id, verifier_id,
// due_date, priority?, category?. Optionally pass event_id to link the
// completion event to the new CAPA.
export const escalateToCapa = (id, body) =>
  api.post(`/maintenance-schedules/${id}/escalate-capa`, body).then(r => r.data);
