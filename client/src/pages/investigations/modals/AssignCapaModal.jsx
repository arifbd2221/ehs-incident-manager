import { useState, useEffect, useMemo } from 'react';
import Icon from '../../../components/shared/Icon';
import ComboBox from '../../../components/shared/ComboBox';
import SmartTextarea from '../../../components/shared/SmartTextarea';
import { getUsers } from '../../../api/users';

export default function AssignCapaModal({ investigation, onCancel, onConfirm }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ title: '', owner_id: '', verifier_id: '', type: 'corrective', priority: 'high', due_date: '', description: '' });

  useEffect(() => {
    getUsers().then(data => {
      setUsers(data);
      if (data.length >= 2) {
        setForm(f => ({ ...f, owner_id: String(data[0].id), verifier_id: String(data[1].id) }));
      }
    });
  }, []);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const userOpts = useMemo(() => users.map(u => ({ value: String(u.id), label: `${u.name} (${u.role})` })), [users]);
  const verifierOpts = useMemo(() => userOpts.filter(o => o.value !== form.owner_id), [userOpts, form.owner_id]);
  const typeOpts = [{ value: 'corrective', label: 'Corrective' }, { value: 'preventive', label: 'Preventive' }];
  const priorityOpts = [{ value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }];
  const valid = form.title.trim() && form.due_date && form.owner_id && form.verifier_id && form.owner_id !== form.verifier_id;

  return (
    <div className="idet-modal-backdrop" onClick={onCancel}>
      <div className="idet-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="assign-capa-modal-title" style={{ maxWidth: 560 }}>
        <div className="idet-modal-header">
          <div>
            <div className="idet-modal-title" id="assign-capa-modal-title">Assign CAPA</div>
            <div className="idet-modal-sub">{investigation.investigation_number} · creates a corrective/preventive action</div>
          </div>
          <button className="idet-modal-close" onClick={onCancel}><Icon name="close" size={16}/></button>
        </div>
        <div className="idet-modal-body">
          <div className="form-group">
            <label className="form-label">Action title</label>
            <input className="form-input" placeholder="e.g. Update SOP-LAB-014 to require fume-hood refilling" value={form.title} onChange={e => update('title', e.target.value)}/>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Type</label>
              <ComboBox options={typeOpts} value={form.type} onChange={v => update('type', v)} searchable={false} />
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <ComboBox options={priorityOpts} value={form.priority} onChange={v => update('priority', v)} searchable={false} />
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Owner</label>
              <ComboBox options={userOpts} value={form.owner_id} onChange={v => update('owner_id', v)} placeholder="Search users…" />
            </div>
            <div className="form-group">
              <label className="form-label">Verifier (≠ owner)</label>
              <ComboBox options={verifierOpts} value={form.verifier_id} onChange={v => update('verifier_id', v)} placeholder="Search users…" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Due date</label>
            <input className="form-input" type="date" value={form.due_date} onChange={e => update('due_date', e.target.value)}/>
          </div>
          <div className="form-group">
            <label className="form-label">Description <span className="optional">(optional)</span></label>
            <SmartTextarea
              value={form.description}
              onChange={v => update('description', v)}
              rows={3}
              examples={['Revise SOP-LAB-014 to include mandatory fume-hood checks before each shift.', 'Install secondary containment bunding around chemical storage IBC rack.', 'Retrain all operators on LOTO procedure per updated Work Instruction WI-032.']}
              chips={['Update SOP', 'Install engineering control', 'Retrain team']}
            />
          </div>
          {form.owner_id === form.verifier_id && form.owner_id && (
            <div className="modal-info-banner" style={{ background: 'linear-gradient(135deg, #fef2f2, #fff1f2)', borderColor: '#fecaca' }}>
              <div className="info-icon" style={{ background: 'rgba(220, 38, 38, 0.1)', color: '#dc2626' }}><Icon name="warning" size={14}/></div>
              <div className="info-text">Owner and verifier must be different people.</div>
            </div>
          )}
        </div>
        <div className="idet-modal-footer">
          <button className="modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="modal-confirm" disabled={!valid} onClick={() => onConfirm({ ...form, owner_id: Number(form.owner_id), verifier_id: Number(form.verifier_id) })}>
            <Icon name="plus" size={14}/>Assign CAPA
          </button>
        </div>
      </div>
    </div>
  );
}
