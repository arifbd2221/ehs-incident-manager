import { useNavigate, useLocation } from 'react-router-dom';
import Icon from '../shared/Icon';

const NAV = [
  { id: 'dashboard', path: '/', icon: 'dashboard', label: 'Dashboard' },
  { id: 'incidents', path: '/incidents', icon: 'incidents', label: 'Incidents' },
  { id: 'investigations', path: '/investigations', icon: 'investigation', label: 'Investigations' },
  { id: 'capas', path: '/capas', icon: 'capa', label: 'CAPA' },
  { id: 'assets', path: '/assets', icon: 'gear', label: 'Assets' },
  { id: 'reports', path: '/reports', icon: 'reports', label: 'Reports' },
  { id: 'sites', path: '/admin/sites', icon: 'factory', label: 'Sites' },
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
        <div key={it.id} className={`nav-item ${isActive(it.path) ? 'active' : ''}`} onClick={() => navigate(it.path)}>
          <Icon name={it.icon} size={22} />
          <div className="lbl">{it.label}</div>
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div className={`nav-item ${isActive('/profile') ? 'active' : ''}`} onClick={() => navigate('/profile')}>
        <Icon name="person" size={22} />
        <div className="lbl">Profile</div>
      </div>
    </aside>
  );
}
