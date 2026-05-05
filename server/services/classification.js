// server/services/classification.js — back-compat shim.
//
// The matrix-lookup classification + new rule-based inference moved to
// auto_classify.js in Phase 2 W3 T3.1. Existing callers that import
// `calculateSeverityAndTrack` and `shouldAutoClose` from this file
// continue to work unchanged.

export { calculateSeverityAndTrack, shouldAutoClose, inferSeverityFrom } from './auto_classify.js';
