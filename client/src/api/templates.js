import api from './client';

export const getTemplates = (params = {}) => api.get('/templates', { params }).then(r => r.data);
export const getTemplateSummary = () => api.get('/templates/summary').then(r => r.data);
export const createTemplate = (data) => api.post('/templates', data).then(r => r.data);
export const getTemplate = (id) => api.get(`/templates/${id}`).then(r => r.data);
export const updateTemplate = (id, data) => api.patch(`/templates/${id}`, data).then(r => r.data);
export const archiveTemplate = (id) => api.delete(`/templates/${id}`).then(r => r.data);
export const publishTemplate = (id) => api.post(`/templates/${id}/publish`).then(r => r.data);
export const updateTemplateItems = (id, data) => api.patch(`/templates/${id}/items`, data).then(r => r.data);
