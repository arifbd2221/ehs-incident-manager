import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Icon from '../shared/Icon';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { getNotifications, markAllRead } from '../../api/notifications';

export default function TopBar() {
  const { user, logout } = useAuth();
  const { setWizardOpen } = useApp();
  const location = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    getNotifications({ unread: 1 }).then(data => {
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    }).catch(() => {});
  }, [location.pathname]);

  const handleMarkAllRead = () => {
    markAllRead().then(() => { setUnreadCount(0); setNotifOpen(false); });
  };

  const crumb = () => {
    const p = location.pathname;
    if (p === '/') return 'Dashboard';
    if (p.startsWith('/incidents')) return 'Incidents';
    if (p.startsWith('/investigations')) return 'Investigations';
    if (p.startsWith('/capas')) return 'CAPA';
    if (p.startsWith('/reports')) return 'Reports';
    return 'Settings';
  };

  return (
    <>
      <div className="topbar-wrap">
        <div className="search">
          <Icon name="search" size={16} />
          <input placeholder="Search incidents, investigations, CAPAs..." />
        </div>
        <div className="module-tag"><span className="pulse" />EHS Module</div>
        <div className="grow" />
        <button className="btn btn-primary btn-sm" onClick={() => setWizardOpen(true)}>
          <Icon name="plus" size={16} />Report incident
        </button>
        <button className="icon-btn" title="Help"><Icon name="help" size={20} /></button>
        <div className="notif-anchor">
          <button className={`icon-btn ${notifOpen ? 'is-open' : ''}`} title="Notifications" onClick={() => setNotifOpen(v => !v)}>
            <Icon name="bell" size={20} />
            {unreadCount > 0 && <span className="badge-count">{unreadCount}</span>}
          </button>
          {notifOpen && (
            <>
              <div className="notif-backdrop" onClick={() => setNotifOpen(false)} />
              <div className="notif-panel" role="dialog">
                <div className="notif-h">
                  <div>
                    <div className="notif-h-title">Notifications</div>
                    <div className="notif-h-sub">{unreadCount} unread</div>
                  </div>
                  <button className="btn btn-tertiary btn-sm" onClick={handleMarkAllRead}>Mark all read</button>
                </div>
                <div className="notif-list">
                  {notifications.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--sds-fg-tertiary)' }}>No notifications</div>}
                  {notifications.map(n => (
                    <div key={n.id} className={`notif-item notif-${n.severity}`}>
                      <div className="notif-icon"><Icon name="warning" size={16} /></div>
                      <div className="notif-body">
                        <div className="notif-title">{n.title}</div>
                        {n.incident_number && <div className="notif-meta">{n.incident_number}</div>}
                        <div className="notif-desc">{n.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="avatar" onClick={logout} title="Click to logout">{user?.initials || '??'}</div>
      </div>
      <div className="page-strip">
        <div className="crumbs">SDS Manager / EHS / <b>{crumb()}</b></div>
        <div className="grow" />
      </div>
    </>
  );
}
