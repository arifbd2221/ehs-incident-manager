import { useState, useEffect, useMemo } from 'react';
import Icon from '../../../components/shared/Icon';
import ComboBox from '../../../components/shared/ComboBox';
import SmartTextarea from '../../../components/shared/SmartTextarea';
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

  const userOpts = useMemo(() => users.map(u => ({ value: String(u.id), label: `${u.name} (${u.role})` })), [users]);
  const trackOpts = [
    { value: 'A', label: 'Track A — Full investigation' },
    { value: 'B', label: 'Track B — Light investigation' },
    { value: 'C', label: 'Track C — Log & close' },
  ];

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
              <ComboBox options={trackOpts} value={track} onChange={setTrack} searchable={false} />
            </div>
            <div className="form-group">
              <label className="form-label">Lead investigator</label>
              <ComboBox options={userOpts} value={lead} onChange={setLead} placeholder="Search users…" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes for investigator <span className="optional">(optional)</span></label>
            <SmartTextarea
              value={notes}
              onChange={setNotes}
              rows={3}
              examples={['Witness reports conflicting accounts — interview both shift leads.', 'Affected area has been cordoned off, photos taken by security.', 'CCTV footage available from camera 3B, request from IT.']}
              chips={['Witness statements needed', 'Area cordoned off', 'CCTV available']}
            />
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
