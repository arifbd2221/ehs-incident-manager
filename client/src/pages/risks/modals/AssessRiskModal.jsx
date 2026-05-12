import { useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../../components/shared/Icon';
import RiskMatrix, { SEV_GRID, SEV_NUM, LEVEL_NAMES, LEVEL_COLORS } from '../../../components/shared/RiskMatrix';
import { assessRisk } from '../../../api/risks';

export default function AssessRiskModal({ riskId, riskNumber, onCancel, onAssessed }) {
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
      const updated = await assessRisk(riskId, {
        inherent_likelihood: selectedL,
        inherent_consequence: selectedC,
      });
      onAssessed(updated);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to assess risk');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <div>
            <div className="modal-title">Assess Inherent Risk</div>
            <div className="modal-sub">{riskNumber} — Select likelihood and consequence</div>
          </div>
          <button className="icon-btn" onClick={onCancel}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">
          <RiskMatrix
            likelihood={selectedL}
            consequence={selectedC}
            onPick={(y, x) => { setSelectedL(y); setSelectedC(x); }}
          />

          {level && (
            <div className="arsk-result">
              <div className="arsk-result-sev" style={{ color: LEVEL_COLORS[level] }}>S{severity}</div>
              <div className="arsk-result-label" style={{ color: LEVEL_COLORS[level] }}>
                {LEVEL_NAMES[level]} Risk
              </div>
              <div style={{ fontSize: 11, color: 'var(--sds-fg-tertiary)', marginTop: 6 }}>
                Click a different cell to change your selection
              </div>
            </div>
          )}

          {error && <div style={{ color: 'var(--sds-error)', fontSize: 13, marginTop: 12 }}>{error}</div>}
        </div>
        <div className="modal-f">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!level || submitting}>
            {submitting ? 'Assessing...' : 'Confirm Assessment'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
