// ApprovalsPage.jsx — WI-B global pending-approval queue.
//
// Elevated roles (supervisor / ehs_officer / ehs_manager / admin) see every
// pending classification_override_request in their org. Workers get 403
// from the underlying endpoint and we render a permission-denied notice.
//
// Approve / Reject inline. Withdraw is reserved for the requester and is
// surfaced on the per-incident IncidentDetail card (RecordabilityVerifyCard);
// this page is the approver's view.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listPendingOverrideRequests,
  approveOverrideRequest,
  rejectOverrideRequest,
} from '../../api/override_requests';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../components/shared/Icon';
import SmartTextarea from '../../components/shared/SmartTextarea';
import { timeAgo, formatDate } from '../../utils/time';
import '../../styles/approvals.css';

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

const FIELD_LABELS = {
  osha_recordable: 'OSHA recordability',
  riddor_reportable: 'RIDDOR reportability',
};

function valueLabel(field, value) {
  const v = Number(value);
  if (field === 'osha_recordable') return v === 1 ? 'Recordable' : 'Not recordable';
  if (field === 'riddor_reportable') return v === 1 ? 'Reportable' : 'Not reportable';
  return String(value);
}

export default function ApprovalsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isElevated = ELEVATED_ROLES.has(user?.role);

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [noteDraft, setNoteDraft] = useState({});
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listPendingOverrideRequests()
      .then(d => { setRequests(d.requests || []); setForbidden(false); })
      .catch(e => {
        if (e?.response?.status === 403) setForbidden(true);
        else setError(e?.response?.data?.error || 'Failed to load approvals.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (rid, kind) => {
    setBusyId(rid);
    setError(null);
    try {
      const note = noteDraft[rid]?.trim() || undefined;
      if (kind === 'approve') await approveOverrideRequest(rid, note);
      else await rejectOverrideRequest(rid, note);
      setNoteDraft(prev => { const { [rid]: _, ...rest } = prev; return rest; });
      load();
    } catch (e) {
      setError(e?.response?.data?.error || 'Decision failed.');
    } finally {
      setBusyId(null);
    }
  };

  if (!isElevated || forbidden) {
    return (
      <div className="page">
        <div className="card card-pad apr-empty">
          <h2 className="apr-h">Approvals</h2>
          <p className="helper">
            This page lists pending recordability override requests for your organisation.
            Only supervisors, EHS officers, EHS managers, and admins can view or decide on them.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="apr-header">
        <div>
          <h2 className="apr-h">
            <Icon name="shield" size={20} color="var(--sds-brand-primary)"/> Approvals
            {requests.length > 0 && (
              <span className="pill pill-info apr-count">{requests.length} pending</span>
            )}
          </h2>
          <p className="helper apr-sub">
            Recordability override requests awaiting decision. Approving flips
            the boolean on the incident and writes the change to the audit log.
            You cannot decide on a request you submitted yourself.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}>
          <Icon name="refresh" size={13}/> Refresh
        </button>
      </div>

      {error && <div className="card card-pad apr-error">{error}</div>}

      {loading ? (
        <div className="card card-pad helper">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="card card-pad apr-empty">
          <div className="helper">No pending override requests.</div>
        </div>
      ) : (
        <div className="apr-list">
          {requests.map(r => {
            const isSelf = user?.id === r.requested_by;
            const noteVal = noteDraft[r.id] ?? '';
            return (
              <div key={r.id} className="card card-pad apr-row">
                <div className="apr-row-head">
                  <div className="apr-row-title">
                    <div>
                      <span className="pill pill-gray apr-tag">{r.jurisdiction || '—'}</span>
                      {FIELD_LABELS[r.field] || r.field}
                      {' · '}
                      <span className="pill pill-gray">{valueLabel(r.field, r.current_value)}</span>
                      {' → '}
                      <span className="pill pill-info">{valueLabel(r.field, r.proposed_value)}</span>
                    </div>
                    <div className="helper apr-row-meta">
                      Requested by <b>{r.requested_by_name || '—'}</b> · {timeAgo(r.requested_at)} ({formatDate(r.requested_at)})
                    </div>
                  </div>
                  <button
                    className="btn btn-text btn-sm"
                    onClick={() => navigate(`/incidents/${r.incident_id}`)}
                  >
                    {r.incident_number || `#${r.incident_id}`} — {r.incident_title || 'incident'} →
                  </button>
                </div>

                <div className="apr-reason">
                  <div className="form-label">Justification</div>
                  <div className="apr-reason-body">{r.reason}</div>
                </div>

                {isSelf ? (
                  <div className="helper apr-self">
                    You submitted this request. Another approver must decide on it. You can withdraw it from the incident detail page.
                  </div>
                ) : (
                  <div className="apr-decide">
                    <SmartTextarea
                      value={noteVal}
                      onChange={v => setNoteDraft(prev => ({ ...prev, [r.id]: v }))}
                      rows={2}
                      inputClassName="form-textarea"
                      placeholder="Optional decision note (visible in audit log)"
                    />
                    <div className="apr-actions">
                      <button className="btn btn-primary btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, 'approve')}>
                        <Icon name="check" size={13}/>{busyId === r.id ? 'Working…' : 'Approve'}
                      </button>
                      <button className="btn btn-secondary btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, 'reject')}>
                        <Icon name="close" size={13}/>{busyId === r.id ? 'Working…' : 'Reject'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
