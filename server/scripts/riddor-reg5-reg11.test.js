// server/scripts/riddor-reg5-reg11.test.js — WI-04 unit tests for
// the RIDDOR 2013 Reg 5 (non-fatal injuries to non-workers) and Reg 11
// (gas-related injuries and hazards) branches in services/riddor.js.
//
// Run from repo root:
//   node --test server/scripts/riddor-reg5-reg11.test.js
//
// Pure functional tests against determineRiddorReportability(). No DB,
// no HTTP, no migration state required.

import test from 'node:test';
import assert from 'node:assert/strict';
import { determineRiddorReportability } from '../services/riddor.js';

// ─── Reg 5 — Non-fatal injuries to non-workers ────────────────────────────

test('Reg 5(a): member of the public taken to hospital from a work-related accident → reportable', () => {
  const td = {
    injured_person: { employment_status: 'member_of_public' },
    hospitalized: true,
    injury_type: 'Laceration',
  };
  const r = determineRiddorReportability('injury', td, 'UK');
  assert.equal(r.reportable, true);
  assert.equal(r.category, 'non_worker_hospitalization');
  assert.equal(r.phoneRequired, true);
  assert.equal(r.writtenDeadlineDays, 10);
});

test('Reg 5 negative: non-worker injury that does NOT require hospital treatment → not reportable under Reg 5', () => {
  const td = {
    injured_person: { employment_status: 'member_of_public' },
    hospitalized: false,
    injury_type: 'Sprain',
  };
  const r = determineRiddorReportability('injury', td, 'UK');
  assert.equal(r.reportable, false);
});

test('Reg 5(a) visitor variant: visitor taken to hospital → reportable', () => {
  const td = {
    injured_person: { employment_status: 'visitor', hospitalized: true },
    injury_type: 'Laceration',
  };
  const r = determineRiddorReportability('injury', td, 'UK');
  assert.equal(r.reportable, true);
  assert.equal(r.category, 'non_worker_hospitalization');
});

test('Reg 5(b): specified injury on hospital premises (non-worker) → reportable as non_worker_specified_injury', () => {
  // Owner-authorized branch reorder (2026-05-12): the non-worker check
  // runs BEFORE the Reg 4(1) specified-injury check, so a visitor with a
  // Fracture on hospital premises is now correctly classified under Reg 5(b).
  const td = {
    injured_person: { employment_status: 'visitor' },
    on_hospital_premises: true,
    injury_type: 'Fracture',
    hospitalized: false,
  };
  const r = determineRiddorReportability('injury', td, 'UK');
  assert.equal(r.reportable, true);
  assert.equal(r.category, 'non_worker_specified_injury');
  assert.equal(r.phoneRequired, true);
  assert.equal(r.writtenDeadlineDays, 10);
});

test('Reg 5 negative: non-worker with specified injury, NOT on hospital premises, NOT hospitalized → not reportable', () => {
  // Behaviour gained from the owner-authorized branch reorder: previously
  // this case fell through to Reg 4(1) `specified_injury` (incorrect:
  // Reg 4 only applies to "any person at work"). Now Reg 5 owns the
  // non-worker path and correctly returns not-reportable because neither
  // 5(a) (taken to hospital) nor 5(b) (specified injury on hospital
  // premises) applies.
  const td = {
    injured_person: { employment_status: 'member_of_public' },
    injury_type: 'Fracture',
    hospitalized: false,
    on_hospital_premises: false,
  };
  const r = determineRiddorReportability('injury', td, 'UK');
  assert.equal(r.reportable, false);
});

test('Reg 14(3) exception: non-worker hospitalized from a road-vehicle accident with no carve-out → not reportable', () => {
  // Wizard sets `reg14_3_road_vehicle_excluded === true` after determining
  // none of the Reg 14(3)(a)–(d) carve-outs apply (train accident,
  // substance exposure, loading/unloading, roadside work).
  const td = {
    injured_person: { employment_status: 'member_of_public' },
    hospitalized: true,
    reg14_3_road_vehicle_excluded: true,
  };
  const r = determineRiddorReportability('injury', td, 'UK');
  assert.equal(r.reportable, false);
});

test('Reg 14(3) carve-out: non-worker hospitalized at roadside work site → reportable (wizard did NOT exclude)', () => {
  // If a Reg 14(3) carve-out applies (e.g. (d) roadside work), the wizard
  // sets the flag to false and the engine treats the incident as a normal
  // Reg 5 case.
  const td = {
    injured_person: { employment_status: 'member_of_public' },
    hospitalized: true,
    reg14_3_road_vehicle_excluded: false,
  };
  const r = determineRiddorReportability('injury', td, 'UK');
  assert.equal(r.reportable, true);
  assert.equal(r.category, 'non_worker_hospitalization');
});

test('Reg 5(b) negative: non-specified injury on hospital premises → not reportable', () => {
  // Per Reg 5(b), only specified injuries on hospital premises trigger.
  // Confirms the Reg 5 branch (the only path here, since Reg 4 won't
  // match a non-specified injury_type) does the right thing.
  const td = {
    injured_person: { employment_status: 'visitor' },
    on_hospital_premises: true,
    injury_type: 'Bruise',
    hospitalized: false,
  };
  const r = determineRiddorReportability('injury', td, 'UK');
  assert.equal(r.reportable, false);
});

test('Reg 14(1) exception: non-worker hospitalized but injury arose from a medical procedure → not reportable', () => {
  const td = {
    injured_person: { employment_status: 'member_of_public' },
    hospitalized: true,
    reg14_medical_procedure_exception: true,
  };
  const r = determineRiddorReportability('injury', td, 'UK');
  assert.equal(r.reportable, false);
});

test('Reg 5 does not fire for workers (employment_status=employee with hospitalization, no other Reg 4 hit)', () => {
  // A worker with hospitalization but no specified injury / no >7 days
  // is NOT auto-classified under Reg 5 (Reg 5 is for non-workers only).
  const td = {
    injured_person: { employment_status: 'employee' },
    hospitalized: true,
    injury_type: 'Sprain',
  };
  const r = determineRiddorReportability('injury', td, 'UK');
  assert.equal(r.reportable, false);
});

test('Reg 5 country gate: hospitalized non-worker outside UK → not reportable', () => {
  const td = {
    injured_person: { employment_status: 'member_of_public' },
    hospitalized: true,
  };
  const r = determineRiddorReportability('injury', td, 'US');
  assert.equal(r.reportable, false);
});

// ─── Reg 11 — Gas-related injuries and hazards ────────────────────────────

test('Reg 11(2): approved person (Gas Safe engineer) reports a dangerous gas fitting → reportable', () => {
  const td = {
    gas_reporter_role: 'approved_person',
    gas_dangerous_fitting: true,
  };
  // Reg 11(2) does not depend on outcome (death/LOC/hospitalization);
  // it triggers on the approved person's decision about the fitting itself.
  const r = determineRiddorReportability('dangerous', td, 'UK');
  // dangerous + UK fires Reg 7 first (precedence). Verify Reg 7 catches it.
  assert.equal(r.reportable, true);
  assert.equal(r.category, 'dangerous_occurrence');
});

test('Reg 11(2) without dangerous-occurrence framing: approved person reports a dangerous gas fitting on non-dangerous type → reportable as gas_dangerous_fitting', () => {
  // Mirrors the typical Reg 11(2) capture path where the incident isn't
  // tagged as a Schedule 2 dangerous occurrence — only an approved-person
  // notification about a fitting.
  const td = {
    gas_reporter_role: 'approved_person',
    gas_dangerous_fitting: true,
  };
  const r = determineRiddorReportability('observation', td, 'UK');
  assert.equal(r.reportable, true);
  assert.equal(r.category, 'gas_dangerous_fitting');
  assert.equal(r.phoneRequired, false);
  assert.equal(r.writtenDeadlineDays, 14);
});

test('Reg 11(1): LPG supplier learns of a hospitalization from their gas → reportable', () => {
  const td = {
    gas_reporter_role: 'lpg_supplier',
    hospitalized: true,
  };
  const r = determineRiddorReportability('injury', td, 'UK');
  assert.equal(r.reportable, true);
  assert.equal(r.category, 'gas_incident');
  assert.equal(r.phoneRequired, true);
  assert.equal(r.writtenDeadlineDays, 14);
});

test('Reg 11(1): flammable-gas conveyor learns of LOC from their gas → reportable', () => {
  const td = {
    gas_reporter_role: 'flammable_gas_conveyor',
    osha_recordability: ['Loss of consciousness'],
  };
  const r = determineRiddorReportability('injury', td, 'UK');
  assert.equal(r.reportable, true);
  assert.equal(r.category, 'gas_incident');
});

test('Reg 11 negative: gas escape without Reg 11 role / outcome → not reportable under Reg 11', () => {
  // A gas escape that doesn't meet Reg 11 criteria: no approved-person
  // role, no flammable-gas-conveyor role, and not flagged as a Schedule 2
  // dangerous occurrence.
  const td = {
    description: 'Minor gas leak detected at workplace, no injuries',
    gas_incident: true, // narrative flag only; not a Reg 11 trigger
  };
  const r = determineRiddorReportability('nearmiss', td, 'UK');
  assert.equal(r.reportable, false);
});

test('Reg 11(3)(b): gas fitting under test → not reportable', () => {
  const td = {
    gas_reporter_role: 'approved_person',
    gas_dangerous_fitting: true,
    gas_fitting_under_test: true,
  };
  const r = determineRiddorReportability('observation', td, 'UK');
  assert.equal(r.reportable, false);
});

test('Reg 11(3)(c): previously reported by approved person → not reportable', () => {
  const td = {
    gas_reporter_role: 'approved_person',
    gas_dangerous_fitting: true,
    gas_previously_reported: true,
  };
  const r = determineRiddorReportability('observation', td, 'UK');
  assert.equal(r.reportable, false);
});

test('Reg 11(3)(a) precedence: a fatality from gas is reportable under Reg 6, NOT Reg 11', () => {
  // The existing Reg 6 branch returns 'fatality' early. Reg 11(3)(a) says
  // nothing under Reg 11 if reportable elsewhere — the early-return pattern
  // preserves that even when gas_reporter_role is set.
  const td = {
    gas_reporter_role: 'lpg_supplier',
    treatment: ['Fatality'],
  };
  const r = determineRiddorReportability('injury', td, 'UK');
  assert.equal(r.category, 'fatality');
});

test('Reg 11 country gate: gas incident outside UK → not reportable', () => {
  const td = {
    gas_reporter_role: 'lpg_supplier',
    hospitalized: true,
  };
  const r = determineRiddorReportability('injury', td, 'US');
  assert.equal(r.reportable, false);
});

// ─── Smoke: existing branches still pass ─────────────────────────────────

test('regression: Reg 4(1) specified injury still reportable', () => {
  const td = { injury_type: 'Fracture of femur' };
  const r = determineRiddorReportability('injury', td, 'UK');
  assert.equal(r.category, 'specified_injury');
});

test('regression: Reg 7 dangerous occurrence still reportable', () => {
  const r = determineRiddorReportability('dangerous', {}, 'UK');
  assert.equal(r.category, 'dangerous_occurrence');
});

test('regression: Reg 8 occupational disease still reportable', () => {
  const r = determineRiddorReportability('illness', { illness_category: 'Occupational dermatitis from epoxy resin' }, 'UK');
  assert.equal(r.category, 'disease');
});
