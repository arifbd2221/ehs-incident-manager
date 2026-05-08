import api from './client';

export const listSites = () => api.get('/sites').then(r => r.data.sites || []);
export const getSite = (id) => api.get(`/sites/${id}`).then(r => r.data);
export const createSite = (data) => api.post('/sites', data).then(r => r.data);
export const updateSite = (id, data) => api.patch(`/sites/${id}`, data).then(r => r.data);
export const deleteSite = (id) => api.delete(`/sites/${id}`).then(r => r.data);

export const importSites = (csv_text, mode) =>
  api.post('/sites/import', { csv_text, mode }).then(r => r.data);

export const siteImportTemplateUrl = '/api/sites/import/template.csv';

export const importWorkHours = (csv_text, mode) =>
  api.post('/work-hours/import', { csv_text, mode }).then(r => r.data);

export const workHoursImportTemplateUrl = '/api/work-hours/import/template.csv';
