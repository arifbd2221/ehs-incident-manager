import { useNavigate, useLocation } from 'react-router-dom';
import Icon from '../shared/Icon';

function AnimatedLogo() {
  return (
    <div className="logo-wrap">
      <svg className="logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <g fill="#FFC93C">
          <rect className="logo-diamond logo-d1" x="14" y="14" width="14" height="14" transform="rotate(45 21 21)" />
          <rect className="logo-diamond logo-d2" x="36" y="18" width="18" height="18" transform="rotate(45 45 27)" />
          <rect className="logo-diamond logo-d3" x="58" y="14" width="14" height="14" transform="rotate(45 65 21)" />
          <rect className="logo-diamond logo-d4" x="36" y="40" width="14" height="14" transform="rotate(45 43 47)" />
        </g>
        <path className="logo-check" d="M 18 62 L 42 86 L 92 36 L 82 26 L 42 66 L 28 52 Z" fill="#626DF9" />
      </svg>
    </div>
  );
}

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
      <AnimatedLogo />
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
