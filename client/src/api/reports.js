import api from './client';

export const getOsha300 = (params) => api.get('/reports/osha-300', { params }).then(r => r.data);
export const getOsha300A = (params) => api.get('/reports/osha-300a', { params }).then(r => r.data);
export const getOsha301 = (incidentId) => api.get(`/reports/osha-301/${incidentId}`).then(r => r.data);
export const getRiddor = (params) => api.get('/reports/riddor', { params }).then(r => r.data);
export const getMetrics = (params) => api.get('/reports/metrics', { params }).then(r => r.data);
