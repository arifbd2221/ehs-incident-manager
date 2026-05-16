import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import Icon from '../../components/shared/Icon';
import EmptyState, { EmptyWhysIllustration } from '../../components/shared/EmptyState';
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
  const [matrixFilter, setMatrixFilter] = useState(null);

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

  // Filter pipeline: server already applies tab/search → matrix cell filter
  // is layered on top of that result client-side. Matrix filter uses the
  // currently-selected matrixMode (inherent vs residual) so chip context
  // matches the matrix the user just clicked.
  const filteredRisks = useMemo(() => {
    if (!matrixFilter) return risks;
    const likeKey = matrixMode === 'inherent' ? 'inherent_likelihood' : 'residual_likelihood';
    const consKey = matrixMode === 'inherent' ? 'inherent_consequence' : 'residual_consequence';
    return risks.filter(r =>
      r[likeKey] === matrixFilter.likelihood &&
      r[consKey] === matrixFilter.consequence
    );
  }, [risks, matrixFilter, matrixMode]);

  return (
    <div className="page">
      {/* Hero */}
      <div className="rsk-hero">
        <div>
          <h1 className="rsk-heading">Risk Register</h1>
          <p className="rsk-subtitle">Identify, assess, and control workplace hazards proactively</p>
        </div>
        <div className="rsk-hero-right">
          <div className="rsk-view-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={`rsk-view-btn ${view === 'list' ? 'active' : ''}`}
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
            >
              <Icon name="sort" size={13} /> List
            </button>
            <button
              type="button"
              className={`rsk-view-btn ${view === 'matrix' ? 'active' : ''}`}
              onClick={() => { setView('matrix'); setMatrixFilter(null); }}
              aria-pressed={view === 'matrix'}
            >
              <Icon name="dashboard" size={13} /> Matrix
            </button>
          </div>
          {canCreate && (
            <button type="button" className="rsk-new-btn" onClick={() => setShowNew(true)}>
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
            type="button"
            key={t.id}
            className={`rsk-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => { setTab(t.id); setPage(1); }}
            aria-pressed={tab === t.id}
          >
            {t.label}
            <span className="tab-ct">{tabCount(stats, t.id)}</span>
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="rsk-controls">
        <div className="rsk-search">
          <Icon name="search" size={15} />
          <input
            type="search"
            placeholder="Search risks..."
            aria-label="Search risks"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
          {search && (
            <button className="rsk-search-clear" onClick={() => { setSearch(''); setPage(1); }} title="Clear search">
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="rsk-loading" role="status" aria-live="polite">
          <div className="rsk-spinner" aria-hidden="true" />
          <span className="sr-only">Loading risks...</span>
          <span aria-hidden="true" style={{ fontSize: 13, color: 'var(--sds-fg-tertiary)' }}>Loading risks...</span>
        </div>
      ) : view === 'list' ? (
        <>
          {matrixFilter && (
            <div className="rsk-matrix-chip" role="status" aria-live="polite">
              <span>
                {LIKELIHOOD_LABELS[matrixFilter.likelihood]} likelihood
                {' × '}
                {CONSEQUENCE_LABELS[matrixFilter.consequence]} consequence
                <span className="rsk-matrix-chip-mode"> ({matrixMode})</span>
              </span>
              <button
                type="button"
                className="rsk-matrix-chip-clear"
                onClick={() => setMatrixFilter(null)}
                aria-label="Clear matrix filter"
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          )}
          {filteredRisks.length === 0 ? (
          <EmptyState
            illustration={<EmptyWhysIllustration />}
            title="No risks found"
            body={matrixFilter
              ? 'No risks match the selected matrix cell.'
              : tab === 'all'
                ? 'Register your first risk to get started.'
                : `No ${tab} risks.`}
          />
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
                {filteredRisks.map(r => (
                  <tr
                    key={r.id}
                    className="rsk-row"
                    role="button"
                    tabIndex={0}
                    aria-label={`Open risk ${r.risk_number}: ${r.title}`}
                    onClick={() => navigate(`/risks/${r.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        if (e.key === ' ') e.preventDefault();
                        navigate(`/risks/${r.id}`);
                      }
                    }}
                  >
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
                <span aria-live="polite">Page {page} of {totalPages} ({total} risks)</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="rsk-pag-btn"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    aria-label="Previous page"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="rsk-pag-btn"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    aria-label="Next page"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        </>
      ) : (
        /* Matrix heatmap */
        <div className="rsk-matrix-wrap">
          <div className="rsk-matrix-header">
            <div className="rsk-matrix-title">Risk Matrix Heatmap</div>
            <div className="rsk-matrix-toggle" role="group" aria-label="Risk score mode">
              <button
                type="button"
                className={`rsk-toggle-btn ${matrixMode === 'inherent' ? 'active' : ''}`}
                onClick={() => setMatrixMode('inherent')}
                aria-pressed={matrixMode === 'inherent'}
              >
                Inherent
              </button>
              <button
                type="button"
                className={`rsk-toggle-btn ${matrixMode === 'residual' ? 'active' : ''}`}
                onClick={() => setMatrixMode('residual')}
                aria-pressed={matrixMode === 'residual'}
              >
                Residual
              </button>
            </div>
          </div>
          <div className="rsk-matrix-container">
            <div className="rsk-matrix-ylabel">
              {LIKELIHOOD_LABELS.map((l, i) => <span key={i}>{l}</span>)}
            </div>
            <div className="rsk-matrix-grid" role="grid" aria-label="Risk matrix">
              {LIKELIHOOD_LABELS.map((likelihoodLabel, li) =>
                CONSEQUENCE_LABELS.map((consequenceLabel, ci) => {
                  const level = SEV_GRID[li][ci];
                  const count = getMatrixCount(li, ci);
                  // Diagonal wave reveal: cells with the same (li+ci) sum
                  // appear together, sweeping from top-left to bottom-right.
                  return (
                    <button
                      type="button"
                      key={`${li}-${ci}`}
                      className={`rsk-matrix-cell rsk-cell rsk-cell-${level} ${count === 0 ? 'rsk-cell-empty' : ''}`}
                      aria-label={`Likelihood ${likelihoodLabel}, Consequence ${consequenceLabel}, ${LEVEL_NAMES[level]} risk, ${count} risks`}
                      style={{ animationDelay: `${(li + ci) * 40}ms` }}
                      onClick={() => {
                        setMatrixFilter({ likelihood: li, consequence: ci });
                        setView('list');
                      }}
                    >
                      <div className="rsk-cell-count" aria-hidden="true">{count}</div>
                      <div className="rsk-cell-label" aria-hidden="true">{LEVEL_NAMES[level]}</div>
                    </button>
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
