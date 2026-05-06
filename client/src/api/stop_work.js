import api from './client';

export const submitStopWork = (data) => api.post('/incidents/stop-work', data).then(r => r.data);
export const acknowledgeStopWork = (id) => api.post(`/incidents/${id}/stop-work-acknowledge`).then(r => r.data);
export const resolveStopWork = (id, data) => api.post(`/incidents/${id}/stop-work-resolve`, data).then(r => r.data);
export const cancelStopWork = (id, data) => api.post(`/incidents/${id}/stop-work-cancel`, data).then(r => r.data);

// Dashboard helper — fetches active stop-work incidents for the banner.
// Uses the existing /api/incidents endpoint with a status filter.
export const listActiveStopWorks = () =>
  api.get('/incidents', { params: { limit: 5 } })
    .then(r => (r.data.incidents || []).filter(
      i => i.is_imminent_danger && i.stop_work_status === 'active'
    ));
