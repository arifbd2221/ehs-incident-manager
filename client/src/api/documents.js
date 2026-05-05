import api from './client';

export const listDocuments = (params = {}) =>
  api.get('/documents', { params }).then(r => r.data);
export const getDocument = (id) => api.get(`/documents/${id}`).then(r => r.data);
export const uploadDocument = ({ file, name, document_type }) => {
  const fd = new FormData();
  fd.append('file', file);
  if (name) fd.append('name', name);
  fd.append('document_type', document_type);
  return api.post('/documents', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};
export const updateDocument = (id, data) =>
  api.patch(`/documents/${id}`, data).then(r => r.data);
export const deleteDocument = (id) =>
  api.delete(`/documents/${id}`).then(r => r.data);

// Download URL — uses GET /api/documents/:id/download. Browsers handle auth via the
// existing axios client; for direct anchor download we route through window.open.
export const downloadUrl = (id) => `/api/documents/${id}/download`;
