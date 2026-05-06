import api from './client';

export const getAnswerSets = () => api.get('/answer-sets').then(r => r.data);
export const createAnswerSet = (data) => api.post('/answer-sets', data).then(r => r.data);
export const updateAnswerSet = (id, data) => api.patch(`/answer-sets/${id}`, data).then(r => r.data);
export const deleteAnswerSet = (id) => api.delete(`/answer-sets/${id}`).then(r => r.data);
