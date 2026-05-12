import { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Icon from '../shared/Icon';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

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
  // Incident lifecycle
  { id: 'dashboard', path: '/', icon: 'dashboard', label: 'Dashboard', color: '#626DF9' },
  { id: 'incidents', path: '/incidents', icon: 'incidents', label: 'Incidents', color: '#E53935' },
  { id: 'investigations', path: '/investigations', icon: 'investigation', label: 'Investigations', color: '#F57C00' },
  { id: 'capas', path: '/capas', icon: 'capa', label: 'CAPA', color: '#2E7D32' },
  'divider',
  // Proactive safety
  { id: 'risks', path: '/risks', icon: 'fire', label: 'Risks', color: '#E91E63' },
  { id: 'inspections', path: '/inspections', icon: 'shield', label: 'Inspections', color: '#00897B' },
  { id: 'templates', path: '/templates', icon: 'clipboard', label: 'Templates', color: '#8b5cf6' },
  'divider',
  // Asset management
  { id: 'assets', path: '/assets', icon: 'widgets', label: 'Assets', color: '#546E7A' },
  { id: 'maintenance', path: '/maintenance', icon: 'clock', label: 'Maintenance', color: '#FB8C00' },
  'divider',
  // Records & reporting
  { id: 'documents', path: '/documents', icon: 'file', label: 'Documents', color: '#1E88E5' },
  { id: 'reports', path: '/reports', icon: 'reports', label: 'Reports', color: '#5C6BC0' },
  // WI-B: Approvals queue for recordability override requests. Hidden for
  // workers via the elevatedOnly flag; the underlying endpoint already
  // returns 403 to non-elevated roles, so this is just hiding noise.
  { id: 'approvals', path: '/approvals', icon: 'shield', label: 'Approvals', color: '#ED6C02', elevatedOnly: true },
];

const SETTINGS_CHILDREN = [
  { id: 'sites', path: '/admin/sites', icon: 'factory', label: 'Sites', color: '#78909C' },
  { id: 'members', path: '/admin/members', icon: 'people', label: 'Members', color: '#9575CD' },
  { id: 'profile', path: '/profile', icon: 'person', label: 'Profile', color: '#78909C' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sidebarOpen, setSidebarOpen } = useApp();
  const { user } = useAuth();
  const isElevated = ELEVATED_ROLES.has(user?.role);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);

  const toggleSettings = () => {
    setSettingsOpen(o => {
      if (!o) {
        setTimeout(() => settingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 260);
      }
      return !o;
    });
  };

  // Hide elevatedOnly nav items for worker-role users. Dividers are
  // strings, not objects, so they fall through the filter unchanged.
  const visibleNav = NAV.filter(item =>
    typeof item === 'string' || !item.elevatedOnly || isElevated,
  );

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const settingsActive = SETTINGS_CHILDREN.some(c => isActive(c.path));

  const go = (path) => {
    navigate(path);
    setSidebarOpen(false);
  };

  return (
    <>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
        <AnimatedLogo />
        {visibleNav.map((it, i) => it === 'divider' ? (
          <div key={`div-${i}`} className="nav-divider" />
        ) : (
          <div key={it.id} className={`nav-item ${isActive(it.path) ? 'active' : ''}`} style={{ '--nav-color': it.color }} onClick={() => go(it.path)}>
            <Icon name={it.icon} size={22} />
            <div className="lbl">{it.label}</div>
          </div>
        ))}
        <div className="nav-settings-group" ref={settingsRef}>
          <div
            className={`nav-item ${settingsActive && !settingsOpen ? 'active' : ''} ${settingsOpen ? 'settings-expanded' : ''}`}
            style={{ '--nav-color': '#78909C' }}
            onClick={toggleSettings}
            aria-expanded={settingsOpen}
          >
            <Icon name="tune" size={22} />
            <div className="lbl">Settings</div>
            <span className={`nav-settings-chevron ${settingsOpen ? 'open' : ''}`}>
              <Icon name="arrow" size={10} />
            </span>
          </div>
          <div className={`nav-settings-panel ${settingsOpen ? 'open' : ''}`}>
            <div className="nav-settings-inner">
              {SETTINGS_CHILDREN.map(it => (
                <div key={it.id} className={`nav-item nav-sub-item ${isActive(it.path) ? 'active' : ''}`} style={{ '--nav-color': it.color }} onClick={() => go(it.path)}>
                  <Icon name={it.icon} size={18} />
                  <div className="lbl">{it.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
