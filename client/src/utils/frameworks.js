// frameworks.js — gates regulator-specific UI on the org's compliance_frameworks.
//
// Mirrors the filter pattern in pages/reports/ReportsPage.jsx so that incident
// surfaces (badges, fact-rows, KPIs) hide flags the org never opted into. A
// RIDDOR-only org should not see "OSHA recordable" Yes/No on every incident.
//
// Defensive fallback: a missing `compliance_frameworks` field on the user
// (legacy accounts created before migration 019, or stale JWTs) is treated as
// "no filter" — show everything — to match ReportsPage's behavior. An explicit
// empty array means the org has actively chosen no frameworks; nothing
// regulator-specific applies.

const OSHA_CODES = ['osha_300', 'osha_300a', 'osha_301'];

export function frameworkVisibility(user) {
  const fw = Array.isArray(user?.compliance_frameworks) ? user.compliance_frameworks : null;
  if (fw === null) return { showOsha: true, showRiddor: true };
  return {
    showOsha: OSHA_CODES.some(c => fw.includes(c)),
    showRiddor: fw.includes('riddor_f2508'),
  };
}
