import api from './client';

export const getRisks = (params) => api.get('/risks', { params }).then(r => r.data);
export const getRiskMatrix = (params) => api.get('/risks/matrix', { params }).then(r => r.data);
export const getRisk = (id) => api.get(`/risks/${id}`).then(r => r.data);
export const createRisk = (data) => api.post('/risks', data).then(r => r.data);
export const updateRisk = (id, data) => api.patch(`/risks/${id}`, data).then(r => r.data);
export const assessRisk = (id, data) => api.post(`/risks/${id}/assess`, data).then(r => r.data);
export const mitigateRisk = (id) => api.post(`/risks/${id}/mitigate`).then(r => r.data);
export const controlRisk = (id, data) => api.post(`/risks/${id}/control`, data).then(r => r.data);
export const acceptRisk = (id, data) => api.post(`/risks/${id}/accept`, data).then(r => r.data);
export const closeRisk = (id, data) => api.post(`/risks/${id}/close`, data).then(r => r.data);
export const addControl = (riskId, data) => api.post(`/risks/${riskId}/controls`, data).then(r => r.data);
export const updateControl = (riskId, controlId, data) => api.patch(`/risks/${riskId}/controls/${controlId}`, data).then(r => r.data);
export const deleteControl = (riskId, controlId) => api.delete(`/risks/${riskId}/controls/${controlId}`).then(r => r.data);
