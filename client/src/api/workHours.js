// workHours.js — manual CRUD + export client for /api/work-hours.
// CSV import lives in api/sites.js for back-compat (it's wired through the
// shared ImportModal on /admin/sites).
import api from './client';

export const getWorkHours = (site_id, year) => {
  const params = year ? { site_id, year } : { site_id };
  return api.get('/work-hours', { params }).then(r => r.data.work_hours || []);
};

export const createWorkHours = (data) =>
  api.post('/work-hours', data).then(r => r.data);

export const updateWorkHours = (id, patch) =>
  api.patch(`/work-hours/${id}`, patch).then(r => r.data);

export const deleteWorkHours = (id) =>
  api.delete(`/work-hours/${id}`).then(r => r.data);

export const workHoursExportUrl = (site_id) =>
  `/api/work-hours/export.csv?site_id=${site_id}`;
