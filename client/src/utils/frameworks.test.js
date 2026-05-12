// frameworks.test.js — WI-D unit tests for jurisdictionForContext +
// showField. Pure functional; no DOM, no DB, no HTTP. Run with:
//
//   node --test client/src/utils/frameworks.test.js
//
// (The .test.js file ships alongside the helper so the registry stays
// honest as new fields/jurisdictions are added.)

import test from 'node:test';
import assert from 'node:assert/strict';
import { frameworkVisibility, jurisdictionForContext, showField } from './frameworks.js';

const usSite = { id: 1, name: 'Cleveland Plant', country: 'US' };
const ukSite = { id: 2, name: 'Sheffield Site', country: 'UK' };
const auSite = { id: 3, name: 'Sydney Yard',    country: 'AU' };
const sites = [usSite, ukSite, auSite];

// ─── frameworkVisibility (back-compat — already shipped) ────────────────

test('frameworkVisibility: legacy user with no frameworks → showOsha + showRiddor + showNsw', () => {
  assert.deepEqual(frameworkVisibility({}), { showOsha: true, showRiddor: true, showNsw: true });
});

test('frameworkVisibility: RIDDOR-only org', () => {
  assert.deepEqual(
    frameworkVisibility({ compliance_frameworks: ['riddor_f2508'] }),
    { showOsha: false, showRiddor: true, showNsw: false },
  );
});

test('frameworkVisibility: SafeWork NSW-only org', () => {
  assert.deepEqual(
    frameworkVisibility({ compliance_frameworks: ['safework_nsw'] }),
    { showOsha: false, showRiddor: false, showNsw: true },
  );
});

test('frameworkVisibility: multi-framework org gets all three flags', () => {
  assert.deepEqual(
    frameworkVisibility({ compliance_frameworks: ['osha_300', 'riddor_f2508', 'safework_nsw'] }),
    { showOsha: true, showRiddor: true, showNsw: true },
  );
});

// ─── jurisdictionForContext ─────────────────────────────────────────────

test('jurisdictionForContext: legacy user (no frameworks field) → permissive (all three)', () => {
  const out = jurisdictionForContext({ user: {}, siteId: 1, sites });
  assert.deepEqual(out.sort(), ['AU-NSW', 'UK-RIDDOR', 'US-OSHA']);
});

test('jurisdictionForContext: empty frameworks array → []', () => {
  const user = { compliance_frameworks: [] };
  const out = jurisdictionForContext({ user, siteId: 1, sites });
  assert.deepEqual(out, []);
});

test('jurisdictionForContext: OSHA-only org + US site → [US-OSHA]', () => {
  const user = { compliance_frameworks: ['osha_300', 'osha_300a', 'osha_301'] };
  assert.deepEqual(jurisdictionForContext({ user, siteId: 1, sites }), ['US-OSHA']);
});

test('jurisdictionForContext: OSHA-only org + UK site → [] (country mismatch)', () => {
  const user = { compliance_frameworks: ['osha_300'] };
  assert.deepEqual(jurisdictionForContext({ user, siteId: 2, sites }), []);
});

test('jurisdictionForContext: RIDDOR-only org + UK site → [UK-RIDDOR]', () => {
  const user = { compliance_frameworks: ['riddor_f2508'] };
  assert.deepEqual(jurisdictionForContext({ user, siteId: 2, sites }), ['UK-RIDDOR']);
});

test('jurisdictionForContext: NSW-only org + AU site → [AU-NSW]', () => {
  const user = { compliance_frameworks: ['safework_nsw'] };
  assert.deepEqual(jurisdictionForContext({ user, siteId: 3, sites }), ['AU-NSW']);
});

test('jurisdictionForContext: multi-framework org switches on site.country', () => {
  const user = { compliance_frameworks: ['osha_301', 'riddor_f2508', 'safework_nsw'] };
  assert.deepEqual(jurisdictionForContext({ user, siteId: 1, sites }), ['US-OSHA']);
  assert.deepEqual(jurisdictionForContext({ user, siteId: 2, sites }), ['UK-RIDDOR']);
  assert.deepEqual(jurisdictionForContext({ user, siteId: 3, sites }), ['AU-NSW']);
});

test('jurisdictionForContext: no site picked → permissive across user frameworks', () => {
  const user = { compliance_frameworks: ['osha_301', 'riddor_f2508'] };
  const out = jurisdictionForContext({ user, siteId: '', sites }).sort();
  assert.deepEqual(out, ['UK-RIDDOR', 'US-OSHA']);
});

test('jurisdictionForContext: generic framework always included if present', () => {
  const user = { compliance_frameworks: ['generic', 'osha_300'] };
  const out = jurisdictionForContext({ user, siteId: 1, sites }).sort();
  assert.deepEqual(out, ['US-OSHA', 'generic']);
});

test('jurisdictionForContext: siteId as string also works', () => {
  const user = { compliance_frameworks: ['riddor_f2508'] };
  assert.deepEqual(
    jurisdictionForContext({ user, siteId: '2', sites }),
    ['UK-RIDDOR'],
  );
});

// ─── showField ──────────────────────────────────────────────────────────

test('showField: showAll override always wins', () => {
  assert.equal(showField('injured_phone', [], true), true);
  assert.equal(showField('injured_date_hired', ['UK-RIDDOR'], true), true);
});

test('showField: unknown key → true (not gated)', () => {
  assert.equal(showField('mystery_field', [], false), true);
});

test('showField: address shown to all three regulators', () => {
  assert.equal(showField('injured_address', ['US-OSHA'], false), true);
  assert.equal(showField('injured_address', ['UK-RIDDOR'], false), true);
  assert.equal(showField('injured_address', ['AU-NSW'], false), true);
});

test('showField: address hidden when no regulator applies', () => {
  assert.equal(showField('injured_address', [], false), false);
  assert.equal(showField('injured_address', ['generic'], false), false);
});

test('showField: phone hidden for OSHA-only', () => {
  assert.equal(showField('injured_phone', ['US-OSHA'], false), false);
  assert.equal(showField('injured_phone', ['UK-RIDDOR'], false), true);
  assert.equal(showField('injured_phone', ['AU-NSW'], false), true);
});

test('showField: date_hired hidden for non-OSHA jurisdictions', () => {
  assert.equal(showField('injured_date_hired', ['UK-RIDDOR'], false), false);
  assert.equal(showField('injured_date_hired', ['AU-NSW'], false), false);
  assert.equal(showField('injured_date_hired', ['US-OSHA'], false), true);
});

test('showField: gender hidden for RIDDOR-only', () => {
  assert.equal(showField('injured_gender', ['UK-RIDDOR'], false), false);
  assert.equal(showField('injured_gender', ['US-OSHA'], false), true);
  assert.equal(showField('injured_gender', ['AU-NSW'], false), true);
});

test('showField: riddor_edge_cases only shown when RIDDOR active', () => {
  assert.equal(showField('riddor_edge_cases', ['UK-RIDDOR'], false), true);
  assert.equal(showField('riddor_edge_cases', ['US-OSHA'], false), false);
  assert.equal(showField('riddor_edge_cases', ['AU-NSW'], false), false);
  assert.equal(showField('riddor_edge_cases', ['US-OSHA', 'UK-RIDDOR'], false), true);
});

// ─── Integration: realistic demo-account scenarios ──────────────────────

test('integration: acme (OSHA-only US) at US site → OSHA fields, no phone, no RIDDOR card', () => {
  const user = { compliance_frameworks: ['osha_300', 'osha_300a', 'osha_301'] };
  const j = jurisdictionForContext({ user, siteId: 1, sites });
  assert.equal(showField('injured_address', j, false), true);
  assert.equal(showField('injured_phone', j, false), false);
  assert.equal(showField('injured_dob', j, false), true);
  assert.equal(showField('injured_date_hired', j, false), true);
  assert.equal(showField('riddor_edge_cases', j, false), false);
});

test('integration: riddor-test (RIDDOR-only UK) at UK site → RIDDOR card visible, no date_hired', () => {
  const user = { compliance_frameworks: ['riddor_f2508'] };
  const j = jurisdictionForContext({ user, siteId: 2, sites });
  assert.equal(showField('injured_address', j, false), true);
  assert.equal(showField('injured_phone', j, false), true);
  assert.equal(showField('injured_dob', j, false), true);
  assert.equal(showField('injured_gender', j, false), false);
  assert.equal(showField('injured_date_hired', j, false), false);
  assert.equal(showField('riddor_edge_cases', j, false), true);
});

test('integration: sydney-test (NSW-only AU) at AU site → NSW fields, no date_hired, no RIDDOR card', () => {
  const user = { compliance_frameworks: ['safework_nsw'] };
  const j = jurisdictionForContext({ user, siteId: 3, sites });
  assert.equal(showField('injured_address', j, false), true);
  assert.equal(showField('injured_phone', j, false), true);
  assert.equal(showField('injured_dob', j, false), true);
  assert.equal(showField('injured_gender', j, false), true);
  assert.equal(showField('injured_date_hired', j, false), false);
  assert.equal(showField('riddor_edge_cases', j, false), false);
});

test('integration: priya (multi-framework) switches: UK site hides date_hired, US site hides phone+RIDDOR', () => {
  const user = { compliance_frameworks: ['osha_300', 'osha_301', 'riddor_f2508'] };
  // At Sheffield (UK) → RIDDOR applies, OSHA hidden
  const jUK = jurisdictionForContext({ user, siteId: 2, sites });
  assert.equal(showField('injured_phone', jUK, false), true);
  assert.equal(showField('injured_date_hired', jUK, false), false);
  assert.equal(showField('riddor_edge_cases', jUK, false), true);
  // At Cleveland (US) → OSHA applies, RIDDOR hidden
  const jUS = jurisdictionForContext({ user, siteId: 1, sites });
  assert.equal(showField('injured_phone', jUS, false), false);
  assert.equal(showField('injured_date_hired', jUS, false), true);
  assert.equal(showField('riddor_edge_cases', jUS, false), false);
});

test('integration: generic-only org sees only the minimum field set', () => {
  const user = { compliance_frameworks: ['generic'] };
  const j = jurisdictionForContext({ user, siteId: 1, sites });
  assert.deepEqual(j, ['generic']);
  assert.equal(showField('injured_address', j, false), false);
  assert.equal(showField('injured_phone', j, false), false);
  assert.equal(showField('injured_dob', j, false), false);
  assert.equal(showField('injured_gender', j, false), false);
  assert.equal(showField('injured_date_hired', j, false), false);
  assert.equal(showField('riddor_edge_cases', j, false), false);
});
