import api from './client';

export const getInspections = (params = {}) => api.get('/inspections', { params }).then(r => r.data);
export const getInspectionSummary = () => api.get('/inspections/summary').then(r => r.data);
export const createInspection = (data) => api.post('/inspections', data).then(r => r.data);
export const getInspection = (id) => api.get(`/inspections/${id}`).then(r => r.data);
export const updateInspection = (id, data) => api.patch(`/inspections/${id}`, data).then(r => r.data);
export const saveInspectionItem = (id, itemKey, data) => api.put(`/inspections/${id}/items/${itemKey}`, data).then(r => r.data);
export const completeInspection = (id) => api.post(`/inspections/${id}/complete`).then(r => r.data);
export const abandonInspection = (id) => api.post(`/inspections/${id}/abandon`).then(r => r.data);
export const getInspectionReport = (id) => api.get(`/inspections/${id}/report`).then(r => r.data);
export const deleteInspection = (id) => api.delete(`/inspections/${id}`).then(r => r.data);
