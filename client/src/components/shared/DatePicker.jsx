import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

export default function DatePicker({ value, onChange, placeholder = 'Select date' }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) { const d = new Date(value + 'T00:00:00'); return isNaN(d) ? new Date() : d; }
    return new Date();
  });
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, flip: false });

  const updatePos = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const popH = popRef.current?.offsetHeight || 320;
    const spaceBelow = window.innerHeight - r.bottom - 10;
    const flip = spaceBelow < popH && r.top > popH;
    const top = flip ? r.top - popH - 6 : r.bottom + 6;
    let left = r.left;
    if (left + 280 > window.innerWidth) left = window.innerWidth - 290;
    if (left < 10) left = 10;
    setPos({ top, left, flip });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    requestAnimationFrame(updatePos);
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onEsc);
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open, updatePos]);

  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00');
      if (!isNaN(d)) setViewDate(d);
    }
  }, [value]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const selectDay = (d) => {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    onChange(dateStr);
    setOpen(false);
  };

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const displayValue = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  const stop = (e) => { e.stopPropagation(); e.nativeEvent?.stopImmediatePropagation(); };

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={`dp-trigger${value ? ' has-value' : ''}`}
        onClick={(e) => { stop(e); setOpen(v => !v); }}
        onMouseDown={stop}
      >
        <Icon name="clock" size={14} />
        <span className="dp-trigger-text">{displayValue || placeholder}</span>
        <span className="dp-trigger-chevron"><Icon name="arrow" size={10} /></span>
      </button>

      {open && createPortal(
        <>
          <div className="dp-backdrop" onClick={(e) => { stop(e); setOpen(false); }} onMouseDown={stop} />
          <div
            className={`dp-popover${pos.flip ? ' dp-flip' : ''}`}
            ref={popRef}
            style={{ top: pos.top, left: pos.left }}
            onClick={stop}
            onMouseDown={stop}
          >
            <div className="dp-header">
              <button type="button" className="dp-nav-btn" onClick={prevMonth}>
                <Icon name="arrowL" size={14} />
              </button>
              <span className="dp-month-label">{MONTHS[month]} {year}</span>
              <button type="button" className="dp-nav-btn" onClick={nextMonth}>
                <Icon name="arrow" size={14} />
              </button>
            </div>
            <div className="dp-weekdays">
              {DAYS.map(d => <span key={d} className="dp-weekday">{d}</span>)}
            </div>
            <div className="dp-grid">
              {cells.map((d, i) => {
                if (d === null) return <span key={`e${i}`} className="dp-cell dp-empty" />;
                const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                const isSelected = dateStr === value;
                const isToday = dateStr === todayStr;
                return (
                  <button
                    key={d}
                    type="button"
                    className={`dp-cell dp-day${isSelected ? ' dp-selected' : ''}${isToday ? ' dp-today' : ''}`}
                    onClick={() => selectDay(d)}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            {value && (
              <button type="button" className="dp-clear" onClick={() => { onChange(''); setOpen(false); }}>
                Clear date
              </button>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  );
}
