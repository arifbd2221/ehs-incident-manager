import { useState, useEffect, useMemo } from 'react';
import Icon from '../../../components/shared/Icon';
import ComboBox from '../../../components/shared/ComboBox';
import SmartTextarea from '../../../components/shared/SmartTextarea';
import { getUsers } from '../../../api/users';

export default function AssignModal({ incident, onCancel, onConfirm }) {
  const [users, setUsers] = useState([]);
  const [owner, setOwner] = useState('');
  const [due, setDue] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    getUsers().then(data => {
      setUsers(data);
      if (data.length > 0) setOwner(String(data[0].id));
    });
  }, []);

  const userOpts = useMemo(() => users.map(u => ({ value: String(u.id), label: `${u.name} (${u.role})` })), [users]);

  return (
    <div className="idet-modal-backdrop" onClick={onCancel}>
      <div className="idet-modal" onClick={e => e.stopPropagation()} role="dialog">
        <div className="idet-modal-header">
          <div>
            <div className="idet-modal-title">Assign incident</div>
            <div className="idet-modal-sub">{incident.incident_number} · holds it under triage without escalating</div>
          </div>
          <button className="idet-modal-close" onClick={onCancel}><Icon name="close" size={16}/></button>
        </div>
        <div className="idet-modal-body">
          <div className="modal-hint">
            Assign an owner to triage this incident. The owner will gather initial info and decide whether to escalate to a formal investigation or close it.
          </div>
          <div className="form-group">
            <label className="form-label">Owner</label>
            <ComboBox options={userOpts} value={owner} onChange={setOwner} placeholder="Search users…" />
          </div>
          <div className="form-group">
            <label className="form-label">Triage by</label>
            <input className="form-input" type="date" value={due} onChange={e => setDue(e.target.value)}/>
          </div>
          <div className="form-group">
            <label className="form-label">Notes <span className="optional">(optional)</span></label>
            <SmartTextarea
              value={notes}
              onChange={setNotes}
              rows={2}
              examples={['Verify affected worker has been seen by medical.', 'Check if the area has been made safe before shift change.', 'Collect witness names and initial statements.']}
              chips={['Verify medical status', 'Check area safety', 'Collect witness info']}
            />
          </div>
        </div>
        <div className="idet-modal-footer">
          <button className="modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="modal-confirm" disabled={!due || !owner} onClick={() => onConfirm({ assigned_to: Number(owner), triage_due: due, notes })}>
            <Icon name="person" size={14}/>Assign
          </button>
        </div>
      </div>
    </div>
  );
}
