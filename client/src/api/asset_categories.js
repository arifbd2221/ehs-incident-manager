import api from './client';

export const listAssetCategories = (params = {}) =>
  api.get('/asset-categories', { params }).then(r => r.data.categories || []);
export const createAssetCategory = (data) =>
  api.post('/asset-categories', data).then(r => r.data);
export const updateAssetCategory = (id, data) =>
  api.patch(`/asset-categories/${id}`, data).then(r => r.data);
export const deleteAssetCategory = (id) =>
  api.delete(`/asset-categories/${id}`).then(r => r.data);

export const getAssetCategory = (id) =>
  api.get(`/asset-categories/${id}`).then(r => r.data);

export const listCategoryFields = (categoryId) =>
  api.get(`/asset-categories/${categoryId}/fields`).then(r => r.data.fields || []);

export const addCategoryField = (categoryId, data) =>
  api.post(`/asset-categories/${categoryId}/fields`, data).then(r => r.data);

export const updateCategoryField = (categoryId, fieldId, data) =>
  api.patch(`/asset-categories/${categoryId}/fields/${fieldId}`, data).then(r => r.data);

export const deleteCategoryField = (categoryId, fieldId) =>
  api.delete(`/asset-categories/${categoryId}/fields/${fieldId}`).then(r => r.data);

export const reorderCategoryFields = (categoryId, orderedIds) =>
  api.put(`/asset-categories/${categoryId}/fields/order`, { order: orderedIds }).then(r => r.data);
