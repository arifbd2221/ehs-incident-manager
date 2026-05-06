import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getInspectionReport } from '../../api/inspections';
import Icon from '../../components/shared/Icon';
import '../../styles/inspections.css';

export default function InspectionReport() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getInspectionReport(id);
      setReport(data);
    } catch {}
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="page ir-page">
        <div className="tp-skel" style={{ width: 300, height: 24, borderRadius: 6, marginBottom: 8 }} />
        <div className="tp-skel" style={{ width: 180, height: 14, borderRadius: 6, marginBottom: 28 }} />
        <div className="tp-skel" style={{ width: '100%', height: 120, borderRadius: 10, marginBottom: 16 }} />
        <div className="tp-skel" style={{ width: '100%', height: 200, borderRadius: 10 }} />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="page ir-page">
        <div className="ip-empty">
          <div className="ip-empty-title">Report not available</div>
          <button className="btn btn-primary" onClick={() => navigate('/inspections')}>Back to Inspections</button>
        </div>
      </div>
    );
  }

  const { inspection, stats, sections } = report;
  const circumference = 2 * Math.PI * 42;
  const offset = stats.score_percent !== null
    ? circumference - (circumference * stats.score_percent / 100)
    : circumference;

  const scoreColor = stats.score_percent >= 80 ? 'var(--sds-success)' : stats.score_percent >= 50 ? 'var(--sds-warning)' : 'var(--sds-error)';

  const statCards = [
    { label: 'Answered', value: stats.answered_items, total: stats.total_items, icon: 'check', color: 'var(--sds-brand-primary)', bg: 'var(--sds-brand-primary-tint)' },
    { label: 'Flagged', value: stats.flagged_count, icon: 'warning', color: 'var(--sds-warning)', bg: 'rgba(237,108,2,0.08)' },
    { label: 'Failed', value: stats.failed_count, icon: 'close', color: 'var(--sds-error)', bg: 'rgba(211,47,47,0.08)' },
  ];

  let itemNum = 0;

  return (
    <div className="page ir-page">
      {/* Header */}
      <div className="ir-header">
        <div className="ir-header-top">
          <div>
            <button className="ir-back" onClick={() => navigate('/inspections')} style={{ marginBottom: 12 }}>
              <Icon name="arrowL" size={18} />
            </button>
            <div className="ir-title">{inspection.title}</div>
            <div className="ir-number">{inspection.inspection_number}</div>
          </div>
          <span className={`ip-status ip-status-${inspection.status}`}>
            <span className="dot" /> {inspection.status === 'in_progress' ? 'In Progress' : inspection.status.charAt(0).toUpperCase() + inspection.status.slice(1)}
          </span>
        </div>
        <div className="ir-meta-row">
          {inspection.template_name && (
            <span className="ir-meta-item">
              <Icon name="file" size={14} /> {inspection.template_name}
              {inspection.template_version_number && <span className="ir-version-tag">v{inspection.template_version_number}</span>}
            </span>
          )}
          {inspection.location && (
            <span className="ir-meta-item"><Icon name="location" size={14} /> {inspection.location}</span>
          )}
          {inspection.started_by_name && (
            <span className="ir-meta-item"><Icon name="person" size={14} /> {inspection.started_by_name}</span>
          )}
          {inspection.conducted_on && (
            <span className="ir-meta-item"><Icon name="clock" size={14} /> {new Date(inspection.conducted_on).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          )}
        </div>
      </div>

      {/* Score Card */}
      <div className="ir-score-card">
        <div className="ir-score-ring">
          <svg viewBox="0 0 100 100">
            <circle className="bg" cx="50" cy="50" r="42" fill="none" strokeWidth="8" />
            <circle
              className="fg"
              cx="50" cy="50" r="42"
              fill="none"
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ stroke: scoreColor }}
            />
          </svg>
          <div className="ir-score-pct">
            {stats.score_percent !== null ? (
              <>{stats.score_percent}<span className="pct-symbol">%</span></>
            ) : '—'}
          </div>
        </div>
        <div className="ir-stat-cards">
          {statCards.map(s => (
            <div key={s.label} className="ir-stat-card" style={{ '--ir-stat-color': s.color, '--ir-stat-bg': s.bg }}>
              <div className="ir-stat-card-icon"><Icon name={s.icon} size={16} /></div>
              <div>
                <div className="ir-stat-card-label">{s.label}</div>
                <div className="ir-stat-card-val">
                  {s.value}
                  {s.total !== undefined && (
                    <span style={{ fontSize: 14, color: 'var(--sds-fg-tertiary)', fontWeight: 500 }}>/{s.total}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div className="ir-sections">
        {sections.map((sec, sIdx) => {
          const answeredInSection = sec.items.filter(i => i.selected_option_label || (i.response_text && i.response_text.trim())).length;
          const secPct = sec.items.length > 0 ? Math.round((answeredInSection / sec.items.length) * 100) : 0;
          return (
            <div key={sec.item_key || sIdx} className="ir-section" style={{ animationDelay: `${(sIdx + 1) * 60}ms` }}>
              <div className="ir-section-head">
                <span>{sec.label || 'General'}</span>
                <span className="ir-section-score">
                  {sec.items.length} item{sec.items.length !== 1 ? 's' : ''}
                </span>
                <div className="ir-section-progress">
                  <div className="ir-section-progress-fill" style={{ width: `${secPct}%` }} />
                </div>
              </div>
              <div className="ir-section-body">
                {sec.items.map(item => {
                  itemNum++;
                  const isFlagged = item.is_flagged === 1;
                  const isFailed = item.is_failed === 1;
                  return (
                    <div key={item.item_key} className={`ir-item ${isFlagged ? 'flagged' : ''} ${isFailed ? 'failed' : ''}`}>
                      <span className="ir-item-num">{itemNum}</span>
                      <div className="ir-item-content">
                        <div className="ir-item-label">{item.label || item.item_key}</div>
                        {item.response_text && (
                          <div className="ir-item-notes">{item.response_text}</div>
                        )}
                        {item.notes && (
                          <div className="ir-item-notes">Note: {item.notes}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {item.selected_option_label && (
                          <span className="ir-item-answer" style={{
                            background: `${item.selected_option_color || '#90A4AE'}18`,
                            color: item.selected_option_color || '#90A4AE',
                          }}>
                            {item.selected_option_label}
                          </span>
                        )}
                        {isFlagged && (
                          <span className="ir-item-flag"><Icon name="warning" size={12} /> Flag</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {sec.items.length === 0 && (
                  <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--sds-fg-tertiary)', fontStyle: 'italic' }}>
                    No items in this section
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="ir-footer">
        <div className="ir-footer-left">
          <button className="btn btn-secondary" onClick={() => navigate('/inspections')}>
            <Icon name="arrowL" size={14} /> Back to Inspections
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(`/inspections/${id}`)}>
            <Icon name="eye" size={14} /> View Responses
          </button>
        </div>
        <div className="ir-footer-right">
          <button className="ir-btn-print" onClick={() => window.print()}>
            <Icon name="download" size={14} /> Print Report
          </button>
        </div>
      </div>
    </div>
  );
}
