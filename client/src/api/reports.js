import api from './client';

export const getOsha300 = (params) => api.get('/reports/osha-300', { params }).then(r => r.data);
export const getOsha300A = (params) => api.get('/reports/osha-300a', { params }).then(r => r.data);
export const certifyOsha300A = (data) => api.post('/reports/osha-300a/certify', data).then(r => r.data);
export const getOsha301 = (incidentId) => api.get(`/reports/osha-301/${incidentId}`).then(r => r.data);
export const getRiddor = (params) => api.get('/reports/riddor', { params }).then(r => r.data);
export const getMetrics = (params) => api.get('/reports/metrics', { params }).then(r => r.data);

// P3-A1: filterable audit-log read + CSV export.
// `getAuditLog` is JSON-paginated for the in-page preview table; the CSV
// download is triggered with the same filter shape but goes through a
// browser-level URL so the `Content-Disposition: attachment` header takes
// effect. We bundle the JWT into the URL via the axios client's interceptor —
// not possible here because <a href> bypasses axios — so the FE builds a
// short-lived blob URL via an authenticated fetch instead. See
// `downloadAuditLogCsv` in the page component.
export const getAuditLog = (params) => api.get('/reports/audit-log', { params }).then(r => r.data);
export const getAuditActions = () => api.get('/reports/audit-log/actions').then(r => r.data.actions || []);
