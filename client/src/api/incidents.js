import api from './client';

export const getIncidents = (params) => api.get('/incidents', { params }).then(r => r.data);
export const getIncident = (id) => api.get(`/incidents/${id}`).then(r => r.data);
export const createIncident = (data) => api.post('/incidents', data).then(r => r.data);
export const updateIncident = (id, data) => api.patch(`/incidents/${id}`, data).then(r => r.data);
export const assignIncident = (id, data) => api.post(`/incidents/${id}/assign`, data).then(r => r.data);
export const escalateIncident = (id, data) => api.post(`/incidents/${id}/escalate`, data).then(r => r.data);
export const closeIncident = (id, data) => api.post(`/incidents/${id}/close`, data).then(r => r.data);

export const uploadAttachments = (entityType, entityId, files) => {
  const form = new FormData();
  form.append('entity_type', entityType);
  form.append('entity_id', entityId);
  files.forEach(f => form.append('files', f));
  return api.post('/attachments', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
};
