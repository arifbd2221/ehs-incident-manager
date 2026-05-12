// MaintenancePage — global view of every maintenance schedule across the
// org. Inspector's home view: "show me everything overdue / due soon /
// active across all assets." Site-filterable. Single-row actions reuse the
// same modals as AssetDetail's Maintenance tab so behavior is identical.
//
// Creating a NEW schedule requires picking an asset first — done on the
// per-asset detail page (clean asset-scoped form). This page covers the
// recurring operator workflow: see, complete, escalate, edit.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../../components/shared/Icon';
import ComboBox from '../../components/shared/ComboBox';
import { listSchedules, getSchedule, deleteSchedule } from '../../api/maintenance';
import { getSites } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { formatDateShort, dueLabel } from '../../utils/time';
import ScheduleModal from '../../components/maintenance/ScheduleModal';
import CompleteModal from '../../components/maintenance/CompleteModal';
import EscalateModal from '../../components/maintenance/EscalateModal';
import ScheduleDetailModal from '../../components/maintenance/ScheduleDetailModal';

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

const TABS = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'due_soon', label: 'Due soon' },
  { id: 'ok', label: 'On schedule' },
  { id: 'inactive', label: 'Archived' },
];

const TYPE_FILTERS = [
  { id: '', label: 'All types' },
  { id: 'preventive', label: 'Preventive' },
  { id: 'calibration', label: 'Calibration' },
  { id: 'inspection', label: 'Inspection' },
  { id: 'other', label: 'Other' },
];

export default function MaintenancePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refreshKey, activeSiteId } = useApp();
  const canEdit = ELEVATED.has(user?.role);
  const [searchParams, setSearchParams] = useSearchParams();

  const [sites, setSites] = useState([]);
  const [siteFilter, setSiteFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [tab, setTab] = useState('overdue');

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  const [counts, setCounts] = useState({ overdue: 0, due7: 0, due30: 0 });

  const [completeTarget, setCompleteTarget] = useState(null);
  const [escalateTarget, setEscalateTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);

  useEffect(() => {
    getSites().then(s => setSites(s?.sites || s || [])).catch(() => setSites([]));
  }, []);

  // Deep-link from a notification: `/maintenance?open=<schedule_id>` pops the
  // detail modal directly so the assignee lands inside the right schedule
  // instead of having to find it in the list. Consumed once, then the query
  // param is stripped so reload doesn't keep re-opening.
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId) return;
    getSchedule(Number(openId))
      .then(s => { if (s) setDetailTarget(s); })
      .catch(() => {});
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = { status: tab, limit: 200 };
    if (siteFilter) params.site_id = siteFilter;
    if (typeFilter) params.schedule_type = typeFilter;
    listSchedules(params)
      .then(d => setSchedules(d.schedules || []))
      .catch(() => setSchedules([]))
      .finally(() => setLoading(false));
  }, [tab, siteFilter, typeFilter, refreshKey]);

  useEffect(load, [load]);

  // Refresh the top KPI counts independently — these stay stable regardless
  // of the active tab. Bulk fetches per status so the FE doesn't re-implement
  // the server's status compute.
  const refreshCounts = useCallback(() => {
    const base = {};
    if (siteFilter) base.site_id = siteFilter;
    Promise.all([
      listSchedules({ ...base, status: 'overdue', limit: 1 }).catch(() => ({ total: 0 })),
      listSchedules({ ...base, status: 'due_soon', limit: 200 }).catch(() => ({ schedules: [] })),
    ]).then(([od, ds]) => {
      // For due_7 vs due_30 split, walk the due_soon set client-side; cheaper
      // than a third round trip and the set is already capped at 30d.
      const now = new Date();
      const day = 86400000;
      let in7 = 0;
      for (const s of (ds.schedules || [])) {
        const dt = new Date(s.next_due);
        const days = Math.round((dt - now) / day);
        if (days <= 7) in7++;
      }
      setCounts({
        overdue: od.total || 0,
        due7: in7,
        due30: (ds.schedules || []).length,
      });
    });
  }, [siteFilter, refreshKey]);
  useEffect(refreshCounts, [refreshCounts]);

  // Tab counts as raw numbers for the badge.
  const tabBadge = (id) => {
    if (id === 'overdue') return counts.overdue;
    if (id === 'due_soon') return counts.due30;
    return null;
  };

  const handleArchive = async (schedule) => {
    if (!window.confirm(`Archive "${schedule.title}"? Existing completion history stays in the audit log.`)) return;
    try { await deleteSchedule(schedule.id); load(); refreshCounts(); }
    catch (e) { alert(e.response?.data?.error || 'Archive failed'); }
  };

  const handleAfterAction = () => {
    setCompleteTarget(null);
    setEscalateTarget(null);
    setEditTarget(null);
    setNewOpen(false);
    setDetailTarget(null);
    load();
    refreshCounts();
  };

  // Sort within tab: overdue → most-overdue first; due_soon → soonest first;
  // ok → soonest first; inactive → most-recently archived first.
  const sortedSchedules = useMemo(() => {
    const rows = [...schedules];
    if (tab === 'inactive') {
      rows.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    } else {
      rows.sort((a, b) => (a.next_due < b.next_due ? -1 : 1));
    }
    return rows;
  }, [schedules, tab]);

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--sds-fg-heading)' }}>Maintenance</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--sds-fg-secondary)', fontSize: 13 }}>
            Preventive maintenance, calibration, and inspection schedules across every asset.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {sites.length > 1 && !activeSiteId && (
            <div style={{ minWidth: 180 }}>
              <ComboBox
                className="cb-sm"
                options={[{ value: '', label: 'All sites' }, ...sites.map(s => ({ value: String(s.id), label: s.name }))]}
                value={String(siteFilter)}
                onChange={v => setSiteFilter(v)}
                placeholder="All sites"
                clearable={!!siteFilter}
              />
            </div>
          )}
          {canEdit && (
            <button className="btn btn-primary btn-sm" onClick={() => setNewOpen(true)}>
              <Icon name="plus" size={14} /> New schedule
            </button>
          )}
        </div>
      </div>

      {/* KPI strip — 3 small cards mirroring the dashboard pattern */}
      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 }}>
        <div className="kpi-card kpi-overdue kpi-clickable" onClick={() => setTab('overdue')}>
          <div className="kpi-top">
            <div className="kpi-label">Overdue</div>
            <div className="kpi-icon"><Icon name="warning" size={18} /></div>
          </div>
          <div className="kpi-val">{counts.overdue}</div>
          <div className="kpi-foot">
            {counts.overdue > 0
              ? <span className="kpi-target bad">Needs attention</span>
              : <span className="kpi-target good">All on track</span>}
          </div>
        </div>
        <div className="kpi-card kpi-dart kpi-clickable" onClick={() => setTab('due_soon')}>
          <div className="kpi-top">
            <div className="kpi-label">Due in 7 days</div>
            <div className="kpi-icon"><Icon name="clock" size={18} /></div>
          </div>
          <div className="kpi-val">{counts.due7}</div>
          <div className="kpi-foot">Plan technician time</div>
        </div>
        <div className="kpi-card kpi-open kpi-clickable" onClick={() => setTab('due_soon')}>
          <div className="kpi-top">
            <div className="kpi-label">Due in 30 days</div>
            <div className="kpi-icon"><Icon name="reports" size={18} /></div>
          </div>
          <div className="kpi-val">{counts.due30}</div>
          <div className="kpi-foot">Rolling 30-day window</div>
        </div>
      </div>

      {/* Tabs + filters */}
      <div className="card card-pad" style={{ marginBottom: 0, padding: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--sds-border)' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {TABS.map(t => {
              const badge = tabBadge(t.id);
              return (
                <button
                  key={t.id}
                  className={`btn ${tab === t.id ? 'btn-primary' : 'btn-tertiary'} btn-sm`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  {badge != null && badge > 0 && (
                    <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.8 }}>{badge}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {TYPE_FILTERS.map(t => (
              <button
                key={t.id}
                className={`btn btn-sm ${typeFilter === t.id ? 'btn-primary' : 'btn-tertiary'}`}
                onClick={() => setTypeFilter(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="helper" style={{ padding: 32, textAlign: 'center' }}>Loading…</div>
        ) : sortedSchedules.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Icon name="gear" size={32} color="var(--sds-fg-tertiary)" />
            <h3 style={{ margin: '12px 0 4px', fontSize: 15, fontWeight: 600 }}>
              {tab === 'overdue' ? 'No overdue maintenance' :
               tab === 'due_soon' ? 'Nothing due in the next 30 days' :
               tab === 'inactive' ? 'No archived schedules' :
               'No active schedules'}
            </h3>
            <p style={{ margin: 0, color: 'var(--sds-fg-tertiary)', fontSize: 13 }}>
              {tab === 'overdue' && counts.overdue === 0
                ? 'Compliance is on track — keep going.'
                : 'Open an asset detail page to add maintenance schedules.'}
            </p>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Schedule</th>
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
              {sortedSchedules.map(s => (
                <tr key={s.id} onClick={() => setDetailTarget(s)} style={{ cursor: 'pointer' }}>
                  <td onClick={e => e.stopPropagation()}>
                    <a className="link" style={{ cursor: 'pointer', fontWeight: 600 }} onClick={() => navigate(`/assets/${s.asset_id}`)}>
                      {s.asset_display_id || s.asset_name || `#${s.asset_id}`}
                    </a>
                    {s.asset_name && s.asset_display_id && s.asset_display_id !== s.asset_name && (
                      <div className="meta" style={{ fontSize: 11, color: 'var(--sds-fg-tertiary)' }}>{s.asset_name}</div>
                    )}
                    {s.site_name && (
                      <div className="meta" style={{ fontSize: 11, color: 'var(--sds-fg-tertiary)' }}>{s.site_name}</div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.title}</div>
                    {s.description && (
                      <div className="meta" style={{ fontSize: 11, color: 'var(--sds-fg-tertiary)' }}>{s.description}</div>
                    )}
                  </td>
                  <td>
                    <span className={`pill ${TYPE_PILL[s.schedule_type] || 'pill-gray'}`}>{s.schedule_type}</span>
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
                          onClick={() => setEditTarget(s)}
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

      {/* Modals */}
      {completeTarget && (
        <CompleteModal
          schedule={completeTarget}
          onClose={() => setCompleteTarget(null)}
          onCompleted={handleAfterAction}
        />
      )}
      {escalateTarget && (
        <EscalateModal
          schedule={escalateTarget.schedule}
          event={escalateTarget.event}
          onClose={() => setEscalateTarget(null)}
          onEscalated={(capa) => {
            handleAfterAction();
            if (capa?.id) navigate(`/capas/${capa.id}`);
          }}
        />
      )}
      {editTarget && (
        <ScheduleModal
          assetId={editTarget.asset_id}
          assetName={editTarget.asset_name}
          schedule={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={handleAfterAction}
        />
      )}
      {newOpen && (
        <ScheduleModal
          onClose={() => setNewOpen(false)}
          onSaved={handleAfterAction}
        />
      )}
      {detailTarget && (
        <ScheduleDetailModal
          schedule={detailTarget}
          user={user}
          onClose={() => setDetailTarget(null)}
          onMarkComplete={(s) => { setDetailTarget(null); setCompleteTarget(s); }}
          onEscalate={(s) => { setDetailTarget(null); setEscalateTarget({ schedule: s }); }}
          onEdit={(s) => { setDetailTarget(null); setEditTarget(s); }}
          onArchive={(s) => { setDetailTarget(null); handleArchive(s); }}
        />
      )}
    </div>
  );
}
