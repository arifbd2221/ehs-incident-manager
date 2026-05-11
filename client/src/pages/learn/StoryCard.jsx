import { CHARACTERS } from '../../stories/storyData';
import Icon from '../../components/shared/Icon';
import MiniExercise from '../../components/learn/MiniExercise';
import LifecycleTimeline from '../../components/learn/LifecycleTimeline';
import {
  ChemLabScene, ConstructionScene, WarehouseScene, OfficeScene,
  WizardMockup, RiskMatrixVisual, LifecycleFlowVisual, OshaFormVisual,
  ChemSplashMoment, FallingObjectMoment, ElectricalHazardMoment,
} from '../../components/learn/StoryIllustrations';

const TYPE_COLORS = {
  injury: '#D32F2F', illness: '#9C27B0', nearmiss: '#ED6C02', property: '#546E7A',
  env: '#2E7D32', unsafe: '#1565C0', observation: '#00897B', dangerous: '#B71C1C',
};
const TYPE_LABELS = {
  injury: 'Injury', illness: 'Illness', nearmiss: 'Near Miss', property: 'Property Damage',
  env: 'Environmental', unsafe: 'Unsafe Condition', observation: 'Observation', dangerous: 'Dangerous Occurrence',
};

const STORY_SCENES = {
  injury_chemical_splash: ChemLabScene,
  illness_coating_booth: ChemLabScene,
  env_ibc_spill: ChemLabScene,
  nearmiss_falling_pallet: WarehouseScene,
  property_truck_hydrant: WarehouseScene,
  unsafe_exposed_wiring: ConstructionScene,
  dangerous_scaffold_collapse: ConstructionScene,
  observation_good_catch: OfficeScene,
};

const STORY_MOMENTS = {
  injury_chemical_splash: ChemSplashMoment,
  nearmiss_falling_pallet: FallingObjectMoment,
  unsafe_exposed_wiring: ElectricalHazardMoment,
};

function getIllustration(card, cardIndex, storyId) {
  if (cardIndex === 0) return STORY_SCENES[storyId] || null;
  if (card.type === 'narrative' && card.highlight) return STORY_MOMENTS[storyId] || null;
  if (card.type === 'exercise') return RiskMatrixVisual;
  if (card.type === 'lifecycle') return LifecycleFlowVisual;
  if (card.type === 'annotation' && card.highlightType) return WizardMockup;
  if (card.type === 'annotation' && /OSHA|RIDDOR|Recordab/i.test(card.title || '')) return OshaFormVisual;
  return null;
}

function CharacterQuote({ character, quote }) {
  const char = CHARACTERS[character];
  if (!char || !quote) return null;
  return (
    <div className="lrn-quote" style={{ borderLeftColor: char.color }}>
      <div className="lrn-quote-avatar" style={{ background: char.color }}>{char.initials}</div>
      <div className="lrn-quote-body">
        <div className="lrn-quote-text">"{quote}"</div>
        <div className="lrn-quote-name">{char.name}, {char.role}</div>
      </div>
    </div>
  );
}

function CharacterBullets({ characters, bullets }) {
  if (bullets?.length) {
    return (
      <div className="lrn-characters-section">
        {bullets.map((b, i) => {
          const char = CHARACTERS[b.char];
          return (
            <div key={i} className="lrn-char-bullet">
              {char && <div className="lrn-char-avatar" style={{ background: char.color }}>{char.initials}</div>}
              <div className="lrn-char-info">
                <div className="lrn-char-name">{char?.name || b.char}</div>
                <div className="lrn-char-desc">{b.text}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  if (characters?.length) {
    return (
      <div className="lrn-characters-section">
        {characters.map(cId => {
          const char = CHARACTERS[cId];
          if (!char) return null;
          return (
            <div key={cId} className="lrn-char-bullet">
              <div className="lrn-char-avatar" style={{ background: char.color }}>{char.initials}</div>
              <div className="lrn-char-info">
                <div className="lrn-char-name">{char.name}</div>
                <div className="lrn-char-desc">{char.role}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
}

function LearningsList({ learnings }) {
  if (!learnings?.length) return null;
  return (
    <div className="lrn-learnings">
      <div className="lrn-learnings-h">
        <Icon name="check" size={16} /> What you learned
      </div>
      {learnings.map((l, i) => (
        <div key={i} className="lrn-learning-item">
          <div className="lrn-learning-check"><Icon name="check" size={12} /></div>
          {l}
        </div>
      ))}
    </div>
  );
}

function WhatIfSection({ whatIfs }) {
  if (!whatIfs?.length) return null;
  return (
    <div className="lrn-whatifs">
      <div className="lrn-whatifs-h">
        <Icon name="help" size={16} /> What if...?
      </div>
      {whatIfs.map((w, i) => (
        <div key={i} className="lrn-whatif">
          <div className="lrn-whatif-q">{w.scenario}</div>
          <div className="lrn-whatif-a">{w.result}</div>
        </div>
      ))}
    </div>
  );
}

export default function StoryCard({ card, storyId, cardIndex, savedResult }) {
  const Illustration = getIllustration(card, cardIndex, storyId);

  return (
    <div className="lrn-card">
      {Illustration && (
        <div className="lrn-illustration">
          <Illustration className="lrn-illustration-svg" />
        </div>
      )}
      {card.content && <div className="lrn-card-content">{card.content}</div>}

      {card.type === 'narrative' && (
        <>
          <CharacterQuote character={card.character} quote={card.quote} />
          {card.highlight && (
            <div className="lrn-highlight">
              <div className="lrn-highlight-icon"><Icon name="warning" size={16} /></div>
              {card.highlight}
            </div>
          )}
          <CharacterBullets characters={card.characters} bullets={card.bullets} />
          <LearningsList learnings={card.learnings} />
          <WhatIfSection whatIfs={card.whatIfs} />
        </>
      )}

      {card.type === 'annotation' && (
        <>
          {card.highlightType && (
            <div
              className="lrn-type-highlight"
              style={{ background: `${TYPE_COLORS[card.highlightType]}12`, color: TYPE_COLORS[card.highlightType] }}
            >
              <Icon name="incidents" size={14} />
              {TYPE_LABELS[card.highlightType]}
            </div>
          )}
          {card.annotation && (
            <div className="lrn-annotation-box">
              <div className="lrn-annotation-box-h">
                <Icon name="info" size={14} /> System Guide
              </div>
              <div className="lrn-annotation-box-text">{card.annotation}</div>
            </div>
          )}
          {card.tip && (
            <div className="lrn-tip">
              <div className="lrn-tip-icon"><Icon name="help" size={14} /></div>
              <div className="lrn-tip-text">{card.tip}</div>
            </div>
          )}
        </>
      )}

      {card.type === 'exercise' && (
        <MiniExercise
          card={card}
          storyId={storyId}
          cardIndex={cardIndex}
          savedResult={savedResult}
        />
      )}

      {card.type === 'lifecycle' && (
        <LifecycleTimeline stages={card.stages} />
      )}
    </div>
  );
}
