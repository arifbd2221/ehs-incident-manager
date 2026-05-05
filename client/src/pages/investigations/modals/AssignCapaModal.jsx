import { useState, useEffect } from 'react';
import Icon from '../../../components/shared/Icon';
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
  const valid = form.title.trim() && form.due_date && form.owner_id && form.verifier_id && form.owner_id !== form.verifier_id;

  return (
    <div className="idet-modal-backdrop" onClick={onCancel}>
      <div className="idet-modal" onClick={e => e.stopPropagation()} role="dialog" style={{ maxWidth: 560 }}>
        <div className="idet-modal-header">
          <div>
            <div className="idet-modal-title">Assign CAPA</div>
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
              <select className="form-select" value={form.type} onChange={e => update('type', e.target.value)}>
                <option value="corrective">Corrective</option>
                <option value="preventive">Preventive</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select className="form-select" value={form.priority} onChange={e => update('priority', e.target.value)}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Owner</label>
              <select className="form-select" value={form.owner_id} onChange={e => update('owner_id', e.target.value)}>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Verifier (≠ owner)</label>
              <select className="form-select" value={form.verifier_id} onChange={e => update('verifier_id', e.target.value)}>
                {users.filter(u => String(u.id) !== form.owner_id).map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Due date</label>
            <input className="form-input" type="date" value={form.due_date} onChange={e => update('due_date', e.target.value)}/>
          </div>
          <div className="form-group">
            <label className="form-label">Description <span className="optional">(optional)</span></label>
            <textarea className="form-textarea" rows={3} placeholder="What needs to be done and how completion will be verified." value={form.description} onChange={e => update('description', e.target.value)}/>
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
