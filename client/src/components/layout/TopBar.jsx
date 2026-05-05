import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from '../shared/Icon';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { getNotifications, markAllRead } from '../../api/notifications';
import { globalSearch } from '../../api/search';

const CATEGORY_META = {
  incidents:      { icon: 'incidents', label: 'Incidents',      path: '/incidents' },
  investigations: { icon: 'investigation', label: 'Investigations', path: '/investigations' },
  capas:          { icon: 'capa', label: 'CAPA',              path: '/capas' },
};

const STATUS_CLS = {
  New: 'st-new', Investigating: 'st-investigating', 'Awaiting CAPA': 'st-capa', Closed: 'st-closed', Triage: 'st-triage',
  pending: 'ln-pending', progress: 'ln-progress', capa: 'ln-capa', closed: 'ln-closed',
  verify: 'kl-verify',
};

function SearchResults({ query, results, loading, activeIdx, onGo, onClose }) {
  const navigate = useNavigate();
  const groups = ['incidents', 'investigations', 'capas'];
  const flat = [];
  for (const g of groups) {
    for (const item of results[g] || []) flat.push({ ...item, _group: g });
  }
  const total = flat.length;

  const handleClick = (item) => {
    const id = item.id;
    const path = CATEGORY_META[item._group].path;
    navigate(`${path}/${id}`);
    onClose();
  };

  if (!query) return null;

  return (
    <div className="sr-panel">
      {loading && (
        <div className="sr-loading"><span className="login-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /></div>
      )}
      {!loading && total === 0 && (
        <div className="sr-empty">
          <Icon name="search" size={20} color="var(--sds-fg-tertiary)" />
          <div>No results for "<b>{query}</b>"</div>
        </div>
      )}
      {!loading && total > 0 && (
        <>
          {groups.map(g => {
            const items = results[g] || [];
            if (items.length === 0) return null;
            const meta = CATEGORY_META[g];
            return (
              <div key={g} className="sr-group">
                <div className="sr-group-h">
                  <Icon name={meta.icon} size={14} />
                  {meta.label}
                  <span className="sr-group-count">{items.length}</span>
                </div>
                {items.map(item => {
                  const idx = flat.findIndex(f => f.id === item.id && f._group === g);
                  const number = item.incident_number || item.investigation_number || item.capa_number || '';
                  const title = g === 'investigations' ? (item.incident_title || number) : (item.title || number);
                  const status = item.status || '';
                  const cls = STATUS_CLS[status] || '';
                  return (
                    <div
                      key={item.id}
                      className={`sr-item ${idx === activeIdx ? 'sr-active' : ''}`}
                      onClick={() => handleClick({ ...item, _group: g })}
                      onMouseDown={e => e.preventDefault()}
                    >
                      <span className="sr-number">{number}</span>
                      <span className="sr-title">{title}</span>
                      {status && <span className={`sr-status ${cls}`}><span className="sr-dot" />{status}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div className="sr-footer">
            <kbd>↑↓</kbd> navigate <kbd>↵</kbd> open <kbd>esc</kbd> close
          </div>
        </>
      )}
    </div>
  );
}

export default function TopBar() {
  const { user } = useAuth();
  const { setWizardOpen } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ incidents: [], investigations: [], capas: [] });
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    getNotifications({ unread: 1 }).then(data => {
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    }).catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    setQuery('');
    setSearchOpen(false);
  }, [location.pathname]);

  const doSearch = useCallback((q) => {
    if (!q.trim()) {
      setResults({ incidents: [], investigations: [], capas: [] });
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    globalSearch(q).then(r => {
      setResults(r);
      setActiveIdx(-1);
    }).finally(() => setSearchLoading(false));
  }, []);

  const handleInput = (e) => {
    const v = e.target.value;
    setQuery(v);
    setSearchOpen(true);
    setActiveIdx(-1);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 300);
  };

  const flatItems = () => {
    const flat = [];
    for (const g of ['incidents', 'investigations', 'capas']) {
      for (const item of results[g] || []) flat.push({ ...item, _group: g });
    }
    return flat;
  };

  const handleKeyDown = (e) => {
    const flat = flatItems();
    const total = flat.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => (i + 1) % Math.max(total, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => (i <= 0 ? total - 1 : i - 1));
    } else if (e.key === 'Enter' && activeIdx >= 0 && activeIdx < total) {
      e.preventDefault();
      const item = flat[activeIdx];
      navigate(`${CATEGORY_META[item._group].path}/${item.id}`);
      setSearchOpen(false);
      setQuery('');
    } else if (e.key === 'Escape') {
      setSearchOpen(false);
      e.target.blur();
    }
  };

  const closeSearch = () => { setSearchOpen(false); };

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
    if (p.startsWith('/profile')) return 'Profile';
    return 'Page';
  };

  return (
    <>
      <div className="topbar-wrap">
        <div className="search" ref={searchRef}>
          <Icon name="search" size={16} />
          <input
            placeholder="Search incidents, investigations, CAPAs..."
            value={query}
            onChange={handleInput}
            onFocus={() => { if (query) setSearchOpen(true); }}
            onKeyDown={handleKeyDown}
          />
          {searchOpen && (
            <>
              <div className="sr-backdrop" onClick={closeSearch} />
              <SearchResults
                query={query}
                results={results}
                loading={searchLoading}
                activeIdx={activeIdx}
                onClose={closeSearch}
              />
            </>
          )}
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
        <div className="avatar" onClick={() => navigate('/profile')} title="View profile">{user?.initials || '??'}</div>
      </div>
      <div className="page-strip">
        <div className="crumbs">SDS Manager / EHS / <b>{crumb()}</b></div>
        <div className="grow" />
      </div>
    </>
  );
}
