import api from './client';

export const login = (email, password) => api.post('/auth/login', { email, password }).then(r => r.data);
export const register = (data) => api.post('/auth/register', data).then(r => r.data);
export const signupOrg = (data) => api.post('/auth/signup-org', data).then(r => r.data);
export const getMe = () => api.get('/auth/me').then(r => r.data);
export const getSites = () => api.get('/auth/sites').then(r => r.data);
export const updateProfile = (data) => api.patch('/auth/profile', data).then(r => r.data);
export const changePassword = (current_password, new_password) => api.post('/auth/password', { current_password, new_password }).then(r => r.data);
export const saveDashboardLayout = (widgets) => api.put('/auth/dashboard-layout', { widgets }).then(r => r.data);
