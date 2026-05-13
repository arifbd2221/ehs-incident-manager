// ReassignLeadModal.jsx — post-creation lead investigator reassignment.
//
// The escalate flow on incidents already lets you pick a lead at creation;
// this modal is the after-the-fact equivalent. Submitting calls
// PATCH /investigations/:id with { lead_investigator } — the BE detects the
// change, upserts the investigation_team row to role='lead', writes a
// 'lead_reassigned' activity entry, and notifies the new lead.

import { useState, useEffect, useMemo } from 'react';
import Icon from '../../../components/shared/Icon';
import ComboBox from '../../../components/shared/ComboBox';
import { getUsers } from '../../../api/users';

export default function ReassignLeadModal({ investigation, onCancel, onConfirm }) {
  const [users, setUsers] = useState([]);
  const [lead, setLead] = useState(
    investigation.lead_investigator ? String(investigation.lead_investigator) : ''
  );

  useEffect(() => {
    getUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  const userOpts = useMemo(
    () => users.map(u => ({ value: String(u.id), label: `${u.name} (${u.role})` })),
    [users],
  );

  const currentLeadId = investigation.lead_investigator
    ? String(investigation.lead_investigator)
    : '';
  const unchanged = lead === currentLeadId;

  return (
    <div className="idet-modal-backdrop" onClick={onCancel}>
      <div className="idet-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="reassign-lead-title">
        <div className="idet-modal-header">
          <div>
            <div className="idet-modal-title" id="reassign-lead-title">Reassign lead investigator</div>
            <div className="idet-modal-sub">
              {investigation.investigation_number} · current lead: <b>{investigation.lead_name || 'Unassigned'}</b>
            </div>
          </div>
          <button className="idet-modal-close" onClick={onCancel}><Icon name="close" size={16}/></button>
        </div>
        <div className="idet-modal-body">
          <div className="modal-hint">
            The new lead will be added to the investigation team and notified.
            The previous lead keeps their team row (you can remove them
            separately if needed).
          </div>
          <div className="form-group">
            <label className="form-label">New lead</label>
            <ComboBox options={userOpts} value={lead} onChange={setLead} placeholder="Search users…" />
          </div>
        </div>
        <div className="idet-modal-footer">
          <button className="modal-cancel" onClick={onCancel}>Cancel</button>
          <button
            className="modal-confirm"
            disabled={!lead || unchanged}
            onClick={() => onConfirm({ lead_investigator: Number(lead) })}
          >
            <Icon name="person" size={14}/>Reassign
          </button>
        </div>
      </div>
    </div>
  );
}
