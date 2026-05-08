import api from './client';

export const getIncidents = (params) => api.get('/incidents', { params }).then(r => r.data);
export const getIncident = (id) => api.get(`/incidents/${id}`).then(r => r.data);
export const createIncident = (data) => api.post('/incidents', data).then(r => r.data);
export const updateIncident = (id, data) => api.patch(`/incidents/${id}`, data).then(r => r.data);
export const assignIncident = (id, data) => api.post(`/incidents/${id}/assign`, data).then(r => r.data);
export const escalateIncident = (id, data) => api.post(`/incidents/${id}/escalate`, data).then(r => r.data);
export const closeIncident = (id, data) => api.post(`/incidents/${id}/close`, data).then(r => r.data);
export const verifyRecordability = (id, gates) => api.post(`/incidents/${id}/recordability-verify`, gates).then(r => r.data);

export const getClosureChecklist = (id) => api.get(`/incidents/${id}/closure-checklist`).then(r => r.data);
export const requestClosure = (id, data) => api.post(`/incidents/${id}/closure-request`, data).then(r => r.data);
export const approveClosure = (id, requestId, data) => api.post(`/incidents/${id}/closure-request/${requestId}/approve`, data).then(r => r.data);
export const rejectClosure = (id, requestId, data) => api.post(`/incidents/${id}/closure-request/${requestId}/reject`, data).then(r => r.data);
export const reopenIncident = (id, data) => api.post(`/incidents/${id}/reopen`, data).then(r => r.data);
export const forceCloseIncident = (id, data) => api.post(`/incidents/${id}/close`, { ...data, force: true }).then(r => r.data);

export const uploadAttachments = (entityType, entityId, files) => {
  const form = new FormData();
  form.append('entity_type', entityType);
  form.append('entity_id', entityId);
  files.forEach(f => form.append('files', f));
  return api.post('/attachments', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
};

export const deleteAttachment = (id) => api.delete(`/attachments/${id}`).then(r => r.data);

export const voiceExtract = (transcript) =>
  api.post('/incidents/voice-extract', { transcript }).then(r => r.data);

export const voiceReport = (audioBlob) => {
  const form = new FormData();
  form.append('audio', audioBlob, 'recording.webm');
  return api.post('/incidents/voice-report', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  }).then(r => r.data);
};

export const addIncidentNote = (id, text) =>
  api.post(`/incidents/${id}/note`, { text }).then(r => r.data);

export const addWitness = (id, data) => api.post(`/incidents/${id}/witnesses`, data).then(r => r.data);
export const updateWitness = (id, wid, data) => api.patch(`/incidents/${id}/witnesses/${wid}`, data).then(r => r.data);
export const deleteWitness = (id, wid) => api.delete(`/incidents/${id}/witnesses/${wid}`).then(r => r.data);
