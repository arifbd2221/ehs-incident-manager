// CompleteModal — record a maintenance completion event.
// outcome: pass / fail / conditional (matches asset_maintenance_events.outcome
// CHECK). Worker role can submit this; only the BE complete route is gated.
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../shared/Icon';
import DatePicker from '../shared/DatePicker';
import { completeSchedule } from '../../api/maintenance';
import { uploadAttachments } from '../../api/incidents';

const OUTCOMES = [
  { value: 'pass', label: 'Pass', color: 'var(--sds-success)', icon: 'check', help: 'Completed as scheduled, no issues.' },
  { value: 'conditional', label: 'Conditional', color: 'var(--sds-warning)', icon: 'warning', help: 'Done but needs follow-up — flag a CAPA if needed.' },
  { value: 'fail', label: 'Fail', color: 'var(--sds-error)', icon: 'close', help: 'Could not complete or failed inspection. Consider escalating to CAPA.' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function CompleteModal({ schedule, onClose, onCompleted }) {
  const isCalibration = schedule?.schedule_type === 'calibration';
  const [outcome, setOutcome] = useState('pass');
  const [notes, setNotes] = useState('');
  const [completedAt, setCompletedAt] = useState(todayIso());
  const [files, setFiles] = useState([]);
  // Calibration block (only rendered when isCalibration)
  const [calBefore, setCalBefore] = useState('');
  const [calAfter, setCalAfter] = useState('');
  const [calUnit, setCalUnit] = useState('');
  const [calTol, setCalTol] = useState('');
  const [calRef, setCalRef] = useState('');
  const [calCert, setCalCert] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileInputRef = useRef(null);

  const addFiles = (list) => {
    if (!list || list.length === 0) return;
    const next = [...files];
    for (const f of list) {
      if (next.length >= 10) break;
      if (!next.some(existing => existing.name === f.name && existing.size === f.size)) {
        next.push(f);
      }
    }
    setFiles(next);
  };
  const removeFile = (idx) => setFiles(files.filter((_, i) => i !== idx));

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true); setErr('');
    try {
      const payload = {
        outcome,
        notes: notes.trim() || undefined,
        completed_at: completedAt,
      };
      if (isCalibration) {
        payload.calibration = {
          before: calBefore.trim() || undefined,
          after: calAfter.trim() || undefined,
          unit: calUnit.trim() || undefined,
          tolerance: calTol.trim() || undefined,
          reference: calRef.trim() || undefined,
          certificate: calCert.trim() || undefined,
        };
      }
      const result = await completeSchedule(schedule.id, payload);
      // Attach evidence files after the event row is created. Best-effort —
      // if attach fails, the event still stands but we surface a warning.
      if (files.length > 0 && result?.event?.id) {
        try {
          await uploadAttachments('maintenance_event', result.event.id, files);
        } catch (attachErr) {
          setErr(`Completion saved, but uploading attachments failed: ${attachErr.response?.data?.error || 'upload failed'}`);
          setBusy(false);
          return;
        }
      }
      onCompleted(result);
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to record completion');
    } finally {
      setBusy(false);
    }
  };

  const selected = OUTCOMES.find(o => o.value === outcome);

  return createPortal(
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <form className="modal modal-lg" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-h">
          <div>
            <div className="modal-title">Record completion</div>
            <div className="modal-sub">{schedule.title}{schedule.asset_name ? ` · ${schedule.asset_name}` : ''}</div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label className="label">Outcome <span className="req">*</span></label>
            <div style={{ display: 'flex', gap: 8 }}>
              {OUTCOMES.map(o => (
                <button
                  key={o.value}
                  type="button"
                  className={`btn ${outcome === o.value ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  onClick={() => setOutcome(o.value)}
                  style={{ flex: 1 }}
                >
                  <Icon name={o.icon} size={13} /> {o.label}
                </button>
              ))}
            </div>
            <span className="helper" style={{ color: selected?.color }}>{selected?.help}</span>
          </div>

          <div className="field">
            <label className="label">Completed on</label>
            <DatePicker value={completedAt} onChange={setCompletedAt} placeholder="Select date" />
            <span className="helper">Next due will roll forward by {schedule.interval_days} day{schedule.interval_days === 1 ? '' : 's'} from this date.</span>
          </div>

          {isCalibration && (
            <div className="field" style={{ background: 'var(--sds-bg-surface-alt)', padding: 12, borderRadius: 'var(--sds-radius-md)', border: '1px solid var(--sds-border)' }}>
              <label className="label" style={{ marginBottom: 8 }}>
                <Icon name="pulse" size={13} /> Calibration record
                <span className="helper" style={{ marginLeft: 8 }}>ISO 9001 §7.1.5 / ISO/IEC 17025 / FDA 21 CFR Part 211 fields</span>
              </label>
              <div className="field-row">
                <div className="field">
                  <label className="label">Before</label>
                  <input className="input" value={calBefore} onChange={e => setCalBefore(e.target.value)} placeholder="As-found reading" />
                </div>
                <div className="field">
                  <label className="label">After</label>
                  <input className="input" value={calAfter} onChange={e => setCalAfter(e.target.value)} placeholder="As-left reading" />
                </div>
                <div className="field">
                  <label className="label">Unit</label>
                  <input className="input" value={calUnit} onChange={e => setCalUnit(e.target.value)} placeholder="e.g. psi, °C, mV" />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Tolerance</label>
                  <input className="input" value={calTol} onChange={e => setCalTol(e.target.value)} placeholder="e.g. ±0.5%" />
                </div>
                <div className="field">
                  <label className="label">Certificate #</label>
                  <input className="input" value={calCert} onChange={e => setCalCert(e.target.value)} placeholder="Lab cert. number" />
                </div>
              </div>
              <div className="field">
                <label className="label">Reference standard</label>
                <input className="input" value={calRef} onChange={e => setCalRef(e.target.value)} placeholder="NIST trace #, certified weight set, primary standard…" />
              </div>
            </div>
          )}

          <div className="field">
            <label className="label">Notes</label>
            <textarea
              className="textarea"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="What was done, what was found, parts replaced, observations…"
              rows={3}
              maxLength={1000}
            />
          </div>

          <div className="field">
            <label className="label">Evidence</label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={e => addFiles(e.target.files)}
            />
            <div
              style={{ border: '1px dashed var(--sds-border)', borderRadius: 'var(--sds-radius-md)', padding: 12, cursor: 'pointer', textAlign: 'center', color: 'var(--sds-fg-tertiary)', fontSize: 12 }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); }}
              onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
            >
              <Icon name="upload" size={16} /> Drop photos / signed checklists here or click to browse (max 10, 25 MB each)
            </div>
            {files.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {files.map((f, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: 'var(--sds-bg-surface-alt)', borderRadius: 'var(--sds-radius-sm)', fontSize: 12 }}>
                    <span><Icon name="file" size={12} /> {f.name} <span style={{ color: 'var(--sds-fg-tertiary)' }}>({Math.round(f.size / 1024)} KB)</span></span>
                    <button type="button" className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => removeFile(i)} title="Remove">
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <span className="helper">Photos of completed work, signed inspection checklists, or vendor service receipts.</span>
          </div>

          {err && <div className="helper" style={{ color: 'var(--sds-error)' }}>{err}</div>}
        </div>

        <div className="modal-f">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Record completion'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
