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

export const videoReport = (videoBlob) => {
  const form = new FormData();
  form.append('video', videoBlob, 'recording.mp4');
  return api.post('/incidents/video-report', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  }).then(r => r.data);
};

export const imageReport = (files, caption) => {
  const form = new FormData();
  files.forEach(f => form.append('images', f));
  if (caption) form.append('caption', caption);
  return api.post('/incidents/image-report', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 90000,
  }).then(r => r.data);
};

export const addIncidentNote = (id, text) =>
  api.post(`/incidents/${id}/note`, { text }).then(r => r.data);

export const addWitness = (id, data) => api.post(`/incidents/${id}/witnesses`, data).then(r => r.data);
export const updateWitness = (id, wid, data) => api.patch(`/incidents/${id}/witnesses/${wid}`, data).then(r => r.data);
export const deleteWitness = (id, wid) => api.delete(`/incidents/${id}/witnesses/${wid}`).then(r => r.data);

// WI-A multi-person CRUD. Each helper returns the canonical row shape
// (with nested injuries[] on the parent person endpoints) so callers
// can render directly without a follow-up GET.
export const getAffectedPersons = (incidentId) =>
  api.get(`/incidents/${incidentId}/affected-persons`).then(r => r.data.affected_persons);
export const createAffectedPerson = (incidentId, data) =>
  api.post(`/incidents/${incidentId}/affected-persons`, data).then(r => r.data);
export const updateAffectedPerson = (incidentId, apId, patch) =>
  api.patch(`/incidents/${incidentId}/affected-persons/${apId}`, patch).then(r => r.data);
export const deleteAffectedPerson = (incidentId, apId) =>
  api.delete(`/incidents/${incidentId}/affected-persons/${apId}`).then(r => r.data);
export const createInjury = (incidentId, apId, data) =>
  api.post(`/incidents/${incidentId}/affected-persons/${apId}/injuries`, data).then(r => r.data);
export const updateInjury = (incidentId, apId, injuryId, patch) =>
  api.patch(`/incidents/${incidentId}/affected-persons/${apId}/injuries/${injuryId}`, patch).then(r => r.data);
export const deleteInjury = (incidentId, apId, injuryId) =>
  api.delete(`/incidents/${incidentId}/affected-persons/${apId}/injuries/${injuryId}`).then(r => r.data);
