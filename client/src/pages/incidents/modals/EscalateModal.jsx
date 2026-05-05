import { useState, useEffect } from 'react';
import Icon from '../../../components/shared/Icon';
import { getUsers } from '../../../api/users';

export default function EscalateModal({ incident, onCancel, onConfirm }) {
  const [users, setUsers] = useState([]);
  const [lead, setLead] = useState('');
  const [track, setTrack] = useState(incident.track || 'A');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    getUsers().then(data => {
      setUsers(data);
      if (data.length > 0) setLead(String(data[0].id));
    });
  }, []);

  return (
    <div className="idet-modal-backdrop" onClick={onCancel}>
      <div className="idet-modal" onClick={e => e.stopPropagation()} role="dialog">
        <div className="idet-modal-header">
          <div>
            <div className="idet-modal-title">Escalate to investigation</div>
            <div className="idet-modal-sub">{incident.incident_number} · creates a formal investigation file</div>
          </div>
          <button className="idet-modal-close" onClick={onCancel}><Icon name="close" size={16}/></button>
        </div>
        <div className="idet-modal-body">
          <div className="modal-info-banner">
            <div className="info-icon"><Icon name="info" size={14}/></div>
            <div className="info-text">
              <b>Auto-classified Sev {incident.severity} → Track {incident.track}</b><br/>
              Track A = full investigation, Track B = light, Track C = log & close. You can override below.
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Investigation track</label>
              <select className="form-select" value={track} onChange={e => setTrack(e.target.value)}>
                <option value="A">Track A — Full investigation</option>
                <option value="B">Track B — Light investigation</option>
                <option value="C">Track C — Log & close</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Lead investigator</label>
              <select className="form-select" value={lead} onChange={e => setLead(e.target.value)}>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes for investigator <span className="optional">(optional)</span></label>
            <textarea className="form-textarea" rows={3} placeholder="Anything the investigator should know up front." value={notes} onChange={e => setNotes(e.target.value)}/>
          </div>
        </div>
        <div className="idet-modal-footer">
          <button className="modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="modal-confirm" onClick={() => onConfirm({ lead_investigator: Number(lead), track, notes })}>
            <Icon name="investigation" size={14}/>Escalate & open investigation
          </button>
        </div>
      </div>
    </div>
  );
}
