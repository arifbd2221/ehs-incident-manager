import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

let _activeSiteId = null;
export function setGlobalSiteId(id) { _activeSiteId = id; }

const SITE_FILTER_EXCLUDE = [
  '/auth/', '/sites', '/templates', '/users', '/notifications',
  '/answer-sets',
];

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (_activeSiteId && config.method === 'get') {
    const path = config.url || '';
    const excluded = SITE_FILTER_EXCLUDE.some(p => path.startsWith(p));
    if (!excluded) config.params = { ...config.params, site_id: _activeSiteId };
  }
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('ehs_active_site');
      _activeSiteId = null;
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
