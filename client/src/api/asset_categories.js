import api from './client';

export const listAssetCategories = (params = {}) =>
  api.get('/asset-categories', { params }).then(r => r.data.categories || []);
export const createAssetCategory = (data) =>
  api.post('/asset-categories', data).then(r => r.data);
export const updateAssetCategory = (id, data) =>
  api.patch(`/asset-categories/${id}`, data).then(r => r.data);
export const deleteAssetCategory = (id) =>
  api.delete(`/asset-categories/${id}`).then(r => r.data);
