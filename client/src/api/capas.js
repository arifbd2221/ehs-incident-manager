import api from './client';

export const getCapas = (params) => api.get('/capas', { params }).then(r => r.data);
export const getCapa = (id) => api.get(`/capas/${id}`).then(r => r.data);
export const createCapa = (data) => api.post('/capas', data).then(r => r.data);
export const createCapaFromIncident = (incidentId, data) =>
  api.post(`/incidents/${incidentId}/create-capa`, data).then(r => r.data);
export const updateCapa = (id, data) => api.patch(`/capas/${id}`, data).then(r => r.data);
export const completeCapa = (id, data) => api.post(`/capas/${id}/complete`, data).then(r => r.data);
export const verifyCapa = (id, data) => api.post(`/capas/${id}/verify`, data).then(r => r.data);
export const rejectCapa = (id, data) => api.post(`/capas/${id}/reject`, data).then(r => r.data);
