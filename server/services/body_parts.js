// server/services/body_parts.js — backend mirror of BodyMap3D's region IDs.
//
// Source of truth for the FE region IDs is `client/src/components/shared/BodyMap3D.jsx`
// (PART_LABELS object). The backend mirrors them here so:
//   - OSHA 300 column E gets human-readable labels joined with commas
//   - Auto-classification can detect "specified-injury regions" that bump severity
//   - Voice-extract / future analytics can validate region ID enums
//
// Phase 2 W3 T3.1.
//
// Known gaps (deferred — see plan-phase-2.md and the post-merge memory note):
//   - No `eye` region; eye injuries fall under `face` until the BodyMap3D adds it
//   - No `internal` region; internal organ injuries can't be tagged structurally
// These are non-blocking for the demo but should be added before any prod ship.

export const PART_LABELS = {
  head: 'Head',
  face: 'Face',
  neck: 'Neck',

  l_shoulder: 'Left shoulder',
  r_shoulder: 'Right shoulder',
  l_upper_arm: 'Left upper arm',
  r_upper_arm: 'Right upper arm',
  l_elbow: 'Left elbow',
  r_elbow: 'Right elbow',
  l_forearm: 'Left forearm',
  r_forearm: 'Right forearm',
  l_wrist: 'Left wrist',
  r_wrist: 'Right wrist',
  l_hand: 'Left hand',
  r_hand: 'Right hand',

  chest: 'Chest',
  abdomen: 'Abdomen',
  upper_back: 'Upper back',
  lower_back: 'Lower back',

  l_hip: 'Left hip',
  r_hip: 'Right hip',
  l_thigh: 'Left thigh',
  r_thigh: 'Right thigh',
  l_knee: 'Left knee',
  r_knee: 'Right knee',
  l_shin: 'Left shin',
  r_shin: 'Right shin',
  l_ankle: 'Left ankle',
  r_ankle: 'Right ankle',
  l_foot: 'Left foot',
  r_foot: 'Right foot',
};

// Set of region IDs treated as "specified" injuries for auto-classification:
// any of these selected → severity inference floors to at least Major (S2).
// Conservative set — head/face (potential head trauma) and back regions
// (spine concern). Easy to extend if user data shows other patterns.
export const SPECIFIED_INJURY_REGIONS = new Set([
  'head',
  'face',
  'upper_back',
  'lower_back',
]);

export const VALID_REGION_IDS = new Set(Object.keys(PART_LABELS));

/**
 * Given an array of region IDs, return a human-readable comma-separated string
 * suitable for OSHA 300 column E (description of injury, body part, etc.).
 * Unknown IDs pass through as-is (forward-compat).
 */
export function formatForOsha300ColumnE(regionIds) {
  if (!Array.isArray(regionIds) || regionIds.length === 0) return '';
  return regionIds.map(id => PART_LABELS[id] || id).join(', ');
}

/**
 * Parse a body_parts_affected JSON string or array into a clean array of
 * known region IDs. Drops anything not in the canonical set.
 */
export function parseBodyParts(input) {
  if (!input) return [];
  let arr;
  if (typeof input === 'string') {
    try { arr = JSON.parse(input); } catch { return []; }
  } else {
    arr = input;
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter(id => typeof id === 'string' && VALID_REGION_IDS.has(id));
}

/**
 * True if any of the supplied region IDs is in SPECIFIED_INJURY_REGIONS.
 */
export function hasSpecifiedInjuryRegion(regionIds) {
  if (!Array.isArray(regionIds)) return false;
  return regionIds.some(id => SPECIFIED_INJURY_REGIONS.has(id));
}
