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
  if (fw === null) return { showOsha: true, showRiddor: true, showNsw: true };
  return {
    showOsha: OSHA_CODES.some(c => fw.includes(c)),
    showRiddor: fw.includes('riddor_f2508'),
    showNsw: fw.includes('safework_nsw'),
  };
}

// ─── WI-D jurisdiction helpers ──────────────────────────────────────────────
//
// `jurisdictionForContext({user, siteId, sites})` returns the active
// jurisdictions for a given incident-reporting context. The wizard uses
// this to decide which regulatory field-rows to render.
//
// The rule (from docs/implementation-plan.md WI-D):
//   • Org `compliance_frameworks` is the master switch.
//   • Site `country` resolves multi-framework orgs — a UK site under a
//     US+UK org gets RIDDOR; a US site gets OSHA.
//   • If no site is picked yet (early in the wizard) we can't disambiguate
//     by country, so we permissively return every jurisdiction the user's
//     org has access to. The fields stay visible until the user commits
//     to a site, then collapse if the site narrows the jurisdiction.
//
// Output: array of jurisdiction codes (any of 'US-OSHA' | 'UK-RIDDOR' |
// 'AU-NSW' | 'generic'). Empty array means no regulatory regime applies —
// caller renders only the minimum field set.

export function jurisdictionForContext({ user, siteId, sites }) {
  const fwArray = Array.isArray(user?.compliance_frameworks) ? user.compliance_frameworks : null;
  // Legacy / unknown frameworks → permissive (show every regulator).
  // Same fallback as frameworkVisibility() above.
  if (fwArray === null) return ['US-OSHA', 'UK-RIDDOR', 'AU-NSW'];

  const hasOsha = OSHA_CODES.some(c => fwArray.includes(c));
  const hasRiddor = fwArray.includes('riddor_f2508');
  const hasNsw = fwArray.includes('safework_nsw');
  const hasGeneric = fwArray.includes('generic');

  // Find the chosen site's country. siteId may be a string (from the
  // wizard's ComboBox) or a number — coerce both sides for compare.
  const site = Array.isArray(sites)
    ? sites.find(s => String(s?.id) === String(siteId))
    : null;
  const country = site?.country || null;

  const out = new Set();

  // With a country, gate each regulator on its country match.
  if (country) {
    if (hasOsha && country === 'US') out.add('US-OSHA');
    if (hasRiddor && country === 'UK') out.add('UK-RIDDOR');
    if (hasNsw && country === 'AU') out.add('AU-NSW');
  } else {
    // No site picked yet — be permissive across the user's frameworks so
    // the form doesn't visibly "shrink" the moment a site is selected.
    if (hasOsha) out.add('US-OSHA');
    if (hasRiddor) out.add('UK-RIDDOR');
    if (hasNsw) out.add('AU-NSW');
  }

  if (hasGeneric) out.add('generic');

  return Array.from(out);
}

// Registry: which jurisdictions need which field. Keys map to the
// `data.<key>` shape inside InjuryForm; values are arrays of jurisdiction
// codes. A field is rendered when ANY of its required jurisdictions is
// active (showField below).
//
// "Always-shown" minimum set (name, job_title, body_part, injury_type)
// is NOT listed here — the wizard renders those unconditionally.
const FIELD_REQUIRED_BY = {
  // WI-A identity fields added to the wizard's primary affected-person section.
  injured_address:    ['US-OSHA', 'UK-RIDDOR', 'AU-NSW'],  // 1904.29 / F2508 / Notify
  injured_phone:      ['UK-RIDDOR', 'AU-NSW'],             // F2508 / Notify
  injured_dob:        ['US-OSHA', 'UK-RIDDOR', 'AU-NSW'],  // OSHA 301; RIDDOR age; NSW
  injured_gender:     ['US-OSHA', 'AU-NSW'],               // OSHA 301; NSW
  injured_date_hired: ['US-OSHA'],                         // OSHA 301
  // WI-04 wizard card surfacing Reg 5(b), Reg 11, Reg 14 inputs.
  riddor_edge_cases:  ['UK-RIDDOR'],
};

// Returns true when the named field should render given the active
// jurisdictions + the "show all fields" override toggle. The override is
// always honoured so reporters can capture beyond the strict jurisdiction
// set when the situation demands (e.g., a US org with a one-off UK
// claimant). The toggle state is owned by the calling component.
export function showField(key, jurisdictions, showAll) {
  if (showAll) return true;
  const required = FIELD_REQUIRED_BY[key];
  if (!required) return true;  // unknown keys are not gated
  if (!Array.isArray(jurisdictions) || jurisdictions.length === 0) return false;
  return required.some(j => jurisdictions.includes(j));
}
