import api from './client';

export const listFolders = (params = {}) =>
  api.get('/folders', { params }).then(r => r.data.folders || []);

export const getFolder = (id) =>
  api.get(`/folders/${id}`).then(r => r.data);

export const createFolder = (data) =>
  api.post('/folders', data).then(r => r.data.folder);

export const updateFolder = (id, data) =>
  api.patch(`/folders/${id}`, data).then(r => r.data);

export const deleteFolder = (id) =>
  api.delete(`/folders/${id}`).then(r => r.data);
