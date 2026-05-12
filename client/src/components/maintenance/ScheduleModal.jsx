// ScheduleModal — new + edit for asset_maintenance_schedules.
// Reuses the global .modal* + .field* / .btn classes; portal'd so the .page
// transform doesn't break position:fixed (per CLAUDE.md modal rule).
//
// Two invocation modes:
//   1. With `assetId` prop (e.g. from AssetDetail) → no picker; locked to that asset.
//   2. Without `assetId` (from /maintenance page) → renders an asset picker.
//      The picker is required only on create; edit always inherits the
//      schedule's existing asset (asset cannot be moved between assets in v1).
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../shared/Icon';
import ComboBox from '../shared/ComboBox';
import DatePicker from '../shared/DatePicker';
import { createSchedule, updateSchedule } from '../../api/maintenance';
import { listAssets } from '../../api/assets';
import { getUsers } from '../../api/users';

const TYPES = [
  { value: 'preventive', label: 'Preventive', icon: 'gear' },
  { value: 'calibration', label: 'Calibration', icon: 'pulse' },
  { value: 'inspection', label: 'Inspection', icon: 'check' },
  { value: 'other', label: 'Other', icon: 'file' },
];

// Industry-standard frequency presets. Custom interval still allowed.
const PRESETS = [
  { label: 'Weekly', days: 7 },
  { label: 'Monthly', days: 30 },
  { label: 'Quarterly', days: 90 },
  { label: 'Semi-annual', days: 182 },
  { label: 'Annual', days: 365 },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function ScheduleModal({ assetId, assetName, schedule, onClose, onSaved }) {
  const isEdit = !!schedule;
  // When invoked from the global page without an assetId we render an asset
  // picker. In edit mode the schedule's asset is the source of truth (we do
  // not let users move a schedule between assets in v1).
  const lockedAssetId = isEdit ? schedule.asset_id : (assetId ?? null);
  const needsPicker = !isEdit && !assetId;

  const [pickedAssetId, setPickedAssetId] = useState(lockedAssetId ? String(lockedAssetId) : '');
  const [assets, setAssets] = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [users, setUsers] = useState([]);

  const [form, setForm] = useState(() => ({
    schedule_type: schedule?.schedule_type || 'preventive',
    title: schedule?.title || '',
    description: schedule?.description || '',
    interval_days: schedule?.interval_days ?? 90,
    start_date: schedule?.start_date || todayIso(),
    assigned_to: schedule?.assigned_to ? String(schedule.assigned_to) : '',
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { setErr(''); }, [assetId]);

  // Lazy-load the asset list only when the picker is needed (active-only).
  useEffect(() => {
    if (!needsPicker) return;
    setAssetsLoading(true);
    listAssets({ active: 1, limit: 500 })
      .then(d => setAssets(d.assets || []))
      .catch(() => setAssets([]))
      .finally(() => setAssetsLoading(false));
  }, [needsPicker]);

  // Users for the assignee picker — fetched once.
  useEffect(() => {
    getUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  const assetOpts = useMemo(
    () => assets.map(a => ({
      value: String(a.id),
      label: `${a.display_id || a.asset_number} · ${a.name}${a.site_name ? ` · ${a.site_name}` : ''}`,
    })),
    [assets]
  );

  const userOpts = useMemo(
    () => [
      { value: '', label: '— Unassigned —' },
      ...users.map(u => ({ value: String(u.id), label: `${u.name} (${u.role})` })),
    ],
    [users]
  );

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e?.preventDefault();
    if (!form.title.trim()) { setErr('Title is required'); return; }
    const interval = Number(form.interval_days);
    if (!Number.isInteger(interval) || interval <= 0) {
      setErr('Interval must be a positive number of days'); return;
    }
    const finalAssetId = isEdit ? schedule.asset_id : (assetId ?? Number(pickedAssetId));
    if (!isEdit && !finalAssetId) {
      setErr('Pick an asset first'); return;
    }
    setBusy(true); setErr('');
    try {
      const payload = {
        schedule_type: form.schedule_type,
        title: form.title.trim(),
        description: form.description.trim() || null,
        interval_days: interval,
        start_date: form.start_date,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
      };
      if (isEdit) {
        // edit only allows the patchable subset (no start_date / asset change in v1)
        delete payload.start_date;
        const updated = await updateSchedule(schedule.id, payload);
        onSaved(updated);
      } else {
        const created = await createSchedule({ ...payload, asset_id: finalAssetId });
        onSaved(created);
      }
    } catch (e) {
      setErr(e.response?.data?.error || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <form className="modal modal-lg" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-h">
          <div>
            <div className="modal-title">{isEdit ? `Edit schedule — ${schedule.title}` : 'New maintenance schedule'}</div>
            {assetName && <div className="modal-sub">on {assetName}</div>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>

        <div className="modal-body">
          {needsPicker && (
            <div className="field">
              <label className="label">Asset <span className="req">*</span></label>
              <ComboBox
                options={assetOpts}
                value={pickedAssetId}
                onChange={setPickedAssetId}
                placeholder={assetsLoading ? 'Loading assets…' : 'Search by ID, name, or site…'}
              />
              {assets.length === 0 && !assetsLoading && (
                <span className="helper" style={{ color: 'var(--sds-fg-tertiary)' }}>
                  No active assets in this organization yet.
                </span>
              )}
            </div>
          )}

          <div className="field">
            <label className="label">Type <span className="req">*</span></label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  className={`btn ${form.schedule_type === t.value ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  onClick={() => set('schedule_type', t.value)}
                >
                  <Icon name={t.icon} size={13} /> {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="label">Title <span className="req">*</span></label>
            <input
              className="input"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Quarterly blade inspection"
              autoFocus={!isEdit}
            />
          </div>

          <div className="field">
            <label className="label">Description</label>
            <textarea
              className="textarea"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Procedure notes, what to check, acceptance criteria…"
              rows={3}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label">Interval (days) <span className="req">*</span></label>
              <input
                className="input"
                type="number"
                min={1}
                value={form.interval_days}
                onChange={e => set('interval_days', e.target.value)}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {PRESETS.map(p => (
                  <button
                    key={p.label}
                    type="button"
                    className={`btn btn-tertiary btn-sm${Number(form.interval_days) === p.days ? ' btn-primary' : ''}`}
                    onClick={() => set('interval_days', p.days)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {!isEdit && (
              <div className="field">
                <label className="label">First due <span className="req">*</span></label>
                <DatePicker value={form.start_date} onChange={v => set('start_date', v)} placeholder="Select start date" />
                <span className="helper">After completion, next due rolls forward by the interval.</span>
              </div>
            )}
          </div>

          <div className="field">
            <label className="label">Assigned to</label>
            <ComboBox
              options={userOpts}
              value={form.assigned_to}
              onChange={(v) => set('assigned_to', v)}
              placeholder="Search users…"
            />
            <span className="helper">Owner of the recurring schedule. They'll be notified at assignment; per-occurrence reassignment comes in a later slice.</span>
          </div>

          {err && <div className="helper" style={{ color: 'var(--sds-error)' }}>{err}</div>}
        </div>

        <div className="modal-f">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !form.title.trim() || (needsPicker && !pickedAssetId)}
          >
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create schedule'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
