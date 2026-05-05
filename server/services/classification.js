const RISK_MATRIX = [
  ['med', 'high', 'crit', 'crit', 'crit'],
  ['low', 'med', 'high', 'crit', 'crit'],
  ['low', 'med', 'high', 'high', 'crit'],
  ['low', 'low', 'med', 'high', 'high'],
  ['low', 'low', 'med', 'med', 'high'],
];

const SEV_MAP = { low: 5, med: 4, high: 3, crit: 2 };

export function calculateSeverityAndTrack(likelihood, consequence, type) {
  const lIdx = Math.max(0, Math.min(4, likelihood ?? 2));
  const cIdx = Math.max(0, Math.min(4, consequence ?? 2));
  const key = RISK_MATRIX[lIdx][cIdx];
  let severity = SEV_MAP[key] ?? 3;

  if (type === 'dangerous') severity = Math.min(severity, 2);

  let track;
  if (severity <= 2) track = 'A';
  else if (severity === 3) track = 'B';
  else track = 'C';

  if (type === 'observation' && severity > 2) track = 'C';

  return { severity, track, riskLevel: key };
}

export function shouldAutoClose(type, severity, track) {
  return track === 'C' && (type === 'observation' || severity >= 5);
}
