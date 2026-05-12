import { useState } from 'react';

export const SEV_GRID = [
  ['med','high','crit','crit','crit'],
  ['low','med','high','crit','crit'],
  ['low','med','high','high','crit'],
  ['low','low','med','high','high'],
  ['low','low','med','med','high'],
];
export const SEV_NUM = { low: 5, med: 4, high: 3, crit: 2 };
export const SEV_NAMES = { 5: 'Insignificant', 4: 'Minor', 3: 'Moderate', 2: 'Major', 1: 'Critical' };
export const SEV_NAME_SHORT = { low: 'Minor', med: 'Moderate', high: 'Major', crit: 'Critical' };
export const LEVEL_NAMES = { low: 'Low', med: 'Medium', high: 'High', crit: 'Critical' };
export const LEVEL_COLORS = { low: '#4caf50', med: '#ff9800', high: '#f44336', crit: '#d32f2f' };

const LIKELIHOOD_LABELS = ['Almost Certain', 'Likely', 'Possible', 'Unlikely', 'Rare'];
const CONSEQUENCE_LABELS = ['Insignificant', 'Minor', 'Moderate', 'Major', 'Catastrophic'];

export default function RiskMatrix({ likelihood, consequence, onPick }) {
  const [hover, setHover] = useState(null);

  return (
    <div className="rm-matrix" style={{ flex: 1 }}>
      <div className="rm-corner">
        <span className="rm-axis-title rm-axis-y">Likelihood &rarr;</span>
      </div>
      {CONSEQUENCE_LABELS.map((l, xi) => (
        <div key={l} className={`rm-col-label ${hover && hover[1] === xi ? 'rm-hl' : ''}`}>{l}</div>
      ))}
      {LIKELIHOOD_LABELS.map((yl, yi) => (
        <span key={yl} style={{ display: 'contents' }}>
          <div className={`rm-row-label ${hover && hover[0] === yi ? 'rm-hl' : ''}`}>{yl}</div>
          {CONSEQUENCE_LABELS.map((_, xi) => {
            const k = SEV_GRID[yi][xi];
            const sel = likelihood === yi && consequence === xi;
            const isHoverRow = hover && hover[0] === yi;
            const isHoverCol = hover && hover[1] === xi;
            return (
              <div key={xi}
                className={`rm-cell rm-cell-${k} ${sel ? 'rm-sel' : ''} ${isHoverRow || isHoverCol ? 'rm-crosshair' : ''}`}
                onClick={() => onPick(yi, xi)}
                onMouseEnter={() => setHover([yi, xi])}
                onMouseLeave={() => setHover(null)}
                style={{ animationDelay: `${(yi * 5 + xi) * 25}ms` }}
              >
                {SEV_NAME_SHORT[k]}
              </div>
            );
          })}
        </span>
      ))}
      <div className="rm-x-title">&larr; Consequence</div>
    </div>
  );
}
