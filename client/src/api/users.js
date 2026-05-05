import api from './client';

export const getUsers = () => api.get('/users').then(r => r.data.users || r.data);
export const getSites = () => api.get('/users/sites').then(r => r.data.sites || r.data);
