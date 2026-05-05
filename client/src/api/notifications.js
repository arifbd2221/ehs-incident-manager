import api from './client';

export const getNotifications = (params) => api.get('/notifications', { params }).then(r => r.data);
export const markRead = (id) => api.patch(`/notifications/${id}/read`).then(r => r.data);
export const markAllRead = () => api.post('/notifications/mark-all-read').then(r => r.data);
