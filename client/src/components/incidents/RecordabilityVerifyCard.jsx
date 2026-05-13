// RecordabilityVerifyCard.jsx — EHS-only 5-gate OSHA recordability verification.
//
// Walks the verifier through OSHA 1904.5 / 1904.7 gates in order:
//   covered_worker → work_related (+exception) → new_case → criterion → treatment.
// On submit, posts to /incidents/:id/recordability-verify and re-loads the
// detail. When already verified, shows a stamped summary with reasoning.
//
// Mirror of the constants in server/services/recordability.js. Both lists are
// short and stable; duplication here avoids a roundtrip just to render labels.

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../shared/Icon';
import ComboBox from '../shared/ComboBox';
import { verifyRecordability } from '../../api/incidents';
import {
  listOverrideRequestsForIncident,
  approveOverrideRequest,
  rejectOverrideRequest,
  withdrawOverrideRequest,
} from '../../api/override_requests';
import { useAuth } from '../../context/AuthContext';
import { formatDate, timeAgo } from '../../utils/time';
import OverrideRequestModal from '../../pages/incidents/modals/OverrideRequestModal';

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

const WORK_RELATEDNESS_EXCEPTIONS = [
  { id: 'visitor', label: 'Member of the public, not a covered employee' },
  { id: 'sign_symptom', label: 'Symptoms surfaced at work but cause was non-work' },
  { id: 'voluntary_wellness', label: 'Voluntary wellness / fitness / medical program' },
  { id: 'eating_drinking', label: 'Eating, drinking, or preparing personal food' },
  { id: 'personal_task', label: 'Personal task outside assigned hours' },
  { id: 'personal_grooming', label: 'Personal grooming or self-medication' },
  { id: 'motor_vehicle', label: 'Commute / parking-lot motor vehicle accident' },
  { id: 'common_cold_flu', label: 'Common cold or flu' },
  { id: 'mental_illness', label: 'Mental illness (unless work-related per 1904.5(b)(2)(ix))' },
];

const GENERAL_RECORDING_CRITERIA = [
  { id: 'death', label: 'Death' },
  { id: 'days_away', label: 'Days away from work' },
  { id: 'restricted_work', label: 'Restricted work or job transfer' },
  { id: 'medical_beyond_first_aid', label: 'Medical treatment beyond first aid' },
  { id: 'loss_of_consciousness', label: 'Loss of consciousness' },
  { id: 'significant_injury', label: 'Significant injury diagnosed by HCP' },
];

const FIRST_AID_TREATMENTS = [
  'Non-prescription medication at non-prescription strength',
  'Tetanus immunization',
  'Cleaning, flushing, or soaking surface wounds',
  'Wound coverings (bandages, gauze pads)',
  'Hot or cold therapy',
  'Non-rigid means of support (elastic bandages, wraps, non-rigid back belts)',
  'Temporary immobilization device for transport (splints, slings, neck collars)',
  'Drilling fingernail/toenail to relieve pressure or draining fluid from a blister',
  'Eye patches',
  'Removing foreign bodies from the eye using only irrigation or a cotton swab',
  'Removing splinters or foreign material from areas other than the eye by irrigation, tweezers, cotton swabs, or other simple means',
  'Finger guards',
  'Massages',
  'Drinking fluids for relief of heat stress',
];

const TYPE_LABELS = {
  death: 'Death',
  days_away: 'Days away (DART)',
  job_transfer: 'Restricted / job transfer',
  other_recordable: 'Other recordable',
  first_aid: 'First aid only',
};

// `canVerify` (default true for back-compat) gates the verify form, re-verify
// button, and submit. When false, non-EHS viewers see the verified summary
// (or a "pending" notice) and may still submit an override request through
// the existing banner — they just can't make the verification call directly.
export default function RecordabilityVerifyCard({ incident, onVerified, canVerify = true }) {
  const { user } = useAuth();
  const isElevated = ELEVATED_ROLES.has(user?.role);
  const alreadyVerified = !!incident.osha_recordable_verified_at;

  const [open, setOpen] = useState(!alreadyVerified && canVerify);
  const [coveredWorker, setCoveredWorker] = useState('');
  const [workRelated, setWorkRelated] = useState('');
  const [exceptionId, setExceptionId] = useState('');
  const [newCase, setNewCase] = useState('');
  const [criterionId, setCriterionId] = useState('');
  const [treatmentChoice, setTreatmentChoice] = useState('');
  const [privacyCase, setPrivacyCase] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [decision, setDecision] = useState(null);

  // WI-B: override requests pending on osha_recordable. Refreshed
  // whenever the incident reloads (onVerified bumps the parent's
  // refresh key) or when the modal closes after a successful submit.
  const [overrideRequests, setOverrideRequests] = useState([]);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideError, setOverrideError] = useState(null);
  const [overrideBusyId, setOverrideBusyId] = useState(null);

  useEffect(() => {
    if (!incident?.id) return;
    listOverrideRequestsForIncident(incident.id)
      .then(d => setOverrideRequests(d.requests || []))
      .catch(() => setOverrideRequests([]));
  }, [incident?.id, incident?.osha_recordable, incident?.osha_recordable_verified_at]);

  const pendingOshaRequest = overrideRequests.find(
    r => r.status === 'pending' && r.field === 'osha_recordable',
  );

  const refreshOverrides = async () => {
    try {
      const d = await listOverrideRequestsForIncident(incident.id);
      setOverrideRequests(d.requests || []);
    } catch { /* swallow — list will retry on next render */ }
  };

  const handleApprove = async (rid) => {
    setOverrideBusyId(rid);
    setOverrideError(null);
    try {
      await approveOverrideRequest(rid);
      await refreshOverrides();
      if (onVerified) onVerified();
    } catch (e) {
      setOverrideError(e?.response?.data?.error || 'Failed to approve request.');
    } finally {
      setOverrideBusyId(null);
    }
  };

  const handleReject = async (rid) => {
    setOverrideBusyId(rid);
    setOverrideError(null);
    try {
      await rejectOverrideRequest(rid);
      await refreshOverrides();
    } catch (e) {
      setOverrideError(e?.response?.data?.error || 'Failed to reject request.');
    } finally {
      setOverrideBusyId(null);
    }
  };

  const handleWithdraw = async (rid) => {
    setOverrideBusyId(rid);
    setOverrideError(null);
    try {
      await withdrawOverrideRequest(rid);
      await refreshOverrides();
    } catch (e) {
      setOverrideError(e?.response?.data?.error || 'Failed to withdraw request.');
    } finally {
      setOverrideBusyId(null);
    }
  };

  const canSubmit = (() => {
    if (coveredWorker === '') return false;
    if (coveredWorker === 'no') return true;
    if (workRelated === '') return false;
    if (workRelated === 'no') return !!exceptionId;
    if (newCase === '') return false;
    if (newCase === 'no') return true;
    return !!criterionId;
  })();

  const reset = () => {
    setCoveredWorker('');
    setWorkRelated('');
    setExceptionId('');
    setNewCase('');
    setCriterionId('');
    setTreatmentChoice('');
    setPrivacyCase(false);
    setError(null);
    setDecision(null);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const gates = {
        covered_worker: coveredWorker === 'yes',
        work_related: workRelated === 'yes',
        work_related_exception_id: workRelated === 'no' ? exceptionId : null,
        new_case: newCase === 'yes',
        criterion_id: criterionId || null,
        treatment_choice: treatmentChoice || null,
        privacy_case: privacyCase,
      };
      const res = await verifyRecordability(incident.id, gates);
      setDecision(res.decision);
      if (onVerified) onVerified();
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to verify');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="idet-card">
      <div className="idet-card-h">
        <div className="hicon hi-verify"><Icon name="shield" size={16}/></div>
        EHS recordability verification
        {alreadyVerified && (
          <span className="rv-stamp">
            <Icon name="check" size={11}/>Verified
          </span>
        )}
      </div>
      <div className="idet-card-body">
        {alreadyVerified && !decision ? (
          <div className="rv-summary">
            <div className={`rv-result ${incident.osha_recordable ? 'rv-yes' : 'rv-no'}`}>
              <div className="rv-result-label">{incident.osha_recordable ? 'OSHA recordable' : 'Not OSHA recordable'}</div>
              <div className="rv-result-type">{TYPE_LABELS[incident.osha_recordability_type] || '—'}</div>
            </div>
            <div className="rv-meta">
              Verified by <b>{incident.verified_by_name || 'EHS'}</b> on <b>{formatDate(incident.osha_recordable_verified_at)}</b>.
              The decision flows to OSHA 300 Log automatically.
            </div>

            {pendingOshaRequest && (
              <OverrideRequestBanner
                request={pendingOshaRequest}
                currentUserId={user?.id}
                isElevated={isElevated}
                busy={overrideBusyId === pendingOshaRequest.id}
                onApprove={() => handleApprove(pendingOshaRequest.id)}
                onReject={() => handleReject(pendingOshaRequest.id)}
                onWithdraw={() => handleWithdraw(pendingOshaRequest.id)}
              />
            )}
            {overrideError && <div className="rv-error">{overrideError}</div>}

            <div className="rv-actions" style={{ marginTop: 8 }}>
              {canVerify && (
                <button className="rv-reverify" onClick={() => { reset(); setOpen(true); }}>
                  <Icon name="edit" size={13}/>Re-verify
                </button>
              )}
              {!pendingOshaRequest && (
                <button className="rv-reverify" onClick={() => setOverrideModalOpen(true)}>
                  <Icon name="shield" size={13}/>Request override
                </button>
              )}
            </div>
          </div>
        ) : decision ? (
          <div className="rv-decision-out">
            <div className={`rv-result ${decision.recordable ? 'rv-yes' : 'rv-no'}`}>
              <div className="rv-result-label">
                {decision.recordable ? 'Decision: OSHA recordable' : 'Decision: Not OSHA recordable'}
              </div>
              <div className="rv-result-type">{TYPE_LABELS[decision.type] || '—'}</div>
            </div>
            <ul className="rv-reasoning">
              {decision.reasoning.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <div className="rv-meta">Saved to the incident and the activity log.</div>
            {canVerify && (
              <button className="rv-reverify" onClick={() => { reset(); setDecision(null); setOpen(true); }}>
                <Icon name="edit" size={13}/>Re-verify
              </button>
            )}
          </div>
        ) : open ? (
          <div className="rv-form">
            <div className="rv-hint">
              Walk through OSHA 1904 gates in order. Each answer narrows the next question.
            </div>

            <div className="rv-gate">
              <div className="rv-gate-label"><span className="rv-gate-num">1</span>Covered employee?</div>
              <div className="rv-radio-row">
                <button
                  type="button"
                  className={`rv-radio ${coveredWorker === 'yes' ? 'is-on' : ''}`}
                  onClick={() => setCoveredWorker('yes')}
                >Yes</button>
                <button
                  type="button"
                  className={`rv-radio ${coveredWorker === 'no' ? 'is-on' : ''}`}
                  onClick={() => setCoveredWorker('no')}
                >No</button>
              </div>
            </div>

            {coveredWorker === 'yes' && (
              <div className="rv-gate">
                <div className="rv-gate-label"><span className="rv-gate-num">2</span>Work-related?</div>
                <div className="rv-radio-row">
                  <button
                    type="button"
                    className={`rv-radio ${workRelated === 'yes' ? 'is-on' : ''}`}
                    onClick={() => setWorkRelated('yes')}
                  >Yes</button>
                  <button
                    type="button"
                    className={`rv-radio ${workRelated === 'no' ? 'is-on' : ''}`}
                    onClick={() => setWorkRelated('no')}
                  >No</button>
                </div>
              </div>
            )}

            {workRelated === 'no' && (
              <div className="rv-gate">
                <div className="rv-gate-label">Exception that applies</div>
                <ComboBox
                  className="rv-select"
                  value={exceptionId}
                  onChange={setExceptionId}
                  placeholder="— select —"
                  options={WORK_RELATEDNESS_EXCEPTIONS.map(x => ({ value: x.id, label: x.label }))}
                />
              </div>
            )}

            {workRelated === 'yes' && (
              <div className="rv-gate">
                <div className="rv-gate-label"><span className="rv-gate-num">3</span>New case?</div>
                <div className="rv-radio-row">
                  <button
                    type="button"
                    className={`rv-radio ${newCase === 'yes' ? 'is-on' : ''}`}
                    onClick={() => setNewCase('yes')}
                  >Yes</button>
                  <button
                    type="button"
                    className={`rv-radio ${newCase === 'no' ? 'is-on' : ''}`}
                    onClick={() => setNewCase('no')}
                  >No</button>
                </div>
              </div>
            )}

            {newCase === 'yes' && (
              <div className="rv-gate">
                <div className="rv-gate-label"><span className="rv-gate-num">4</span>Recording criterion met</div>
                <ComboBox
                  className="rv-select"
                  value={criterionId}
                  onChange={setCriterionId}
                  placeholder="— none / first aid only —"
                  options={GENERAL_RECORDING_CRITERIA.map(c => ({ value: c.id, label: c.label }))}
                />
              </div>
            )}

            {newCase === 'yes' && criterionId && (
              <div className="rv-gate">
                <div className="rv-gate-label"><span className="rv-gate-num">5</span>Treatment <span className="rv-optional">(optional)</span></div>
                <ComboBox
                  className="rv-select"
                  value={treatmentChoice}
                  onChange={setTreatmentChoice}
                  placeholder="— select if first aid —"
                  options={FIRST_AID_TREATMENTS.map(t => ({ value: t, label: t }))}
                />
                <div className="rv-checkbox-row">
                  <label>
                    <input type="checkbox" checked={privacyCase} onChange={e => setPrivacyCase(e.target.checked)}/>
                    Privacy case (1904.29(b)(7)) — suppress name on 300 Log
                  </label>
                </div>
              </div>
            )}

            {error && <div className="rv-error">{error}</div>}

            <div className="rv-actions">
              {alreadyVerified && (
                <button className="rv-cancel" onClick={() => { reset(); setOpen(false); }}>Cancel</button>
              )}
              <button
                className="rv-submit"
                disabled={!canSubmit || submitting}
                onClick={submit}
              >
                {submitting ? 'Verifying…' : 'Verify recordability'}
              </button>
            </div>
          </div>
        ) : !canVerify ? (
          <div className="rv-summary">
            <div className="rv-meta">
              Awaiting verification by an EHS officer. The 1904 recordability
              call is reserved for EHS — supervisors can submit an override
              request once a verification is recorded.
            </div>
          </div>
        ) : null}
      </div>

      {overrideModalOpen && createPortal(
        <OverrideRequestModal
          incident={incident}
          field="osha_recordable"
          onCancel={() => setOverrideModalOpen(false)}
          onSubmitted={async () => {
            setOverrideModalOpen(false);
            await refreshOverrides();
          }}
        />,
        document.body,
      )}
    </div>
  );
}

// Inline banner shown when a pending override request exists for this
// incident's osha_recordable. Approve/Reject for elevated approvers
// (anyone but the requester); Withdraw for the requester.
function OverrideRequestBanner({ request, currentUserId, isElevated, busy, onApprove, onReject, onWithdraw }) {
  const isRequester = currentUserId === request.requested_by;
  const canDecide = isElevated && !isRequester;
  const proposedLabel = request.proposed_value === 1 ? 'Recordable' : 'Not recordable';

  return (
    <div className="rv-summary" style={{
      borderLeft: '3px solid var(--sds-warning)',
      paddingLeft: 12,
      marginTop: 12,
    }}>
      <div className="rv-result-label" style={{ fontSize: 13 }}>
        <Icon name="warning" size={13} color="var(--sds-warning)"/> Override pending review
      </div>
      <div className="rv-meta">
        <b>{request.requested_by_name || 'Requester'}</b> proposed: <b>{proposedLabel}</b>
        {' · '}{timeAgo(request.requested_at)}
      </div>
      <div className="rv-meta" style={{ whiteSpace: 'pre-wrap' }}>
        {request.reason}
      </div>
      <div className="rv-actions" style={{ marginTop: 8, gap: 8 }}>
        {canDecide && (
          <>
            <button className="rv-submit" disabled={busy} onClick={onApprove}>
              <Icon name="check" size={13}/>{busy ? 'Approving…' : 'Approve'}
            </button>
            <button className="rv-reverify" disabled={busy} onClick={onReject}>
              <Icon name="close" size={13}/>{busy ? 'Rejecting…' : 'Reject'}
            </button>
          </>
        )}
        {isRequester && (
          <button className="rv-reverify" disabled={busy} onClick={onWithdraw}>
            <Icon name="close" size={13}/>{busy ? 'Withdrawing…' : 'Withdraw'}
          </button>
        )}
        {!canDecide && !isRequester && (
          <span className="helper">Awaiting decision by an EHS Officer, EHS Manager, or Admin.</span>
        )}
      </div>
    </div>
  );
}
