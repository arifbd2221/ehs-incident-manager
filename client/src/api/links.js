import api from './client';

export const createLink = (data) => api.post('/links', data).then(r => r.data);
export const deleteLink = (id) => api.delete(`/links/${id}`).then(r => r.data);
export const listLinks = (params) => api.get('/links', { params }).then(r => r.data.links || []);
