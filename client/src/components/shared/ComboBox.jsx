import { useState, useRef, useEffect, useMemo, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import '../../styles/combobox.css';

export default function ComboBox({
  options = [],
  groups = null,
  value,
  onChange,
  placeholder = 'Select…',
  searchable = true,
  clearable = false,
  disabled = false,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hlIdx, setHlIdx] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const allOptions = useMemo(() => {
    if (groups) return groups.flatMap(g => g.options.map(o => ({ ...o, _group: g.label })));
    return options;
  }, [options, groups]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allOptions;
    const q = query.toLowerCase();
    return allOptions.filter(o => o.label.toLowerCase().includes(q));
  }, [allOptions, query]);

  const selectedLabel = allOptions.find(o => String(o.value) === String(value))?.label || '';

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target) &&
          listRef.current && !listRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => { setHlIdx(0); }, [filtered.length, query]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector('.cb-hl');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [hlIdx, open]);

  const pick = (opt) => {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
  };

  const handleKey = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') { setOpen(false); setQuery(''); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHlIdx(i => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHlIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && filtered[hlIdx]) { e.preventDefault(); pick(filtered[hlIdx]); }
  };

  const handleClear = (e) => { e.stopPropagation(); onChange(''); setQuery(''); };

  const [dropPos, setDropPos] = useState(null);

  const updateDropPos = useCallback(() => {
    if (!wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateDropPos();
    window.addEventListener('scroll', updateDropPos, true);
    window.addEventListener('resize', updateDropPos);
    return () => {
      window.removeEventListener('scroll', updateDropPos, true);
      window.removeEventListener('resize', updateDropPos);
    };
  }, [open, updateDropPos]);

  const openDrop = () => {
    if (disabled) return;
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const renderOpts = () => {
    if (filtered.length === 0) return <div className="cb-empty">No results</div>;

    if (groups) {
      let lastGroup = null;
      return filtered.map((opt, idx) => {
        const showGroup = opt._group !== lastGroup;
        lastGroup = opt._group;
        return (
          <Fragment key={`${opt._group}-${opt.value}`}>
            {showGroup && <div className="cb-group">{opt._group}</div>}
            <div
              className={`cb-opt ${String(opt.value) === String(value) ? 'cb-sel' : ''} ${idx === hlIdx ? 'cb-hl' : ''}`}
              onClick={() => pick(opt)}
              onMouseEnter={() => setHlIdx(idx)}
            >
              {opt.icon && <span className="cb-opt-icon">{opt.icon}</span>}
              {opt.label}
              {String(opt.value) === String(value) && <Icon name="check" size={12} />}
            </div>
          </Fragment>
        );
      });
    }

    return filtered.map((opt, idx) => (
      <div
        key={opt.value}
        className={`cb-opt ${String(opt.value) === String(value) ? 'cb-sel' : ''} ${idx === hlIdx ? 'cb-hl' : ''}`}
        onClick={() => pick(opt)}
        onMouseEnter={() => setHlIdx(idx)}
      >
        {opt.icon && <span className="cb-opt-icon">{opt.icon}</span>}
        {opt.label}
        {String(opt.value) === String(value) && <Icon name="check" size={12} />}
      </div>
    ));
  };

  return (
    <div ref={wrapRef} className={`cb ${open ? 'cb-open' : ''} ${disabled ? 'cb-disabled' : ''} ${className}`}>
      <div className="cb-trigger" onClick={openDrop}>
        {open && searchable ? (
          <input
            ref={inputRef}
            className="cb-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder={selectedLabel || placeholder}
          />
        ) : (
          <span className={`cb-label ${!value && value !== 0 ? 'cb-ph' : ''}`} onKeyDown={handleKey} tabIndex={disabled ? -1 : 0}>
            {selectedLabel || placeholder}
          </span>
        )}
        <span className="cb-icons">
          {clearable && value && !disabled && (
            <button className="cb-x" onClick={handleClear} type="button"><Icon name="close" size={10} /></button>
          )}
          <svg className="cb-chev" width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
      </div>
      {open && dropPos && createPortal(
        <div className="cb-drop" ref={listRef} style={{
          position: 'fixed',
          top: dropPos.top,
          left: dropPos.left,
          width: dropPos.width,
        }}>
          {renderOpts()}
        </div>,
        document.body
      )}
    </div>
  );
}
