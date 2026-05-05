import api from './client';

export const getDashboard = (params) => api.get('/dashboard', { params }).then(r => r.data);
