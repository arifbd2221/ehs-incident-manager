import { useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../../components/shared/Icon';
import RiskMatrix, { SEV_GRID, SEV_NUM, LEVEL_NAMES, LEVEL_COLORS } from '../../../components/shared/RiskMatrix';
import { controlRisk } from '../../../api/risks';

export default function ResidualScoreModal({ riskId, riskNumber, inherentLevel, onCancel, onControlled }) {
  const [selectedL, setSelectedL] = useState(null);
  const [selectedC, setSelectedC] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const level = selectedL != null && selectedC != null ? SEV_GRID[selectedL][selectedC] : null;
  const severity = level ? SEV_NUM[level] : null;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await controlRisk(riskId, {
        residual_likelihood: selectedL,
        residual_consequence: selectedC,
      });
      onControlled(updated);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to score residual risk');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <div>
            <div className="modal-title">Score Residual Risk</div>
            <div className="modal-sub">{riskNumber} — Rate risk level after controls are in place</div>
          </div>
          <button className="icon-btn" onClick={onCancel}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">
          {inherentLevel && (
            <div style={{
              fontSize: 12, color: 'var(--sds-fg-secondary)', marginBottom: 16,
              padding: '10px 14px', borderRadius: 10, background: 'var(--sds-bg-surface-alt)'
            }}>
              Inherent risk was rated <strong style={{ color: LEVEL_COLORS[inherentLevel] }}>
                {LEVEL_NAMES[inherentLevel]}
              </strong>. Select the residual risk level after controls.
            </div>
          )}

          <RiskMatrix
            likelihood={selectedL}
            consequence={selectedC}
            onPick={(y, x) => { setSelectedL(y); setSelectedC(x); }}
          />

          {level && (
            <div className="arsk-result">
              <div className="arsk-result-sev" style={{ color: LEVEL_COLORS[level] }}>S{severity}</div>
              <div className="arsk-result-label" style={{ color: LEVEL_COLORS[level] }}>
                {LEVEL_NAMES[level]} Residual Risk
              </div>
            </div>
          )}

          {error && <div style={{ color: 'var(--sds-error)', fontSize: 13, marginTop: 12 }}>{error}</div>}
        </div>
        <div className="modal-f">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!level || submitting}>
            {submitting ? 'Saving...' : 'Mark Controlled'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
