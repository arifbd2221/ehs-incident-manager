import { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CHARACTERS } from '../../stories/storyData';
import { getProgress, saveCardProgress, markComplete } from '../../stories/storyProgress';
import Icon from '../../components/shared/Icon';
import StoryCard from './StoryCard';

export default function StoryViewer({ story, onClose }) {
  const [cardIdx, setCardIdx] = useState(() => {
    const p = getProgress(story.id);
    return Math.min(p.lastCard, story.cards.length - 1);
  });
  const [progress, setProgress] = useState(() => getProgress(story.id));

  const card = story.cards[cardIdx];
  const totalCards = story.cards.length;
  const isLast = cardIdx === totalCards - 1;

  const currentChapter = useMemo(() => {
    for (let i = story.chapters.length - 1; i >= 0; i--) {
      if (cardIdx >= story.chapters[i].cards[0]) return i;
    }
    return 0;
  }, [cardIdx, story.chapters]);

  const chapterStatus = useCallback((chIdx) => {
    const ch = story.chapters[chIdx];
    const lastCard = ch.cards[ch.cards.length - 1];
    const firstCard = ch.cards[0];
    if (cardIdx > lastCard) return 'done';
    if (cardIdx >= firstCard && cardIdx <= lastCard) return 'active';
    return '';
  }, [cardIdx, story.chapters]);

  useEffect(() => {
    saveCardProgress(story.id, cardIdx);
    setProgress(getProgress(story.id));
  }, [cardIdx, story.id]);

  const goNext = () => {
    if (isLast) {
      markComplete(story.id);
      onClose();
    } else {
      setCardIdx(i => i + 1);
    }
  };
  const goBack = () => setCardIdx(i => Math.max(0, i - 1));
  const goToChapter = (chIdx) => setCardIdx(story.chapters[chIdx].cards[0]);

  const uniqueChars = useMemo(() =>
    (story.characters || []).map(id => ({ id, ...CHARACTERS[id] })).filter(c => c.name),
    [story.characters]
  );

  return createPortal(
    <div className="lrn-overlay" onClick={onClose}>
      <div className="lrn-shell" onClick={e => e.stopPropagation()}>
        {/* Sidebar */}
        <div className="lrn-sidebar">
          <div className="lrn-sb-brand">
            <div className="lrn-sb-icon" style={{ background: `${story.color}33` }}>
              <Icon name={story.icon} size={20} color={story.color} />
            </div>
            <div>
              <div className="lrn-sb-title">{story.title}</div>
              <div className="lrn-sb-type">{story.incidentType} scenario</div>
            </div>
          </div>

          <div className="lrn-chapters">
            {story.chapters.map((ch, i) => {
              const status = chapterStatus(i);
              return (
                <div
                  key={i}
                  className={`lrn-chapter ${status}`}
                  onClick={() => goToChapter(i)}
                >
                  <div className="lrn-chapter-dot">
                    {status === 'done' ? <Icon name="check" size={14} /> : i + 1}
                  </div>
                  <div>
                    <div className="lrn-chapter-title">{ch.title}</div>
                    <div className="lrn-chapter-cards">{ch.cards.length} card{ch.cards.length > 1 ? 's' : ''}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {uniqueChars.length > 0 && (
            <div className="lrn-sb-chars">
              <div className="lrn-sb-chars-h">Characters</div>
              {uniqueChars.map(c => (
                <div key={c.id} className="lrn-sb-char">
                  <div className="lrn-sb-char-avatar" style={{ background: c.color }}>{c.initials}</div>
                  <div>
                    <div className="lrn-sb-char-name">{c.name}</div>
                    <div className="lrn-sb-char-role">{c.role}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main */}
        <div className="lrn-main">
          <div className="lrn-header">
            <div className="lrn-h-left">
              <span className="lrn-h-chapter">{story.chapters[currentChapter]?.title}</span>
              <span className="lrn-h-sep" />
              <span className="lrn-h-title">{card.title}</span>
            </div>
            <button className="lrn-close" onClick={onClose}>
              <Icon name="close" size={18} />
            </button>
          </div>

          <div className="lrn-body" key={cardIdx}>
            <StoryCard
              card={card}
              storyId={story.id}
              cardIndex={cardIdx}
              savedResult={progress.exerciseResults?.[`card_${cardIdx}`]}
            />
          </div>

          <div className="lrn-footer">
            <button
              className="btn btn-secondary"
              onClick={goBack}
              disabled={cardIdx === 0}
            >
              <Icon name="arrowL" size={14} /> Back
            </button>
            <div className="lrn-footer-progress">
              <div className="lrn-footer-bar">
                <div
                  className="lrn-footer-bar-fill"
                  style={{ width: `${((cardIdx + 1) / totalCards) * 100}%` }}
                />
              </div>
              <span className="lrn-footer-text">{cardIdx + 1} / {totalCards}</span>
            </div>
            <button className="btn btn-primary" onClick={goNext}>
              {isLast ? 'Complete' : 'Next'} {!isLast && <Icon name="arrow" size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
