export const TYPES = [
  { id: 'injury', name: 'Injury', desc: 'Physical harm to a person', color: '#D32F2F' },
  { id: 'illness', name: 'Illness', desc: 'Occupational disease or condition', color: '#ED6C02' },
  { id: 'nearmiss', name: 'Near-miss', desc: 'Could have caused harm but did not', color: '#FFC93C' },
  { id: 'property', name: 'Property damage', desc: 'Equipment, machinery, facilities', color: '#626DF9' },
  { id: 'env', name: 'Env. release', desc: 'Spill, leak, emission', color: '#2E7D32' },
  { id: 'unsafe', name: 'Unsafe condition', desc: 'Hazardous situation found', color: '#1570EF' },
  { id: 'observation', name: 'Observation', desc: 'General safety observation', color: '#0DB4F0' },
  { id: 'dangerous', name: 'Dangerous occurrence', desc: 'RIDDOR-reportable event', color: '#991B1B' },
];

export const typeOf = (id) => TYPES.find(t => t.id === id);
export const sevName = (s) => ({ 1: 'S1 · Critical', 2: 'S2 · Major', 3: 'S3 · Moderate', 4: 'S4 · Minor', 5: 'S5 · Insignificant' }[s]);

export function TypePill({ tid }) {
  const t = typeOf(tid);
  if (!t) return null;
  return <span className="type-chip"><span className="swatch" style={{ background: t.color }} />{t.name}</span>;
}

export function SevBadge({ s }) {
  return <span className={`sev sev-${s}`}>{sevName(s)}</span>;
}

export function TrackBadge({ t }) {
  return <span className={`track track-${(t || '').toLowerCase()}`}>Track {t}</span>;
}
