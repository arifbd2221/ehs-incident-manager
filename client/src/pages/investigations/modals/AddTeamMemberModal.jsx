// AddTeamMemberModal.jsx — add a non-lead member to the investigation team.
//
// Lead assignment goes through ReassignLeadModal (which patches the
// investigation row). This modal hits POST /investigations/:id/team and
// only adds 'member'-role rows; the BE rejects role='lead' here so the
// canonical lead always flows through the lead_investigator column.

import { useState, useEffect, useMemo } from 'react';
import Icon from '../../../components/shared/Icon';
import ComboBox from '../../../components/shared/ComboBox';
import { getUsers } from '../../../api/users';

export default function AddTeamMemberModal({ investigation, onCancel, onConfirm }) {
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState('');

  useEffect(() => {
    getUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  // Exclude users already on the team so the picker can't produce a 409.
  const onTeam = useMemo(
    () => new Set((investigation.team || []).map(t => t.user_id)),
    [investigation.team],
  );
  const userOpts = useMemo(
    () => users
      .filter(u => !onTeam.has(u.id))
      .map(u => ({ value: String(u.id), label: `${u.name} (${u.role})` })),
    [users, onTeam],
  );

  return (
    <div className="idet-modal-backdrop" onClick={onCancel}>
      <div className="idet-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="add-member-title">
        <div className="idet-modal-header">
          <div>
            <div className="idet-modal-title" id="add-member-title">Add team member</div>
            <div className="idet-modal-sub">{investigation.investigation_number}</div>
          </div>
          <button className="idet-modal-close" onClick={onCancel}><Icon name="close" size={16}/></button>
        </div>
        <div className="idet-modal-body">
          <div className="modal-hint">
            Adds the person as a member of the investigation. To make them
            the lead, use the lead actions instead.
          </div>
          <div className="form-group">
            <label className="form-label">Person</label>
            <ComboBox
              options={userOpts}
              value={userId}
              onChange={setUserId}
              placeholder={userOpts.length === 0 ? 'Everyone is already on the team' : 'Search users…'}
              disabled={userOpts.length === 0}
            />
          </div>
        </div>
        <div className="idet-modal-footer">
          <button className="modal-cancel" onClick={onCancel}>Cancel</button>
          <button
            className="modal-confirm"
            disabled={!userId}
            onClick={() => onConfirm({ user_id: Number(userId) })}
          >
            <Icon name="plus" size={14}/>Add member
          </button>
        </div>
      </div>
    </div>
  );
}
