import api from './client';

export const listDocuments = (params = {}) =>
  api.get('/documents', { params }).then(r => r.data);
export const getDocument = (id) => api.get(`/documents/${id}`).then(r => r.data);
export const uploadDocument = ({ file, name, document_type, folder_id }) => {
  const fd = new FormData();
  fd.append('file', file);
  if (name) fd.append('name', name);
  fd.append('document_type', document_type);
  if (folder_id != null) fd.append('folder_id', folder_id);
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

// Supersede with a new file. Backend writes an immutable document_versions
// row + mirrors the new file's metadata onto the documents row so the
// existing list/download paths keep serving the latest untouched.
export const createDocumentVersion = (id, { file, notes }) => {
  const fd = new FormData();
  fd.append('file', file);
  if (notes != null && notes !== '') fd.append('notes', notes);
  return api.post(`/documents/${id}/versions`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};

// Historical-file download — serves the bytes for that specific version
// (vs `/documents/:id/download` which always serves the latest).
export const downloadVersion = (id, versionId) =>
  api.get(`/documents/${id}/versions/${versionId}/download`, { responseType: 'blob' });
