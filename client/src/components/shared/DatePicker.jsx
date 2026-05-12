import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_HDR = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function parseDate(value) {
  if (!value) return null;
  const raw = value.length > 10 ? value : value + 'T00:00:00';
  const d = new Date(raw);
  return isNaN(d) ? null : d;
}

function parseDatePart(value) {
  return value ? value.slice(0, 10) : '';
}

function parseTimePart(value) {
  if (!value || value.length <= 10) return '12:00';
  return value.slice(11, 16) || '12:00';
}

export default function DatePicker({ value, onChange, placeholder = 'Select date', showTime = false }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    const d = parseDate(value);
    return d || new Date();
  });
  const [time, setTime] = useState(() => parseTimePart(value));
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, flip: false });

  const updatePos = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const popH = popRef.current?.offsetHeight || 360;
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
    const d = parseDate(value);
    if (d) setViewDate(d);
    if (showTime) setTime(parseTimePart(value));
  }, [value, showTime]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const selectedDate = parseDatePart(value);

  const emitValue = (dateStr, timeStr) => {
    if (showTime) {
      onChange(dateStr ? `${dateStr}T${timeStr || time}` : '');
    } else {
      onChange(dateStr);
    }
  };

  const selectDay = (d) => {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (showTime) {
      emitValue(dateStr, time);
    } else {
      onChange(dateStr);
      setOpen(false);
    }
  };

  const onTimeChange = (newTime) => {
    setTime(newTime);
    if (selectedDate) emitValue(selectedDate, newTime);
  };

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const displayValue = (() => {
    if (!value) return '';
    const d = parseDate(value);
    if (!d) return '';
    if (showTime) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  })();

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
              {DAYS_HDR.map(d => <span key={d} className="dp-weekday">{d}</span>)}
            </div>
            <div className="dp-grid">
              {cells.map((d, i) => {
                if (d === null) return <span key={`e${i}`} className="dp-cell dp-empty" />;
                const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                const isSelected = dateStr === selectedDate;
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

            {showTime && (
              <div className="dp-time">
                <Icon name="clock" size={13} />
                <input
                  type="time"
                  className="dp-time-input"
                  value={time}
                  onChange={e => onTimeChange(e.target.value)}
                />
              </div>
            )}

            <div className="dp-footer">
              {value && (
                <button type="button" className="dp-clear" onClick={() => { onChange(''); setOpen(false); }}>
                  Clear
                </button>
              )}
              {showTime && selectedDate && (
                <button type="button" className="dp-done" onClick={() => setOpen(false)}>
                  Done
                </button>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
