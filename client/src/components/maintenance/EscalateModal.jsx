// EscalateModal — manual escalation from a maintenance schedule (or a
// specific completion event) to a CAPA. Pre-fills title from the schedule
// + asset so the inspector narrative is "Maintenance finding on Bandsaw #1:
// Quarterly blade inspection" out of the box. Owner != verifier rule
// matches the CAPA route's DB trigger.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../shared/Icon';
import ComboBox from '../shared/ComboBox';
import { getUsers } from '../../api/users';
import { escalateToCapa } from '../../api/maintenance';

const PRIORITY_FROM_OUTCOME = {
  fail: 'high',
  conditional: 'medium',
  pass: 'low',
};

const todayPlus = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export default function EscalateModal({ schedule, event, onClose, onEscalated }) {
  const [users, setUsers] = useState([]);
  const [title, setTitle] = useState(() =>
    schedule
      ? `Address maintenance finding: ${schedule.title}${schedule.asset_name ? ` (${schedule.asset_name})` : ''}`
      : ''
  );
  const [description, setDescription] = useState(() =>
    event?.notes ? `Last completion (${event.outcome}): ${event.notes}` : ''
  );
  const [ownerId, setOwnerId] = useState('');
  const [verifierId, setVerifierId] = useState('');
  const [dueDate, setDueDate] = useState(todayPlus(14));
  const [priority, setPriority] = useState(
    event?.outcome ? PRIORITY_FROM_OUTCOME[event.outcome] || 'medium' : 'medium'
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    getUsers().then(u => {
      setUsers(u);
      if (u[0]) setOwnerId(String(u[0].id));
      if (u[1]) setVerifierId(String(u[1].id));
    }).catch(() => {});
  }, []);

  const userOpts = useMemo(
    () => users.map(u => ({ value: String(u.id), label: `${u.name} (${u.role})` })),
    [users]
  );
  const verifierOpts = useMemo(() => userOpts.filter(o => o.value !== ownerId), [userOpts, ownerId]);
  const priorityOpts = [
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
  ];

  const canSubmit = title.trim() && ownerId && verifierId && ownerId !== verifierId && dueDate;

  const submit = async (e) => {
    e?.preventDefault();
    if (!canSubmit) {
      setErr('Title, owner, verifier (different), and due date are required');
      return;
    }
    setBusy(true); setErr('');
    try {
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        owner_id: Number(ownerId),
        verifier_id: Number(verifierId),
        due_date: dueDate,
        priority,
        type: 'corrective',
      };
      if (event?.id) body.event_id = event.id;
      const result = await escalateToCapa(schedule.id, body);
      onEscalated(result.capa);
    } catch (e) {
      setErr(e.response?.data?.error || 'Escalation failed');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <form className="modal modal-lg" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-h">
          <div>
            <div className="modal-title">Escalate to CAPA</div>
            <div className="modal-sub">
              Maintenance origin{schedule?.title ? ` · ${schedule.title}` : ''}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label className="label">Title <span className="req">*</span></label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs to happen" />
          </div>

          <div className="field">
            <label className="label">Description</label>
            <textarea
              className="textarea"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="What was found, what corrective action is needed…"
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label">Owner <span className="req">*</span></label>
              <ComboBox options={userOpts} value={ownerId} onChange={setOwnerId} placeholder="Search users…" />
            </div>
            <div className="field">
              <label className="label">Independent verifier <span className="req">*</span></label>
              <ComboBox options={verifierOpts} value={verifierId} onChange={setVerifierId} placeholder="Search users…" />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label">Due date <span className="req">*</span></label>
              <input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Priority</label>
              <ComboBox options={priorityOpts} value={priority} onChange={setPriority} searchable={false} />
            </div>
          </div>

          {err && <div className="helper" style={{ color: 'var(--sds-error)' }}>{err}</div>}
        </div>

        <div className="modal-f">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !canSubmit}>
            {busy ? 'Creating CAPA…' : 'Create CAPA'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
