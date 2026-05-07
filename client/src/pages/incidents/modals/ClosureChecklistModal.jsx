import { useState, useEffect } from 'react';
import Icon from '../../../components/shared/Icon';
import SmartTextarea from '../../../components/shared/SmartTextarea';
import ComboBox from '../../../components/shared/ComboBox';
import { getClosureChecklist } from '../../../api/incidents';

const GATE_LABELS = {
  capasComplete: 'All CAPAs verified effective',
  investigationClosed: 'Investigation closed',
  rootCauseDocumented: 'Root cause documented',
  osha300Entry: 'OSHA 300 log entry',
  riddorFiled: 'RIDDOR report filed',
  managerApproval: 'Manager approval',
};

const CLOSE_REASONS = [
  { value: 'resolved', label: 'Resolved — corrective actions verified' },
  { value: 'first-aid', label: 'First-aid only — no recordable case' },
  { value: 'observation', label: 'Observation logged — no incident' },
  { value: 'duplicate', label: 'Duplicate of another report' },
  { value: 'not-work-related', label: 'Not work-related' },
  { value: 'superseded', label: 'Superseded by later report' },
  { value: 'resolved-scene', label: 'Already resolved at scene' },
];

export default function ClosureChecklistModal({ incident, onCancel, onClose, onRequestClosure, onForceClose, userRole }) {
  const [checklist, setChecklist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('resolved');
  const [notes, setNotes] = useState('');
  const [summary, setSummary] = useState('');
  const [lessons, setLessons] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getClosureChecklist(incident.id).then(data => {
      setChecklist(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [incident.id]);

  if (loading) {
    return (
      <div className="idet-modal-backdrop" onClick={onCancel}>
        <div className="idet-modal" onClick={e => e.stopPropagation()}>
          <div className="idet-modal-body" style={{ textAlign: 'center', padding: 40 }}>Loading checklist...</div>
        </div>
      </div>
    );
  }

  if (!checklist) return null;
  const { track, canClose, requiresApproval, gates } = checklist;
  const isTrackC = track === 'C';
  const isTrackA = track === 'A';
  const hasPendingRequest = gates.managerApproval?.pendingRequest;

  const prerequisitesPassed = gates.capasComplete.passed && gates.investigationClosed.passed &&
    gates.rootCauseDocumented.passed && gates.osha300Entry.passed && gates.riddorFiled.passed;

  const handleClose = async () => {
    setSubmitting(true);
    try {
      await onClose({ reason, notes });
    } finally { setSubmitting(false); }
  };

  const handleRequestClosure = async () => {
    setSubmitting(true);
    try {
      await onRequestClosure({ closure_summary: summary, lessons_learned: lessons });
    } finally { setSubmitting(false); }
  };

  const handleForceClose = async () => {
    setSubmitting(true);
    try {
      await onForceClose({ reason, notes });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="idet-modal-backdrop" onClick={onCancel}>
      <div className="idet-modal idet-modal-lg" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="idet-modal-header">
          <div>
            <div className="idet-modal-title">
              {isTrackC ? 'Close incident' : `Close incident — Track ${track}`}
            </div>
            <div className="idet-modal-sub">{incident.incident_number} · {incident.title}</div>
          </div>
          <button className="idet-modal-close" onClick={onCancel}><Icon name="close" size={16}/></button>
        </div>

        <div className="idet-modal-body">
          {!isTrackC && (
            <div className="closure-gates">
              <div className="closure-gates-title">Closure readiness checklist</div>
              {Object.entries(gates).map(([key, gate]) => {
                if (!gate.required) return null;
                return (
                  <div key={key} className={`closure-gate ${gate.passed ? 'passed' : 'blocked'}`}>
                    <div className={`closure-gate-icon ${gate.passed ? 'passed' : 'blocked'}`}>
                      <Icon name={gate.passed ? 'check' : 'close'} size={14}/>
                    </div>
                    <div className="closure-gate-info">
                      <div className="closure-gate-label">{GATE_LABELS[key]}</div>
                      <div className="closure-gate-detail">{gate.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Track C or Track B with gates passed: show close form */}
          {(isTrackC || (track === 'B' && prerequisitesPassed)) && (
            <>
              <div className="form-group">
                <label className="form-label">Closure reason</label>
                <ComboBox options={CLOSE_REASONS} value={reason} onChange={setReason} searchable={false}/>
              </div>
              <div className="form-group">
                <label className="form-label">Notes <span className="optional">(optional)</span></label>
                <SmartTextarea value={notes} onChange={setNotes} rows={3}
                  examples={['Corrective actions verified effective.', 'First aid only, no further action.']}
                  chips={['CAPAs verified', 'No further action']}/>
              </div>
            </>
          )}

          {/* Track A with prerequisites met: show closure request form */}
          {isTrackA && prerequisitesPassed && !hasPendingRequest && (
            <>
              <div className="closure-section-title">Closure request</div>
              <div className="closure-section-hint">Track A incidents require manager approval. Submit a closure request with your summary and lessons learned.</div>
              <div className="form-group">
                <label className="form-label">Closure summary <span className="req">*</span></label>
                <SmartTextarea value={summary} onChange={setSummary} rows={3}
                  examples={['All corrective actions implemented and verified. Root cause addressed.']}
                  chips={['Root cause addressed', 'Controls implemented', 'Training completed']}/>
              </div>
              <div className="form-group">
                <label className="form-label">Lessons learned <span className="req">*</span></label>
                <SmartTextarea value={lessons} onChange={setLessons} rows={3}
                  examples={['Equipment guard design should be reviewed during procurement.']}
                  chips={['Process improvement', 'Training gap identified', 'Equipment modification needed']}/>
              </div>
            </>
          )}

          {isTrackA && hasPendingRequest && (
            <div className="closure-pending-banner">
              <Icon name="clock" size={16}/> A closure request is already pending manager review.
            </div>
          )}
        </div>

        <div className="idet-modal-footer">
          <button className="modal-cancel" onClick={onCancel}>Cancel</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {userRole === 'admin' && !canClose && (
              <button className="modal-force" onClick={handleForceClose} disabled={submitting}>
                <Icon name="warning" size={14}/>Force close
              </button>
            )}
            {(isTrackC || (track === 'B' && prerequisitesPassed)) && (
              <button className="modal-confirm" onClick={handleClose} disabled={submitting || !reason}>
                <Icon name="check" size={14}/>{submitting ? 'Closing...' : 'Close incident'}
              </button>
            )}
            {isTrackA && prerequisitesPassed && !hasPendingRequest && (
              <button className="modal-confirm" onClick={handleRequestClosure}
                disabled={submitting || !summary.trim() || !lessons.trim()}>
                <Icon name="check" size={14}/>{submitting ? 'Submitting...' : 'Request closure approval'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
