import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import Icon from '../../components/shared/Icon';
import EmptyState, { EmptyWhysIllustration } from '../../components/shared/EmptyState';
import { LEVEL_NAMES } from '../../components/shared/RiskMatrix';
import { useAuth } from '../../context/AuthContext';
import { getRisk, mitigateRisk, closeRisk, deleteControl } from '../../api/risks';
import AssessRiskModal from './modals/AssessRiskModal';
import AddControlModal from './modals/AddControlModal';
import ResidualScoreModal from './modals/ResidualScoreModal';
import AcceptRiskModal from './modals/AcceptRiskModal';
import '../../styles/risks.css';

const ELEVATED = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const LIKELIHOOD_LABELS = ['Almost Certain', 'Likely', 'Possible', 'Unlikely', 'Rare'];
const CONSEQUENCE_LABELS = ['Insignificant', 'Minor', 'Moderate', 'Major', 'Catastrophic'];
const CAT_LABELS = {
  safety: 'Safety', health: 'Health', environmental: 'Environmental',
  ergonomic: 'Ergonomic', chemical: 'Chemical', biological: 'Biological',
  physical: 'Physical', psychosocial: 'Psychosocial', other: 'Other',
};
const CTRL_LABELS = {
  elimination: 'Elimination', substitution: 'Substitution',
  engineering: 'Engineering', administrative: 'Administrative', ppe: 'PPE',
};
const CTRL_INITIALS = {
  elimination: 'E', substitution: 'S', engineering: 'EN', administrative: 'A', ppe: 'P',
};
const EFF_LABELS = {
  pending: 'Pending', effective: 'Effective',
  partially_effective: 'Partial', ineffective: 'Ineffective',
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function tlIcon(action) {
  const map = {
    created: 'plus', assessed: 'eye', mitigation_started: 'shield',
    controlled: 'check', accepted: 'check', closed: 'close',
    updated: 'edit', control_added: 'plus', control_updated: 'edit', control_removed: 'close',
  };
  return map[action] || 'info';
}

export default function RiskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canAct = ELEVATED.has(user?.role);

  const [risk, setRisk] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const [showAssess, setShowAssess] = useState(false);
  const [showAddCtrl, setShowAddCtrl] = useState(false);
  const [showResidual, setShowResidual] = useState(false);
  const [showAccept, setShowAccept] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getRisk(id);
      setRisk(data);
    } catch {
      setRisk(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  };

  const handleMitigate = async () => {
    try {
      await mitigateRisk(id);
      showToast('Mitigation started');
      load();
    } catch (e) {
      showToast(e.response?.data?.error || 'Failed');
    }
  };

  const handleClose = async () => {
    try {
      await closeRisk(id, {});
      showToast('Risk closed');
      load();
    } catch (e) {
      showToast(e.response?.data?.error || 'Failed');
    }
  };

  const handleDeleteControl = async (ctrlId) => {
    try {
      await deleteControl(id, ctrlId);
      showToast('Control removed');
      load();
    } catch (e) {
      showToast(e.response?.data?.error || 'Failed');
    }
  };

  if (loading) {
    return (
      <div className="page rskd">
        <div className="rsk-loading">
          <div className="rsk-spinner" />
        </div>
      </div>
    );
  }

  if (!risk) {
    return (
      <div className="page rskd">
        <EmptyState
          illustration={<EmptyWhysIllustration />}
          title="Risk not found"
          accent="warning"
          action={(
            <button className="btn btn-secondary" onClick={() => navigate('/risks')}>Back to register</button>
          )}
        />
      </div>
    );
  }

  const r = risk;

  return (
    <div className="page rskd">
      <button className="rskd-back" onClick={() => navigate('/risks')}>
        <Icon name="arrowL" size={16} /> Back to Risk Register
      </button>

      {/* Hero */}
      <div className="rskd-hero">
        <div className="rskd-hero-top">
          <div>
            <div className="rskd-meta-row">
              <span className="rskd-number">{r.risk_number}</span>
              <span className="rsk-cat">{CAT_LABELS[r.category] || r.category}</span>
            </div>
            <div className="rskd-title">{r.title}</div>
            <div className="rskd-badges">
              <span className={`rsk-status rsk-status-${r.status}`}>
                <span className="rsk-status-dot" />
                {r.status}
              </span>
              {r.inherent_risk_level && (
                <span className={`rsk-level rsk-level-${r.inherent_risk_level}`}>
                  <span className="rsk-level-dot" />
                  Inherent: {LEVEL_NAMES[r.inherent_risk_level]}
                </span>
              )}
              {r.residual_risk_level && (
                <span className={`rsk-level rsk-level-${r.residual_risk_level}`}>
                  <span className="rsk-level-dot" />
                  Residual: {LEVEL_NAMES[r.residual_risk_level]}
                </span>
              )}
            </div>
          </div>
          {canAct && (
            <div className="rskd-hero-actions">
              {r.status === 'Identified' && (
                <button className="btn btn-primary" onClick={() => setShowAssess(true)}>
                  <Icon name="eye" size={14} /> Assess Risk
                </button>
              )}
              {r.status === 'Assessed' && (
                <button className="btn btn-primary" onClick={handleMitigate}>
                  <Icon name="shield" size={14} /> Begin Mitigation
                </button>
              )}
              {r.status === 'Mitigating' && (
                <button className="btn btn-primary" onClick={() => setShowResidual(true)}>
                  <Icon name="check" size={14} /> Mark Controlled
                </button>
              )}
              {r.status === 'Controlled' && (
                <>
                  <button className="btn btn-secondary" onClick={() => setShowAccept(true)}>
                    Accept Risk
                  </button>
                  <button className="btn btn-primary" onClick={handleClose}>
                    <Icon name="close" size={14} /> Close Risk
                  </button>
                </>
              )}
              {r.status === 'Accepted' && (
                <button className="btn btn-primary" onClick={handleClose}>
                  <Icon name="close" size={14} /> Close Risk
                </button>
              )}
              {r.status === 'Closed' && (
                <button className="btn btn-secondary" disabled>Closed</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="rskd-grid">
        {/* Main column */}
        <div className="rskd-main">
          {/* Description */}
          <div className="rskd-card">
            <div className="rskd-card-h">
              <div className="hicon hi-desc"><Icon name="file" size={15} /></div>
              Description
            </div>
            <div className="rskd-card-body">
              {r.description ? (
                <div className="rskd-desc">{r.description}</div>
              ) : (
                <div className="rskd-empty">No description provided</div>
              )}
            </div>
          </div>

          {/* Risk Scores */}
          <div className="rskd-card">
            <div className="rskd-card-h">
              <div className="hicon hi-score"><Icon name="pulse" size={15} /></div>
              Risk Scores
            </div>
            <div className="rskd-card-body">
              <div className="rskd-scores">
                <div className="rskd-score-col">
                  <div className="rskd-score-label">Inherent Risk</div>
                  <div className={`rskd-score-ring ring-${r.inherent_risk_level || 'none'}`}>
                    {r.inherent_severity ? `S${r.inherent_severity}` : '?'}
                  </div>
                  {r.inherent_risk_level ? (
                    <div className="rskd-score-detail">
                      <div>{LEVEL_NAMES[r.inherent_risk_level]} — Track {r.inherent_track}</div>
                      <div style={{ fontSize: 10, color: 'var(--sds-fg-muted)', marginTop: 2 }}>
                        {LIKELIHOOD_LABELS[r.inherent_likelihood]} x {CONSEQUENCE_LABELS[r.inherent_consequence]}
                      </div>
                    </div>
                  ) : (
                    <div className="rskd-score-detail" style={{ color: 'var(--sds-fg-muted)' }}>Not yet assessed</div>
                  )}
                </div>

                <div className="rskd-score-arrow">
                  <Icon name="arrow" size={18} />
                </div>

                <div className="rskd-score-col">
                  <div className="rskd-score-label">Residual Risk</div>
                  <div className={`rskd-score-ring ring-${r.residual_risk_level || 'none'}`}>
                    {r.residual_severity ? `S${r.residual_severity}` : '?'}
                  </div>
                  {r.residual_risk_level ? (
                    <div className="rskd-score-detail">
                      <div>{LEVEL_NAMES[r.residual_risk_level]} — Track {r.residual_track}</div>
                      <div style={{ fontSize: 10, color: 'var(--sds-fg-muted)', marginTop: 2 }}>
                        {LIKELIHOOD_LABELS[r.residual_likelihood]} x {CONSEQUENCE_LABELS[r.residual_consequence]}
                      </div>
                    </div>
                  ) : (
                    <div className="rskd-score-detail" style={{ color: 'var(--sds-fg-muted)' }}>Not yet assessed</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="rskd-card">
            <div className="rskd-card-h">
              <div className="hicon hi-ctrl"><Icon name="shield" size={15} /></div>
              Controls
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--sds-fg-muted)', fontWeight: 500 }}>
                {r.controls?.length || 0} control{(r.controls?.length || 0) !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="rskd-card-body">
              {r.controls?.length > 0 ? (
                <div className="rskd-ctrl-list">
                  {r.controls.map(c => (
                    <div className="rskd-ctrl-item" key={c.id}>
                      <div className={`rskd-ctrl-icon ct-${c.control_type}`}>
                        {CTRL_INITIALS[c.control_type]}
                      </div>
                      <div className="rskd-ctrl-body">
                        <div className="rskd-ctrl-title">{c.title}</div>
                        <div className="rskd-ctrl-meta">
                          {CTRL_LABELS[c.control_type]}
                          {c.implemented_by_name && ` · Implemented by ${c.implemented_by_name}`}
                        </div>
                      </div>
                      <span className={`rskd-ctrl-eff eff-${c.effectiveness}`}>
                        {EFF_LABELS[c.effectiveness]}
                      </span>
                      {canAct && r.status !== 'Closed' && (
                        <button className="icon-btn" onClick={() => handleDeleteControl(c.id)} title="Remove control">
                          <Icon name="close" size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rskd-empty">No controls added yet</div>
              )}
              {canAct && r.status !== 'Closed' && (
                <button className="rskd-add-ctrl" onClick={() => setShowAddCtrl(true)}>
                  <Icon name="plus" size={14} /> Add Control
                </button>
              )}
            </div>
          </div>

          {/* Activity Timeline */}
          <div className="rskd-card">
            <div className="rskd-card-h">
              <div className="hicon hi-timeline"><Icon name="clock" size={15} /></div>
              Activity
            </div>
            <div className="rskd-card-body">
              {(r.activity || []).length === 0 ? (
                <div className="rskd-empty">No activity yet</div>
              ) : (
                r.activity.map((e, i) => (
                  <div className="rskd-tl-item" key={e.id || i}>
                    <div className={`rskd-tl-dot td-${e.action}`}>
                      <Icon name={tlIcon(e.action)} size={13} />
                    </div>
                    <div>
                      <div className="tl-who">{e.user_name || 'System'}</div>
                      <div className="tl-what">{e.description}</div>
                      <div className="tl-when">{timeAgo(e.created_at)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="rskd-side">
          <div className="rskd-card">
            <div className="rskd-card-h">
              <div className="hicon hi-detail"><Icon name="info" size={15} /></div>
              Details
            </div>
            <div className="rskd-card-body">
              <div className="rskd-detail-rows">
                <div className="rskd-detail-row">
                  <span className="rskd-detail-label">Category</span>
                  <span className="rskd-detail-val">{CAT_LABELS[r.category] || r.category}</span>
                </div>
                {r.source && (
                  <div className="rskd-detail-row">
                    <span className="rskd-detail-label">Source</span>
                    <span className="rskd-detail-val">{r.source}</span>
                  </div>
                )}
                <div className="rskd-detail-row">
                  <span className="rskd-detail-label">Site</span>
                  <span className="rskd-detail-val">{r.site_name}</span>
                </div>
                <div className="rskd-divider" />
                <div className="rskd-detail-row">
                  <span className="rskd-detail-label">Identified By</span>
                  <span className="rskd-detail-val">{r.identified_by_name}</span>
                </div>
                {r.assigned_to_name && (
                  <div className="rskd-detail-row">
                    <span className="rskd-detail-label">Assigned To</span>
                    <span className="rskd-detail-val">{r.assigned_to_name}</span>
                  </div>
                )}
                {r.owner_name && (
                  <div className="rskd-detail-row">
                    <span className="rskd-detail-label">Owner</span>
                    <span className="rskd-detail-val">{r.owner_name}</span>
                  </div>
                )}
                <div className="rskd-divider" />
                {r.review_date && (
                  <div className="rskd-detail-row">
                    <span className="rskd-detail-label">Review Date</span>
                    <span className="rskd-detail-val">{new Date(r.review_date).toLocaleDateString()}</span>
                  </div>
                )}
                <div className="rskd-detail-row">
                  <span className="rskd-detail-label">Created</span>
                  <span className="rskd-detail-val">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                {r.accepted_by_name && (
                  <>
                    <div className="rskd-divider" />
                    <div className="rskd-detail-row">
                      <span className="rskd-detail-label">Accepted By</span>
                      <span className="rskd-detail-val">{r.accepted_by_name}</span>
                    </div>
                    {r.accepted_justification && (
                      <div style={{ fontSize: 11.5, color: 'var(--sds-fg-secondary)', lineHeight: 1.5, marginTop: 4 }}>
                        {r.accepted_justification}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAssess && (
        <AssessRiskModal
          riskId={r.id}
          riskNumber={r.risk_number}
          onCancel={() => setShowAssess(false)}
          onAssessed={() => { setShowAssess(false); showToast('Risk assessed'); load(); }}
        />
      )}
      {showAddCtrl && (
        <AddControlModal
          riskId={r.id}
          riskNumber={r.risk_number}
          onCancel={() => setShowAddCtrl(false)}
          onAdded={() => { setShowAddCtrl(false); showToast('Control added'); load(); }}
        />
      )}
      {showResidual && (
        <ResidualScoreModal
          riskId={r.id}
          riskNumber={r.risk_number}
          inherentLevel={r.inherent_risk_level}
          onCancel={() => setShowResidual(false)}
          onControlled={() => { setShowResidual(false); showToast('Marked controlled'); load(); }}
        />
      )}
      {showAccept && (
        <AcceptRiskModal
          riskId={r.id}
          riskNumber={r.risk_number}
          onCancel={() => setShowAccept(false)}
          onAccepted={() => { setShowAccept(false); showToast('Risk accepted'); load(); }}
        />
      )}

      {/* Toast */}
      {toast && createPortal(
        <div className="toast"><Icon name="check" size={16} /> {toast}</div>,
        document.body
      )}
    </div>
  );
}
