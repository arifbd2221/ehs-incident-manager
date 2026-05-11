// MaintenanceTab — schedules table + recent events timeline for one asset.
// Reused inside AssetDetail's Maintenance tab. Reads from
// `/api/maintenance-schedules?asset_id=X`. Modal state is local; the
// asset-detail page does not need to know about it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../shared/Icon';
import api from '../../api/client';
import { listSchedules, getSchedule, deleteSchedule } from '../../api/maintenance';
import { formatDateShort, timeAgo, dueLabel } from '../../utils/time';
import ScheduleModal from './ScheduleModal';
import CompleteModal from './CompleteModal';
import EscalateModal from './EscalateModal';
import ScheduleDetailModal from './ScheduleDetailModal';

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

export default function MaintenanceTab({ asset, user, onRefresh }) {
  const navigate = useNavigate();
  const canEdit = ELEVATED.has(user?.role);

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeOnly, setActiveOnly] = useState(true);

  const [scheduleModal, setScheduleModal] = useState(null); // 'new' | { edit: schedule }
  const [completeTarget, setCompleteTarget] = useState(null);
  const [escalateTarget, setEscalateTarget] = useState(null); // { schedule, event? }
  const [detailTarget, setDetailTarget] = useState(null);
  const [recentEvents, setRecentEvents] = useState([]);

  const load = useCallback(() => {
    setLoading(true);
    listSchedules({ asset_id: asset.id, active: activeOnly ? 1 : '' })
      .then(d => setSchedules(d.schedules || []))
      .catch(() => setSchedules([]))
      .finally(() => setLoading(false));
  }, [asset.id, activeOnly]);

  useEffect(load, [load]);

  // Recent events across all schedules for this asset — surface the last 10
  // so the inspector can read a continuous timeline. Reloaded after any
  // completion to keep it fresh.
  useEffect(() => {
    if (schedules.length === 0) { setRecentEvents([]); return; }
    // Fetch detail (which carries up-to-20 events each) and merge.
    Promise.all(schedules.map(s => getSchedule(s.id).catch(() => null)))
      .then(results => {
        const events = [];
        for (const r of results) {
          if (!r?.events) continue;
          for (const e of r.events) events.push({ ...e, schedule_title: r.title });
        }
        events.sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1));
        setRecentEvents(events.slice(0, 10));
      });
  }, [schedules]);

  const overdueCount = useMemo(() => schedules.filter(s => s.status === 'overdue').length, [schedules]);
  const dueSoonCount = useMemo(() => schedules.filter(s => s.status === 'due_soon').length, [schedules]);

  const handleSaved = () => { setScheduleModal(null); load(); onRefresh?.(); };
  const handleCompleted = () => { setCompleteTarget(null); load(); onRefresh?.(); };
  const handleEscalated = (capa) => {
    setEscalateTarget(null);
    load();
    if (capa?.id) {
      // Soft navigate to the new CAPA so the user sees the back-link UX.
      navigate(`/capas/${capa.id}`);
    }
  };

  const handleArchive = async (schedule) => {
    if (!window.confirm(`Archive "${schedule.title}"? Existing completion history stays in the audit log.`)) return;
    try { await deleteSchedule(schedule.id); load(); }
    catch (e) { alert(e.response?.data?.error || 'Archive failed'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header strip with status counts + actions */}
      <div className="card card-pad">
        <div className="card-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon name="gear" size={16} /> Maintenance schedules
            {overdueCount > 0 && (
              <span className="pill pill-err"><span className="dot" />{overdueCount} overdue</span>
            )}
            {dueSoonCount > 0 && (
              <span className="pill pill-warn">{dueSoonCount} due soon</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className={`btn btn-tertiary btn-sm${activeOnly ? '' : ' btn-secondary'}`}
              onClick={() => setActiveOnly(v => !v)}
              title="Toggle archived schedules"
            >
              {activeOnly ? 'Showing active' : 'Showing all'}
            </button>
            {canEdit && (
              <button className="btn btn-primary btn-sm" onClick={() => setScheduleModal('new')}>
                <Icon name="plus" size={14} /> New schedule
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="helper" style={{ padding: 16 }}>Loading schedules…</div>
        ) : schedules.length === 0 ? (
          <div className="asset-tab-empty">
            <Icon name="gear" size={28} />
            <h3>No maintenance schedules yet</h3>
            <p>
              {canEdit
                ? 'Add a preventive, calibration, or inspection schedule to start tracking compliance.'
                : 'No schedules have been set up for this asset.'}
            </p>
            {canEdit && (
              <button className="btn btn-primary btn-sm" onClick={() => setScheduleModal('new')}>
                <Icon name="plus" size={14} /> New schedule
              </button>
            )}
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Interval</th>
                <th>Assignee</th>
                <th>Last done</th>
                <th>Next due</th>
                <th>Status</th>
                <th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(s => (
                <tr key={s.id} onClick={() => setDetailTarget(s)} style={{ cursor: 'pointer' }}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.title}</div>
                    {s.description && (
                      <div className="meta" style={{ fontSize: 11, color: 'var(--sds-fg-tertiary)', marginTop: 2 }}>
                        {s.description}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`pill ${TYPE_PILL[s.schedule_type] || 'pill-gray'}`}>
                      {s.schedule_type}
                    </span>
                  </td>
                  <td>{s.interval_days} d</td>
                  <td>
                    {s.assigned_to_name ? (
                      <span title={s.assigned_to_name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: 'var(--sds-brand-primary-tint)', color: 'var(--sds-brand-primary)', fontSize: 10, fontWeight: 600 }}>
                          {s.assigned_to_initials || '?'}
                        </span>
                        <span style={{ fontSize: 12 }}>{s.assigned_to_name}</span>
                      </span>
                    ) : <span className="helper">unassigned</span>}
                  </td>
                  <td>
                    {s.last_completed_at ? (
                      <>
                        <div>{formatDateShort(s.last_completed_at)}</div>
                        {s.last_outcome && (
                          <span className={`pill ${OUTCOME_PILL[s.last_outcome]}`} style={{ fontSize: 10 }}>
                            {s.last_outcome}
                          </span>
                        )}
                      </>
                    ) : <span className="helper">never</span>}
                  </td>
                  <td>
                    {s.next_due ? (
                      <>
                        <div>{formatDateShort(s.next_due)}</div>
                        <div style={{ fontSize: 11, color: 'var(--sds-fg-tertiary)' }}>{dueLabel(s.next_due)}</div>
                      </>
                    ) : '—'}
                  </td>
                  <td>
                    <span className={`pill ${STATUS_PILL[s.status] || 'pill-gray'}`}>
                      {STATUS_LABEL[s.status] || s.status}
                    </span>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {s.active && (
                        <button
                          className="btn btn-tertiary btn-sm has-tooltip"
                          onClick={() => setCompleteTarget(s)}
                          data-tooltip="Mark complete"
                          aria-label="Mark complete"
                        >
                          <Icon name="check" size={13} />
                        </button>
                      )}
                      {canEdit && s.active && (
                        <button
                          className="btn btn-tertiary btn-sm has-tooltip"
                          onClick={() => setEscalateTarget({ schedule: s })}
                          data-tooltip="Escalate to CAPA"
                          aria-label="Escalate to CAPA"
                        >
                          <Icon name="warning" size={13} />
                        </button>
                      )}
                      {canEdit && s.active && (
                        <button
                          className="btn btn-tertiary btn-sm has-tooltip"
                          onClick={() => setScheduleModal({ edit: s })}
                          data-tooltip="Edit schedule"
                          aria-label="Edit schedule"
                        >
                          <Icon name="edit" size={13} />
                        </button>
                      )}
                      {canEdit && s.active && (
                        <button
                          className="btn btn-tertiary btn-sm has-tooltip"
                          onClick={() => handleArchive(s)}
                          data-tooltip="Archive"
                          aria-label="Archive"
                        >
                          <Icon name="close" size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent events timeline */}
      {recentEvents.length > 0 && (
        <div className="card card-pad">
          <div className="card-h">
            <Icon name="clock" size={14} /> Recent completions
          </div>
          <div className="activity-feed">
            {recentEvents.map(e => (
              <div className="act-item" key={e.id}>
                <div className={`act-dot ${OUTCOME_DOT[e.outcome] || 'act-system'}`}>
                  <Icon name={e.outcome === 'fail' ? 'warning' : 'check'} size={16} />
                </div>
                <div className="act-body">
                  <div className="act-who">
                    {e.completed_by_name || 'Unknown'}
                    <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, color: 'var(--sds-fg-tertiary)' }}>
                      {e.schedule_title}
                    </span>
                  </div>
                  <div className="act-desc">
                    <span className={`pill ${OUTCOME_PILL[e.outcome]}`} style={{ fontSize: 10, marginRight: 6 }}>
                      {e.outcome}
                    </span>
                    {e.notes || 'No notes.'}
                    {e.capa_number && (
                      <>
                        {' · '}
                        <a className="link" onClick={() => navigate(`/capas/${e.capa_id}`)} style={{ cursor: 'pointer' }}>
                          escalated to {e.capa_number}
                        </a>
                      </>
                    )}
                  </div>
                  {(e.calibration_before || e.calibration_after || e.calibration_certificate) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, fontSize: 11, color: 'var(--sds-fg-secondary)' }}>
                      {e.calibration_before && (
                        <span style={{ padding: '2px 6px', background: 'var(--sds-bg-surface-alt)', borderRadius: 'var(--sds-radius-sm)' }}>
                          before: {e.calibration_before}{e.calibration_unit ? ` ${e.calibration_unit}` : ''}
                        </span>
                      )}
                      {e.calibration_after && (
                        <span style={{ padding: '2px 6px', background: 'var(--sds-bg-surface-alt)', borderRadius: 'var(--sds-radius-sm)' }}>
                          after: {e.calibration_after}{e.calibration_unit ? ` ${e.calibration_unit}` : ''}
                        </span>
                      )}
                      {e.calibration_tolerance && (
                        <span style={{ padding: '2px 6px', background: 'var(--sds-bg-surface-alt)', borderRadius: 'var(--sds-radius-sm)' }}>
                          tol {e.calibration_tolerance}
                        </span>
                      )}
                      {e.calibration_certificate && (
                        <span style={{ padding: '2px 6px', background: 'var(--sds-bg-surface-alt)', borderRadius: 'var(--sds-radius-sm)' }}>
                          cert: {e.calibration_certificate}
                        </span>
                      )}
                      {e.calibration_reference && (
                        <span style={{ padding: '2px 6px', background: 'var(--sds-bg-surface-alt)', borderRadius: 'var(--sds-radius-sm)' }} title={e.calibration_reference}>
                          ref: {e.calibration_reference.length > 30 ? e.calibration_reference.slice(0, 30) + '…' : e.calibration_reference}
                        </span>
                      )}
                    </div>
                  )}
                  {e.attachments && e.attachments.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {e.attachments.map(a => (
                        <a
                          key={a.id}
                          href="#"
                          onClick={async (ev) => {
                            ev.preventDefault();
                            try {
                              const res = await api.get(`/attachments/${a.id}/download`, { responseType: 'blob' });
                              const url = URL.createObjectURL(new Blob([res.data]));
                              const link = document.createElement('a');
                              link.href = url; link.download = a.filename;
                              document.body.appendChild(link); link.click(); link.remove();
                              URL.revokeObjectURL(url);
                            } catch { alert('Download failed'); }
                          }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: 'var(--sds-bg-surface-alt)', borderRadius: 'var(--sds-radius-sm)', fontSize: 11, color: 'var(--sds-fg-secondary)', textDecoration: 'none' }}
                          title={`${a.filename} · ${Math.round((a.size_bytes || 0) / 1024)} KB`}
                        >
                          <Icon name="file" size={11} /> {a.filename}
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="act-when">{timeAgo(e.completed_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {scheduleModal === 'new' && (
        <ScheduleModal
          assetId={asset.id}
          assetName={asset.name}
          onClose={() => setScheduleModal(null)}
          onSaved={handleSaved}
        />
      )}
      {scheduleModal?.edit && (
        <ScheduleModal
          assetId={asset.id}
          assetName={asset.name}
          schedule={scheduleModal.edit}
          onClose={() => setScheduleModal(null)}
          onSaved={handleSaved}
        />
      )}
      {completeTarget && (
        <CompleteModal
          schedule={{ ...completeTarget, asset_name: asset.name }}
          onClose={() => setCompleteTarget(null)}
          onCompleted={handleCompleted}
        />
      )}
      {escalateTarget && (
        <EscalateModal
          schedule={{ ...escalateTarget.schedule, asset_name: asset.name }}
          event={escalateTarget.event}
          onClose={() => setEscalateTarget(null)}
          onEscalated={handleEscalated}
        />
      )}
      {detailTarget && (
        <ScheduleDetailModal
          schedule={{ ...detailTarget, asset_name: detailTarget.asset_name || asset.name, asset_id: detailTarget.asset_id || asset.id }}
          user={user}
          onClose={() => setDetailTarget(null)}
          onMarkComplete={(s) => { setDetailTarget(null); setCompleteTarget(s); }}
          onEscalate={(s) => { setDetailTarget(null); setEscalateTarget({ schedule: s }); }}
          onEdit={(s) => { setDetailTarget(null); setScheduleModal({ edit: s }); }}
          onArchive={(s) => { setDetailTarget(null); handleArchive(s); }}
        />
      )}
    </div>
  );
}
