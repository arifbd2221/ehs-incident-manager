import api from './client';

export const getUsers = () => api.get('/users').then(r => r.data.users || r.data);
export const getSites = () => api.get('/users/sites').then(r => r.data.sites || r.data);
export const createUser = (data) => api.post('/users', data).then(r => r.data);
export const updateUser = (id, data) => api.patch(`/users/${id}`, data).then(r => r.data);
export const resetUserPassword = (id, new_password) =>
  api.post(`/users/${id}/password`, { new_password }).then(r => r.data);
