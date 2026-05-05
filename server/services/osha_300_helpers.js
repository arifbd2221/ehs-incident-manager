// server/services/osha_300_helpers.js — OSHA 300 Log column shape helpers.
//
// The 300 Log has six injury_type buckets (column M):
//   M1 injury · M2 skin_disorder · M3 respiratory · M4 poisoning ·
//   M5 hearing_loss · M6 all_other_illness
// Column F (description of injury, body part) wants a richer string than
// just the incident description — at minimum the affected body parts
// joined with the description.
//
// Phase 2 W6 T6.1.

import { formatForOsha300ColumnE } from './body_parts.js';

// Map the wizard's illness_category select labels (IllnessForm.jsx) to
// the 300 Log's M2-M6 buckets. Anything not explicitly mapped falls into
// M6 (all_other_illness) by design — OSHA's "all other illnesses" bucket
// is the catch-all.
const ILLNESS_CATEGORY_TO_M = {
  'Skin disorder — Contact dermatitis': 'skin_disorder',
  'Respiratory — Occupational asthma': 'respiratory',
  'Hearing loss — Noise-induced': 'hearing_loss',
  'Poisoning — Lead / Solvent': 'poisoning',
};

/**
 * Pick the OSHA 300 column M bucket for an incident.
 *  - type='injury' → always 'injury' (M1)
 *  - type='illness' → M2-M6 by illness_category, default M6
 *  - anything else → null (not recordable, but kept defensive)
 */
export function injuryTypeForOsha300(type, typeData) {
  if (type === 'injury') return 'injury';
  if (type !== 'illness') return null;
  const td = typeData || {};
  return ILLNESS_CATEGORY_TO_M[td.illness_category] || 'all_other_illness';
}

/**
 * Build OSHA 300 column F text. Joins the incident description (or title)
 * with the affected body parts in the same string a 300 Log auditor would
 * expect — e.g. "Cut from press die — Right hand, Right forearm".
 */
export function descriptionForOsha300({ description, title, bodyParts }) {
  const head = (description || title || '').trim();
  const tail = formatForOsha300ColumnE(bodyParts || []);
  if (head && tail) return `${head} — ${tail}`;
  return head || tail || '';
}
