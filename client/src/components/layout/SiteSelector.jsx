import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import Icon from '../shared/Icon';
import '../../styles/site-selector.css';

export default function SiteSelector() {
  const { activeSiteId, setActiveSiteId, sites } = useApp();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [hlIdx, setHlIdx] = useState(-1);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const searchRef = useRef(null);

  const hidden = !sites || sites.length < 2;
  const showSearch = !hidden && sites.length > 5;

  const close = useCallback(() => setOpen(false), []);

  const select = useCallback((id) => {
    setActiveSiteId(id);
    setOpen(false);
  }, [setActiveSiteId]);

  useEffect(() => {
    if (open && showSearch && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open, showSearch]);

  if (hidden) return null;

  const activeSite = sites.find(s => s.id === activeSiteId);
  const filtered = search.trim()
    ? sites.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    : sites;

  const allOptions = [{ id: null, name: 'All Sites', isAll: true }, ...filtered];

  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: rect.left });
    }
    setSearch('');
    setHlIdx(-1);
    setOpen(true);
  };

  const handleKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHlIdx(i => (i + 1) % allOptions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHlIdx(i => (i - 1 + allOptions.length) % allOptions.length);
    } else if (e.key === 'Enter' && hlIdx >= 0 && hlIdx < allOptions.length) {
      e.preventDefault();
      select(allOptions[hlIdx].id);
    }
  };

  const isActive = activeSiteId !== null;

  return (
    <div className="ss-wrap">
      <button
        ref={triggerRef}
        className={`ss-trigger${isActive ? ' ss-active' : ''}${open ? ' ss-open' : ''}`}
        onClick={() => open ? close() : openDropdown()}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {isActive && <span className="ss-dot" />}
        <span className="ss-icon">
          <Icon name="location" size={14} />
        </span>
        <span className="ss-label">{activeSite?.name || 'All Sites'}</span>
        <span className="ss-chev">
          <Icon name="arrow" size={12} />
        </span>
      </button>

      {open && createPortal(
        <>
          <div className="ss-backdrop" onClick={close} />
          <div
            className="ss-panel"
            style={{ top: pos.top, left: pos.left }}
            role="listbox"
            onKeyDown={handleKeyDown}
          >
            {showSearch && (
              <div className="ss-search">
                <div className="ss-search-inner">
                  <Icon name="search" size={13} color="var(--sds-fg-muted)" />
                  <input
                    ref={searchRef}
                    className="ss-search-input"
                    placeholder="Search sites..."
                    value={search}
                    onChange={e => { setSearch(e.target.value); setHlIdx(-1); }}
                    onKeyDown={handleKeyDown}
                  />
                </div>
              </div>
            )}
            <div className="ss-list">
              {allOptions.map((opt, i) => (
                <div key={opt.id ?? 'all'}>
                  <div
                    className={`ss-option${opt.id === activeSiteId ? ' ss-selected' : ''}${i === hlIdx ? ' ss-hl' : ''}`}
                    role="option"
                    aria-selected={opt.id === activeSiteId}
                    onClick={() => select(opt.id)}
                    onMouseEnter={() => setHlIdx(i)}
                  >
                    <span className="ss-option-icon">
                      <Icon name={opt.isAll ? 'dashboard' : 'factory'} size={15} />
                    </span>
                    <span className="ss-option-label">{opt.name}</span>
                    <span className="ss-check">
                      <Icon name="check" size={14} />
                    </span>
                  </div>
                  {opt.isAll && <div className="ss-divider" />}
                </div>
              ))}
              {filtered.length === 0 && search.trim() && (
                <div className="ss-empty">No sites match "{search}"</div>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
