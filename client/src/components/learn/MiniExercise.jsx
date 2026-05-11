import { useState } from 'react';
import Icon from '../shared/Icon';
import { saveExerciseResult } from '../../stories/storyProgress';

const LIKELIHOOD = [
  { val: 1, label: 'Unlikely' },
  { val: 2, label: 'Possible' },
  { val: 3, label: 'Likely' },
  { val: 4, label: 'Almost Certain' },
];

const CONSEQUENCE = [
  { val: 1, label: 'Minor' },
  { val: 2, label: 'Moderate' },
  { val: 3, label: 'Major' },
  { val: 4, label: 'Catastrophic' },
];

const MATRIX = {
  '4-1': 'S2', '4-2': 'S2', '4-3': 'S1', '4-4': 'S1',
  '3-1': 'S3', '3-2': 'S3', '3-3': 'S2', '3-4': 'S1',
  '2-1': 'S4', '2-2': 'S3', '2-3': 'S2', '2-4': 'S1',
  '1-1': 'S4', '1-2': 'S4', '1-3': 'S3', '1-4': 'S2',
};

const SEV_NAMES = { S1: 'S1 Critical', S2: 'S2 Major', S3: 'S3 Moderate', S4: 'S4 Minor', S5: 'S5 Negligible' };
const SEV_TRACKS = { S1: 'A', S2: 'A', S3: 'B', S4: 'C', S5: 'C' };
const TRACK_LABELS = { A: 'Track A — Full Investigation', B: 'Track B — Light Investigation', C: 'Track C — Log & Close' };

function getSev(l, c) {
  return MATRIX[`${l}-${c}`] || null;
}

export default function MiniExercise({ card, storyId, cardIndex, savedResult }) {
  const [selL, setSelL] = useState(null);
  const [selC, setSelC] = useState(null);
  const [submitted, setSubmitted] = useState(!!savedResult);
  const [attempts, setAttempts] = useState(savedResult?.attempts || 0);

  const sev = (selL && selC) ? getSev(selL, selC) : null;
  const track = sev ? SEV_TRACKS[sev] : null;
  const correctSev = getSev(card.correctLikelihood, card.correctConsequence);
  const isCorrect = submitted && sev === correctSev;

  const handleSubmit = () => {
    const correct = sev === correctSev;
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);
    setSubmitted(true);
    saveExerciseResult(storyId, `card_${cardIndex}`, correct, newAttempts);
  };

  const handleRetry = () => {
    setSelL(null);
    setSelC(null);
    setSubmitted(false);
  };

  const pillClass = (val, correctVal, isSelected) => {
    if (!submitted) return isSelected ? 'selected' : '';
    if (isSelected && val === correctVal) return 'is-correct';
    if (isSelected && val !== correctVal) return 'is-wrong';
    if (!isSelected && val === correctVal) return 'is-answer';
    return '';
  };

  return (
    <div className={`lrn-exercise ${submitted ? (isCorrect ? 'is-correct' : 'is-wrong') : ''}`}>
      <div className="lrn-ex-h">
        <div className="lrn-ex-icon"><Icon name="shield" size={16} /></div>
        Risk Classification Exercise
      </div>

      <div className="lrn-ex-selectors">
        <div>
          <div className="lrn-ex-selector-label">Likelihood</div>
          <div className="lrn-ex-pills">
            {LIKELIHOOD.map(l => (
              <button
                key={l.val}
                className={`lrn-ex-pill ${pillClass(l.val, card.correctLikelihood, selL === l.val)}`}
                onClick={() => !submitted && setSelL(l.val)}
                disabled={submitted}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="lrn-ex-selector-label">Consequence</div>
          <div className="lrn-ex-pills">
            {CONSEQUENCE.map(c => (
              <button
                key={c.val}
                className={`lrn-ex-pill ${pillClass(c.val, card.correctConsequence, selC === c.val)}`}
                onClick={() => !submitted && setSelC(c.val)}
                disabled={submitted}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {sev && (
        <div className="lrn-ex-preview">
          <span className={`lrn-ex-sev rs${sev[1]}`}>{SEV_NAMES[sev]}</span>
          <span className={`lrn-ex-track t${track.toLowerCase()}`}>{TRACK_LABELS[track]}</span>
        </div>
      )}

      {!submitted && sev && (
        <div className="lrn-ex-submit">
          <button className="btn btn-primary" onClick={handleSubmit}>Check My Answer</button>
        </div>
      )}

      {submitted && (
        <div className={`lrn-ex-result ${isCorrect ? 'correct' : 'wrong'}`}>
          <div className="lrn-ex-result-h">
            <Icon name={isCorrect ? 'check' : 'warning'} size={18} />
            {isCorrect ? 'Correct!' : 'Not quite — here\'s why:'}
          </div>
          <div className="lrn-ex-result-text">{card.explanation}</div>
          {!isCorrect && (
            <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={handleRetry}>
              Try Again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
