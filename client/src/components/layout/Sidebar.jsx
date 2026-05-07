import { useNavigate, useLocation } from 'react-router-dom';
import Icon from '../shared/Icon';

const NAV = [
  { id: 'dashboard', path: '/', icon: 'dashboard', label: 'Dashboard', color: '#626DF9' },
  { id: 'incidents', path: '/incidents', icon: 'incidents', label: 'Incidents', color: '#E53935' },
  { id: 'investigations', path: '/investigations', icon: 'investigation', label: 'Investigations', color: '#F57C00' },
  { id: 'capas', path: '/capas', icon: 'capa', label: 'CAPA', color: '#2E7D32' },
  { id: 'assets', path: '/assets', icon: 'gear', label: 'Assets', color: '#546E7A' },
  { id: 'documents', path: '/documents', icon: 'file', label: 'Documents', color: '#1E88E5' },
  { id: 'templates', path: '/templates', icon: 'clipboard', label: 'Templates', color: '#8b5cf6' },
  { id: 'inspections', path: '/inspections', icon: 'shield', label: 'Inspections', color: '#00897B' },
  { id: 'reports', path: '/reports', icon: 'reports', label: 'Reports', color: '#5C6BC0' },
  { id: 'sites', path: '/admin/sites', icon: 'factory', label: 'Sites', color: '#78909C' },
  { id: 'members', path: '/admin/members', icon: 'person', label: 'Members', color: '#9575CD' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="sidebar">
      <img src="/assets/sds-mark.svg" className="logo" alt="SDS Manager" />
      {NAV.map(it => (
        <div key={it.id} className={`nav-item ${isActive(it.path) ? 'active' : ''}`} style={{ '--nav-color': it.color }} onClick={() => navigate(it.path)}>
          <Icon name={it.icon} size={22} />
          <div className="lbl">{it.label}</div>
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div className={`nav-item ${isActive('/profile') ? 'active' : ''}`} style={{ '--nav-color': '#78909C' }} onClick={() => navigate('/profile')}>
        <Icon name="person" size={22} />
        <div className="lbl">Profile</div>
      </div>
    </aside>
  );
}
