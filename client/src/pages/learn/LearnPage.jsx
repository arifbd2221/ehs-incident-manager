import { useState, useMemo } from 'react';
import { STORIES } from '../../stories/storyData';
import { getAllProgress, getCompletedCount } from '../../stories/storyProgress';
import Icon from '../../components/shared/Icon';
import StoryViewer from './StoryViewer';
import '../../styles/learn.css';

const MODULE_LABELS = {
  incidents: 'Incidents',
  investigations: 'Investigations',
  capas: 'CAPA',
};

export default function LearnPage() {
  const [activeStory, setActiveStory] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const progress = useMemo(() => getAllProgress(), [refreshKey]);
  const completedCount = useMemo(() => getCompletedCount(STORIES), [refreshKey]);
  const pct = Math.round((completedCount / STORIES.length) * 100);

  const getCardProgress = (story) => {
    const p = progress[story.id];
    if (!p) return { pct: 0, completed: false };
    if (p.completed) return { pct: 100, completed: true };
    return { pct: Math.round(((p.lastCard + 1) / story.cards.length) * 100), completed: false };
  };

  const handleClose = () => {
    setActiveStory(null);
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="lrn-page">
      <div className="lrn-hero">
        <div className="lrn-hero-content">
          <div className="lrn-hero-label">
            <Icon name="help" size={12} /> Interactive Learning
          </div>
          <h1 className="lrn-hero-title">Learn the System</h1>
          <p className="lrn-hero-sub">
            Master EHS incident management through realistic scenarios. Each story walks you through
            the full lifecycle — from reporting to closure.
          </p>
          <div className="lrn-hero-stats">
            <div className="lrn-hero-stat">
              <div className="lrn-hero-stat-val">{STORIES.length}</div>
              <div className="lrn-hero-stat-lbl">Stories</div>
            </div>
            <div className="lrn-hero-stat">
              <div className="lrn-hero-stat-val">{completedCount}</div>
              <div className="lrn-hero-stat-lbl">Completed</div>
            </div>
            <div className="lrn-hero-stat">
              <div className="lrn-hero-stat-val">{pct}%</div>
              <div className="lrn-hero-stat-lbl">Progress</div>
            </div>
          </div>
        </div>
      </div>

      <div className="lrn-grid-section">
        <div className="lrn-grid-header">
          <div className="lrn-grid-title">Scenarios</div>
          <div className="lrn-grid-count">{STORIES.length} stories</div>
        </div>

        <div className="lrn-grid">
          {STORIES.map(story => {
            const sp = getCardProgress(story);
            return (
              <div
                key={story.id}
                className={`lrn-story-card ${sp.completed ? 'is-completed' : ''}`}
                onClick={() => setActiveStory(story)}
              >
                <div className="lrn-sc-stripe" style={{ background: story.color }} />
                <div className="lrn-sc-body">
                  <div className="lrn-sc-top">
                    <div className="lrn-sc-icon" style={{ background: `${story.color}14`, color: story.color }}>
                      <Icon name={story.icon} size={22} />
                    </div>
                    <div className="lrn-sc-text">
                      <div className="lrn-sc-title">{story.title}</div>
                      <div className="lrn-sc-sub">{story.subtitle}</div>
                    </div>
                  </div>

                  <div className="lrn-sc-meta">
                    <span className="lrn-sc-tag">
                      <Icon name="clock" size={12} /> {story.estimatedMinutes} min
                    </span>
                    <span className="lrn-sc-tag" style={{ textTransform: 'capitalize' }}>
                      {story.difficulty}
                    </span>
                  </div>

                  <div className="lrn-sc-modules">
                    {story.coversModules.map(m => (
                      <span key={m} className="lrn-sc-module">{MODULE_LABELS[m] || m}</span>
                    ))}
                  </div>

                  <div className="lrn-sc-footer">
                    {sp.completed ? (
                      <span className="lrn-sc-complete-badge">
                        <Icon name="check" size={12} /> Completed
                      </span>
                    ) : (
                      <>
                        <div className="lrn-sc-progress-bar">
                          <div
                            className="lrn-sc-progress-fill"
                            style={{ width: `${sp.pct}%`, background: story.color }}
                          />
                        </div>
                        <span className="lrn-sc-progress-text">{sp.pct}%</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {activeStory && (
        <StoryViewer story={activeStory} onClose={handleClose} />
      )}
    </div>
  );
}
