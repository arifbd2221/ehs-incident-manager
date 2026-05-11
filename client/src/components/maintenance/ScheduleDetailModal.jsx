// ScheduleDetailModal — read-only detail view for a maintenance schedule.
// Layout deliberately mirrors the other detail modals in the codebase:
// standard .modal-h (title + asset crumb), .modal-body sections with .field
// styling for the KV pairs, .modal-f with at most 4 buttons.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import Icon from '../shared/Icon';
import api from '../../api/client';
import { getSchedule } from '../../api/maintenance';
import { formatDateShort, timeAgo, dueLabel } from '../../utils/time';

const ELEVATED = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

const TYPE_PILL = {
  preventive: 'pill-info',
  calibration: 'pill-purple',
  inspection: 'pill-success',
  other: 'pill-gray',
};

const STATUS_PILL = {
  overdue: 'pill-err',
  due_soon: 'pill-warn',
  ok: 'pill-success',
  inactive: 'pill-gray',
};

const STATUS_LABEL = {
  overdue: 'Overdue',
  due_soon: 'Due soon',
  ok: 'On schedule',
  inactive: 'Archived',
};

const OUTCOME_PILL = {
  pass: 'pill-success',
  conditional: 'pill-warn',
  fail: 'pill-err',
};

const OUTCOME_DOT = {
  pass: 'act-close',
  conditional: 'act-escalate',
  fail: 'act-system',
};

export default function ScheduleDetailModal({ schedule: initial, user, onClose, onEdit, onMarkComplete, onEscalate, onArchive }) {
  const navigate = useNavigate();
  const canEdit = ELEVATED.has(user?.role);
  const [schedule, setSchedule] = useState(initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!initial?.id) return;
    setLoading(true);
    getSchedule(initial.id)
      .then(d => { if (!cancelled) setSchedule(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [initial?.id]);

  if (!schedule) return null;

  const status = schedule.status;
  const events = schedule.events || [];

  const downloadAttachment = async (a) => {
    try {
      const res = await api.get(`/attachments/${a.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url; link.download = a.filename;
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
    } catch { alert('Download failed'); }
  };

  const goToAsset = () => { onClose(); navigate(`/assets/${schedule.asset_id}`); };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        {/* Standard header: title + monospace asset crumb. Type/status pills
            live in the body so the header stays tight. */}
        <div className="modal-h">
          <div>
            <div className="modal-title">{schedule.title}</div>
            <div className="modal-sub">
              {schedule.asset_display_id || `Asset #${schedule.asset_id}`}
              {schedule.site_name ? ` · ${schedule.site_name}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {canEdit && schedule.active && (
              <button
                className="icon-btn has-tooltip"
                onClick={() => onArchive?.(schedule)}
                data-tooltip="Archive"
                aria-label="Archive"
              >
                <Icon name="close" size={16} />
              </button>
            )}
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>

        <div className="modal-body">
          {/* Status pills row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span className={`pill ${TYPE_PILL[schedule.schedule_type] || 'pill-gray'}`}>{schedule.schedule_type}</span>
            <span className={`pill ${STATUS_PILL[status] || 'pill-gray'}`}>{STATUS_LABEL[status] || status}</span>
            {!schedule.active && <span className="pill pill-gray">archived</span>}
            <button
              type="button"
              onClick={goToAsset}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--sds-brand-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <Icon name="factory" size={12} />
              {schedule.asset_name || 'View asset'}
              <Icon name="arrow" size={11} />
            </button>
          </div>

          {schedule.description && (
            <div className="field">
              <label className="label">Description</label>
              <div style={{ fontSize: 13, color: 'var(--sds-fg-primary)', lineHeight: 1.5 }}>
                {schedule.description}
              </div>
            </div>
          )}

          {/* Two-column key/value rows using existing .field + .field-row classes */}
          <div className="field-row">
            <div className="field">
              <label className="label">Interval</label>
              <div style={{ fontSize: 13, color: 'var(--sds-fg-primary)' }}>
                every {schedule.interval_days} day{schedule.interval_days === 1 ? '' : 's'}
              </div>
            </div>
            <div className="field">
              <label className="label">Assignee</label>
              <div style={{ fontSize: 13, color: 'var(--sds-fg-primary)' }}>
                {schedule.assigned_to_name ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: 'var(--sds-brand-primary-tint)', color: 'var(--sds-brand-primary)', fontSize: 10, fontWeight: 600 }}>
                      {schedule.assigned_to_initials || '?'}
                    </span>
                    {schedule.assigned_to_name}
                  </span>
                ) : <span className="helper">unassigned</span>}
              </div>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label">Next due</label>
              <div style={{ fontSize: 13, color: 'var(--sds-fg-primary)' }}>
                {schedule.next_due ? (
                  <>
                    {formatDateShort(schedule.next_due)}
                    <div style={{ fontSize: 11, color: 'var(--sds-fg-tertiary)', marginTop: 2 }}>{dueLabel(schedule.next_due)}</div>
                  </>
                ) : '—'}
              </div>
            </div>
            <div className="field">
              <label className="label">Last completed</label>
              <div style={{ fontSize: 13, color: 'var(--sds-fg-primary)' }}>
                {schedule.last_completed_at ? (
                  <>
                    <span>{formatDateShort(schedule.last_completed_at)}</span>
                    {schedule.last_outcome && (
                      <span className={`pill ${OUTCOME_PILL[schedule.last_outcome]}`} style={{ fontSize: 10, marginLeft: 8 }}>
                        {schedule.last_outcome}
                      </span>
                    )}
                    {schedule.last_completed_by_name && (
                      <div style={{ fontSize: 11, color: 'var(--sds-fg-tertiary)', marginTop: 2 }}>by {schedule.last_completed_by_name}</div>
                    )}
                  </>
                ) : <span className="helper">never</span>}
              </div>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label">First due</label>
              <div style={{ fontSize: 13, color: 'var(--sds-fg-primary)' }}>
                {schedule.start_date ? formatDateShort(schedule.start_date) : '—'}
              </div>
            </div>
            <div className="field">
              <label className="label">Created</label>
              <div style={{ fontSize: 13, color: 'var(--sds-fg-primary)' }}>
                {schedule.created_at ? formatDateShort(schedule.created_at) : '—'}
                {schedule.created_by_name && (
                  <div style={{ fontSize: 11, color: 'var(--sds-fg-tertiary)', marginTop: 2 }}>by {schedule.created_by_name}</div>
                )}
              </div>
            </div>
          </div>

          {/* Recent completions timeline — reuses .activity-feed / .act-item */}
          <div className="field">
            <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="clock" size={12} /> Recent completions
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--sds-fg-tertiary)' }}>
                {loading ? 'refreshing…' : `${events.length} event${events.length === 1 ? '' : 's'}`}
              </span>
            </label>
            {events.length === 0 ? (
              <div className="helper" style={{ padding: 12, textAlign: 'center', background: 'var(--sds-bg-surface-alt)', borderRadius: 'var(--sds-radius-md)' }}>
                No completions recorded yet.
              </div>
            ) : (
              <div className="activity-feed" style={{ padding: 0 }}>
                {events.slice(0, 8).map(e => (
                  <div className="act-item" key={e.id}>
                    <div className={`act-dot ${OUTCOME_DOT[e.outcome] || 'act-system'}`}>
                      <Icon name={e.outcome === 'fail' ? 'warning' : 'check'} size={16} />
                    </div>
                    <div className="act-body">
                      <div className="act-who">
                        {e.completed_by_name || 'Unknown'}
                        <span className={`pill ${OUTCOME_PILL[e.outcome]}`} style={{ fontSize: 10, marginLeft: 8 }}>{e.outcome}</span>
                      </div>
                      <div className="act-desc">
                        {e.notes || 'No notes.'}
                        {e.capa_number && (
                          <>
                            {' · '}
                            <a className="link" onClick={() => { onClose(); navigate(`/capas/${e.capa_id}`); }} style={{ cursor: 'pointer' }}>
                              escalated to {e.capa_number}
                            </a>
                          </>
                        )}
                      </div>
                      {(e.calibration_before || e.calibration_after || e.calibration_certificate) && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, fontSize: 11, color: 'var(--sds-fg-secondary)' }}>
                          {e.calibration_before && <span style={{ padding: '2px 6px', background: 'var(--sds-bg-surface-alt)', borderRadius: 'var(--sds-radius-sm)' }}>before: {e.calibration_before}{e.calibration_unit ? ` ${e.calibration_unit}` : ''}</span>}
                          {e.calibration_after && <span style={{ padding: '2px 6px', background: 'var(--sds-bg-surface-alt)', borderRadius: 'var(--sds-radius-sm)' }}>after: {e.calibration_after}{e.calibration_unit ? ` ${e.calibration_unit}` : ''}</span>}
                          {e.calibration_certificate && <span style={{ padding: '2px 6px', background: 'var(--sds-bg-surface-alt)', borderRadius: 'var(--sds-radius-sm)' }}>cert: {e.calibration_certificate}</span>}
                        </div>
                      )}
                      {e.attachments && e.attachments.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                          {e.attachments.map(a => (
                            <a
                              key={a.id}
                              href="#"
                              onClick={(ev) => { ev.preventDefault(); downloadAttachment(a); }}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: 'var(--sds-bg-surface-alt)', borderRadius: 'var(--sds-radius-sm)', fontSize: 11, color: 'var(--sds-fg-secondary)', textDecoration: 'none' }}
                              title={`${a.filename} · ${Math.round((a.size_bytes || 0) / 1024)} KB`}
                            >
                              <Icon name="file" size={11} /> {a.filename}
                            </a>
                          ))}
                        </div>
                      )}
                      <div className="act-when">{timeAgo(e.completed_at)} · {formatDateShort(e.completed_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-f">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          {canEdit && schedule.active && (
            <button className="btn btn-tertiary" onClick={() => onEscalate?.(schedule)}>
              <Icon name="warning" size={13} /> Escalate
            </button>
          )}
          {canEdit && schedule.active && (
            <button className="btn btn-tertiary" onClick={() => onEdit?.(schedule)}>
              <Icon name="edit" size={13} /> Edit
            </button>
          )}
          {schedule.active && (
            <button className="btn btn-primary" onClick={() => onMarkComplete?.(schedule)}>
              <Icon name="check" size={13} /> Mark complete
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
