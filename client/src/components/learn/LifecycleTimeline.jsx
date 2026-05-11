import { CHARACTERS } from '../../stories/storyData';
import Icon from '../shared/Icon';

const STATUS_COLORS = {
  'New': '#0DB4F0',
  'Triage': '#ED6C02',
  'Investigating': '#626DF9',
  'Awaiting CAPA': '#8b5cf6',
  'Closed': '#2E7D32',
};

export default function LifecycleTimeline({ stages }) {
  return (
    <div className="lrn-timeline">
      {stages.map((s, i) => {
        const char = CHARACTERS[s.actor];
        const color = STATUS_COLORS[s.status] || '#546E7A';
        return (
          <div key={i} className="lrn-tl-item" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="lrn-tl-line">
              <div className="lrn-tl-dot" style={{ background: color, boxShadow: `0 0 0 4px ${color}22` }} />
              {i < stages.length - 1 && <div className="lrn-tl-connector" />}
            </div>
            <div className="lrn-tl-content">
              <div className="lrn-tl-header">
                <span className="lrn-tl-status" style={{ background: `${color}14`, color }}>{s.status}</span>
                <span className="lrn-tl-day">{s.day}</span>
              </div>
              <div className="lrn-tl-body">
                <div className="lrn-tl-actor">
                  {char && (
                    <span className="lrn-tl-avatar" style={{ background: char.color }}>{char.initials}</span>
                  )}
                  <span className="lrn-tl-actor-name">{char?.name || s.actor}</span>
                  {char && <span className="lrn-tl-actor-role">{char.role}</span>}
                </div>
                <p className="lrn-tl-desc">{s.description}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
