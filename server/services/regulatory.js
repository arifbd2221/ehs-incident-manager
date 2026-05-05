// server/services/regulatory.js — back-compat shim.
//
// The OSHA recordability + RIDDOR detection logic moved to dedicated
// modules in Phase 2 W3 T3.1:
//   - recordability.js  (OSHA, with new EHS verification path)
//   - riddor.js         (UK RIDDOR + deadline calc)
//
// Keep this file as a re-exporter so existing callers (incidents.js POST,
// any future routes that imported from here) continue to work without
// being touched in this task. Future tasks can migrate imports directly.

export { determineOshaRecordability } from './recordability.js';
export { determineRiddorReportability, calculateDeadline } from './riddor.js';
