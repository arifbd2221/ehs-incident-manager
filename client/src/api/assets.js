import api from './client';

export const listAssets = (params = {}) => api.get('/assets', { params }).then(r => r.data);
export const getAsset = (id) => api.get(`/assets/${id}`).then(r => r.data);
export const createAsset = (data) => api.post('/assets', data).then(r => r.data);
export const updateAsset = (id, data) => api.patch(`/assets/${id}`, data).then(r => r.data);
export const deleteAsset = (id) => api.delete(`/assets/${id}`).then(r => r.data);

export const importAssets = (csv_text, mode) =>
  api.post('/assets/import', { csv_text, mode }).then(r => r.data);

export const assetImportTemplateUrl = '/api/assets/import/template.csv';
