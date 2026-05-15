import { useState } from 'react';
import Icon from '../../../components/shared/Icon';
import ComboBox from '../../../components/shared/ComboBox';
import SmartTextarea from '../../../components/shared/SmartTextarea';
import { sevName } from '../../../components/shared/Badges';

const SEVS = [1, 2, 3, 4, 5];

export default function SeverityOverrideModal({ incident, onCancel, onConfirm }) {
  const [severity, setSeverity] = useState(incident.severity);
  const [reason, setReason] = useState('');
  const changed = Number(severity) !== incident.severity;
  const valid = changed && reason.trim().length > 0;

  return (
    <div className="idet-modal-backdrop" onClick={onCancel}>
      <div className="idet-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="sev-override-title">
        <div className="idet-modal-header">
          <div>
            <div className="idet-modal-title" id="sev-override-title">Override severity</div>
            <div className="idet-modal-sub">{incident.incident_number} · current: {sevName(incident.severity)}</div>
          </div>
          <button className="idet-modal-close" onClick={onCancel}><Icon name="close" size={16}/></button>
        </div>
        <div className="idet-modal-body">
          <div className="modal-hint">
            Auto-classified severity reflects the matrix score at submission. Override only if new evidence (photos, witness statements, medical reports) changes the picture. Track is recomputed and the change is logged with your name and reason for compliance audit.
          </div>
          <div className="form-group">
            <label className="form-label">New severity</label>
            <ComboBox
              options={SEVS.map(s => ({ value: String(s), label: `${sevName(s)}${s === incident.severity ? ' — current' : ''}` }))}
              value={String(severity)}
              onChange={v => setSeverity(Number(v))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Reason</label>
            <SmartTextarea
              value={reason}
              onChange={setReason}
              rows={3}
              inputClassName="form-textarea"
              placeholder="Explain why this override is justified — e.g. follow-up photos showed a compound fracture, hospitalisation now required, etc."
            />
          </div>
        </div>
        <div className="idet-modal-footer">
          <button className="modal-cancel" onClick={onCancel}>Cancel</button>
          <button
            className="modal-confirm"
            disabled={!valid}
            onClick={() => onConfirm({ severity: Number(severity), severity_override_reason: reason.trim() })}
          >
            <Icon name="warning" size={14}/>Override severity
          </button>
        </div>
      </div>
    </div>
  );
}
