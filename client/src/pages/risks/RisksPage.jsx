import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import Icon from '../../components/shared/Icon';
import { SEV_GRID, LEVEL_NAMES } from '../../components/shared/RiskMatrix';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { getRisks, getRiskMatrix } from '../../api/risks';
import NewRiskModal from './modals/NewRiskModal';
import '../../styles/risks.css';

const ELEVATED = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

const LIKELIHOOD_LABELS = ['Almost Certain', 'Likely', 'Possible', 'Unlikely', 'Rare'];
const CONSEQUENCE_LABELS = ['Insignificant', 'Minor', 'Moderate', 'Major', 'Catastrophic'];
const CAT_LABELS = {
  safety: 'Safety', health: 'Health', environmental: 'Environmental',
  ergonomic: 'Ergonomic', chemical: 'Chemical', biological: 'Biological',
  physical: 'Physical', psychosocial: 'Psychosocial', other: 'Other',
};

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'mitigating', label: 'Mitigating' },
  { id: 'controlled', label: 'Controlled' },
  { id: 'closed', label: 'Closed' },
];

function tabCount(stats, id) {
  if (!stats) return 0;
  if (id === 'all') return (stats.active || 0) + (stats.closed || 0);
  if (id === 'active') return (stats.identified || 0) + (stats.assessed || 0);
  return stats[id] || 0;
}

function StatusPill({ status }) {
  return (
    <span className={`rsk-status rsk-status-${status}`}>
      <span className="rsk-status-dot" />
      {status}
    </span>
  );
}

function LevelBadge({ level }) {
  if (!level) return <span style={{ color: 'var(--sds-fg-muted)', fontSize: 11 }}>—</span>;
  return (
    <span className={`rsk-level rsk-level-${level}`}>
      <span className="rsk-level-dot" />
      {LEVEL_NAMES[level]}
    </span>
  );
}

export default function RisksPage() {
  const { user } = useAuth();
  const { refreshKey } = useApp();
  const navigate = useNavigate();
  const canCreate = ELEVATED.has(user?.role);

  const [risks, setRisks] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [view, setView] = useState('list');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showNew, setShowNew] = useState(false);
  const [toast, setToast] = useState('');

  const [matrixData, setMatrixData] = useState(null);
  const [matrixMode, setMatrixMode] = useState('inherent');

  const limit = 50;

  const load = async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (tab === 'active') params.status = undefined;
      else if (tab !== 'all') params.status = tab.charAt(0).toUpperCase() + tab.slice(1);
      if (search) params.search = search;

      const data = await getRisks(params);
      let filtered = data.risks;
      if (tab === 'active') {
        filtered = filtered.filter(r => ['Identified', 'Assessed'].includes(r.status));
      }
      setRisks(filtered);
      setTotal(data.total);
      setStats(data.stats);
    } catch {
      setRisks([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMatrix = async () => {
    try {
      const data = await getRiskMatrix();
      setMatrixData(data);
    } catch {
      setMatrixData(null);
    }
  };

  useEffect(() => { load(); }, [refreshKey, tab, page, search]);
  useEffect(() => { if (view === 'matrix') loadMatrix(); }, [view, refreshKey]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  };

  const totalPages = Math.ceil(total / limit);

  const getMatrixCount = (li, ci) => {
    if (!matrixData) return 0;
    const source = matrixMode === 'inherent' ? matrixData.inherent : matrixData.residual;
    const cell = source.find(c => c.likelihood === li && c.consequence === ci);
    return cell?.count || 0;
  };

  return (
    <div className="page">
      {/* Hero */}
      <div className="rsk-hero">
        <div>
          <h1 className="rsk-heading">Risk Register</h1>
          <p className="rsk-subtitle">Identify, assess, and control workplace hazards proactively</p>
        </div>
        <div className="rsk-hero-right">
          <div className="rsk-view-toggle">
            <button className={`rsk-view-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>
              <Icon name="sort" size={13} /> List
            </button>
            <button className={`rsk-view-btn ${view === 'matrix' ? 'active' : ''}`} onClick={() => setView('matrix')}>
              <Icon name="dashboard" size={13} /> Matrix
            </button>
          </div>
          {canCreate && (
            <button className="rsk-new-btn" onClick={() => setShowNew(true)}>
              <Icon name="plus" size={15} /> Register Risk
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="rsk-stats">
        <div className="rsk-stat rs-active">
          <div className="rsk-stat-row">
            <div>
              <div className="lbl">Active Risks</div>
              <div className="val">{stats?.active ?? '—'}</div>
            </div>
            <div className="rsk-stat-icon"><Icon name="fire" size={18} /></div>
          </div>
        </div>
        <div className="rsk-stat rs-crit">
          <div className="rsk-stat-row">
            <div>
              <div className="lbl">Critical / High</div>
              <div className="val">{stats?.critical_high ?? '—'}</div>
            </div>
            <div className="rsk-stat-icon"><Icon name="warning" size={18} /></div>
          </div>
        </div>
        <div className="rsk-stat rs-mitigating">
          <div className="rsk-stat-row">
            <div>
              <div className="lbl">Mitigating</div>
              <div className="val">{stats?.mitigating ?? '—'}</div>
            </div>
            <div className="rsk-stat-icon"><Icon name="shield" size={18} /></div>
          </div>
        </div>
        <div className="rsk-stat rs-review">
          <div className="rsk-stat-row">
            <div>
              <div className="lbl">Review Due</div>
              <div className="val">{stats?.review_due ?? '—'}</div>
            </div>
            <div className="rsk-stat-icon"><Icon name="clock" size={18} /></div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="rsk-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`rsk-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => { setTab(t.id); setPage(1); }}
          >
            {t.label}
            <span className="tab-ct">{tabCount(stats, t.id)}</span>
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="rsk-controls">
        <div className="rsk-search">
          <span className="rsk-search-icon"><Icon name="search" size={15} /></span>
          <input
            className="input"
            placeholder="Search risks..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="rsk-loading">
          <div className="rsk-spinner" />
          <span style={{ fontSize: 13, color: 'var(--sds-fg-tertiary)' }}>Loading risks...</span>
        </div>
      ) : view === 'list' ? (
        risks.length === 0 ? (
          <div className="rsk-empty-state">
            <div className="rsk-empty-icon"><Icon name="fire" size={26} /></div>
            <div className="rsk-empty-title">No risks found</div>
            <div className="rsk-empty-sub">
              {tab === 'all' ? 'Register your first risk to get started' : `No ${tab} risks`}
            </div>
          </div>
        ) : (
          <div className="rsk-list">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Site</th>
                  <th>Inherent</th>
                  <th>Residual</th>
                  <th>Status</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {risks.map(r => (
                  <tr key={r.id} onClick={() => navigate(`/risks/${r.id}`)}>
                    <td className="id">{r.risk_number}</td>
                    <td className="rsk-title-cell">{r.title}</td>
                    <td><span className="rsk-cat">{CAT_LABELS[r.category] || r.category}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--sds-fg-secondary)' }}>{r.site_name}</td>
                    <td><LevelBadge level={r.inherent_risk_level} /></td>
                    <td><LevelBadge level={r.residual_risk_level} /></td>
                    <td><StatusPill status={r.status} /></td>
                    <td style={{ fontSize: 12 }}>{r.owner_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="rsk-pagination">
                <span>Page {page} of {totalPages} ({total} risks)</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        /* Matrix heatmap */
        <div className="rsk-matrix-wrap">
          <div className="rsk-matrix-header">
            <div className="rsk-matrix-title">Risk Matrix Heatmap</div>
            <div className="rsk-matrix-toggle">
              <button className={matrixMode === 'inherent' ? 'active' : ''} onClick={() => setMatrixMode('inherent')}>
                Inherent
              </button>
              <button className={matrixMode === 'residual' ? 'active' : ''} onClick={() => setMatrixMode('residual')}>
                Residual
              </button>
            </div>
          </div>
          <div className="rsk-matrix-container">
            <div className="rsk-matrix-ylabel">
              {LIKELIHOOD_LABELS.map((l, i) => <span key={i}>{l}</span>)}
            </div>
            <div className="rsk-matrix-grid">
              {LIKELIHOOD_LABELS.map((_, li) =>
                CONSEQUENCE_LABELS.map((_, ci) => {
                  const level = SEV_GRID[li][ci];
                  const count = getMatrixCount(li, ci);
                  return (
                    <div
                      key={`${li}-${ci}`}
                      className={`rsk-matrix-cell rsk-cell-${level} ${count === 0 ? 'rsk-cell-empty' : ''}`}
                      onClick={() => {
                        setView('list');
                      }}
                    >
                      <div className="rsk-cell-count">{count}</div>
                      <div className="rsk-cell-label">{LEVEL_NAMES[level]}</div>
                    </div>
                  );
                })
              )}
            </div>
            <div style={{ gridRow: 2, gridColumn: 1 }} />
            <div className="rsk-matrix-xlabel">
              {CONSEQUENCE_LABELS.map((c, i) => <span key={i}>{c}</span>)}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, padding: '0 120px 0 0' }}>
            <div className="rsk-matrix-axis-title" style={{ paddingLeft: 4 }}>
              <Icon name="arrow" size={12} style={{ transform: 'rotate(-90deg)' }} /> Likelihood
            </div>
            <div className="rsk-matrix-axis-title">
              Consequence <Icon name="arrow" size={12} />
            </div>
          </div>
        </div>
      )}

      {/* New Risk Modal */}
      {showNew && (
        <NewRiskModal
          onCancel={() => setShowNew(false)}
          onCreated={(risk) => {
            setShowNew(false);
            showToast(`Registered ${risk.risk_number}`);
            load();
          }}
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
