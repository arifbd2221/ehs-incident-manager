import api from './client';

export const getInvestigations = (params) => api.get('/investigations', { params }).then(r => r.data);
export const getInvestigation = (id) => api.get(`/investigations/${id}`).then(r => r.data);
export const updateInvestigation = (id, data) => api.patch(`/investigations/${id}`, data).then(r => r.data);
export const addFiveWhy = (id, data) => api.post(`/investigations/${id}/five-whys`, data).then(r => r.data);
export const suggestNextWhy = (id) => api.post(`/investigations/${id}/five-whys/suggest`).then(r => r.data);
export const deleteFiveWhy = (invId, whyId) => api.delete(`/investigations/${invId}/five-whys/${whyId}`).then(r => r.data);
export const addTeamMember = (id, data) => api.post(`/investigations/${id}/team`, data).then(r => r.data);
export const closeInvestigation = (id, data) => api.post(`/investigations/${id}/close`, data).then(r => r.data);
export const assignCapa = (id, data) => api.post(`/investigations/${id}/assign-capa`, data).then(r => r.data);
