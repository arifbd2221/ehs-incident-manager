// server/services/recordability.js — OSHA 1904 recordability decision.
//
// Hybrid per locked decision #1:
//   - REPORTER PATH: simplified 2-question form + treatment select. Returns
//     {recordable, type, requires_ehs_verification}. The reporter answers
//     work-relatedness, picks a treatment, optionally flags privacy case;
//     the system infers recordability and asks an EHS Manager to verify
//     for Track A/B incidents.
//   - VERIFICATION PATH: full 5-gate decision tree (covered worker /
//     work-related / new case / general criterion / first-aid-vs-medical)
//     for the EHS Manager card on incident detail.
//
// `type` here is the recordability classification, NOT the incident type.
// Possible recordability types:
//   - 'death'             → fatality
//   - 'days_away'         → DART case (days away from work)
//   - 'job_transfer'      → restricted work / job transfer
//   - 'other_recordable'  → medical treatment beyond first aid / LOC / HCP-diagnosed
//   - 'first_aid'         → not recordable
//
// Phase 2 W3 T3.1. Replaces the OSHA half of the original regulatory.js.

// First-aid list per OSHA 1904.7(b)(5)(ii). Anything else = medical treatment
// beyond first aid → recordable. UI labels in the wizard's treatment select
// should match these strings exactly.
export const FIRST_AID_TREATMENTS = new Set([
  'Non-prescription medication at non-prescription strength',
  'Tetanus immunization',
  'Cleaning, flushing, or soaking surface wounds',
  'Wound coverings (bandages, gauze pads)',
  'Hot or cold therapy',
  'Non-rigid means of support (elastic bandages, wraps, non-rigid back belts)',
  'Temporary immobilization device for transport (splints, slings, neck collars)',
  'Drilling fingernail/toenail to relieve pressure or draining fluid from a blister',
  'Eye patches',
  'Removing foreign bodies from the eye using only irrigation or a cotton swab',
  'Removing splinters or foreign material from areas other than the eye by irrigation, tweezers, cotton swabs, or other simple means',
  'Finger guards',
  'Massages',
  'Drinking fluids for relief of heat stress',
]);

// Recording criteria per OSHA 1904.7(b)(1). ANY one triggers recordability.
export const GENERAL_RECORDING_CRITERIA = [
  { id: 'death', label: 'Death', recordability: 'death' },
  { id: 'days_away', label: 'Days away from work', recordability: 'days_away' },
  { id: 'restricted_work', label: 'Restricted work or job transfer', recordability: 'job_transfer' },
  { id: 'medical_beyond_first_aid', label: 'Medical treatment beyond first aid', recordability: 'other_recordable' },
  { id: 'loss_of_consciousness', label: 'Loss of consciousness', recordability: 'other_recordable' },
  { id: 'significant_injury', label: 'Significant injury or illness diagnosed by a licensed healthcare professional', recordability: 'other_recordable' },
];

// 9 work-relatedness exceptions per OSHA 1904.5(b)(2). If any apply, the
// incident is NOT work-related → not recordable, no further gates.
export const WORK_RELATEDNESS_EXCEPTIONS = [
  { id: 'visitor', label: 'Person was a member of the public, not in the work environment as an employee' },
  { id: 'sign_symptom', label: 'Symptoms appeared at work but solely from a non-work-related event or exposure' },
  { id: 'voluntary_wellness', label: 'Voluntary participation in a wellness/fitness/medical program' },
  { id: 'eating_drinking', label: 'Eating, drinking, or preparing food for personal consumption' },
  { id: 'personal_task', label: 'Personal task outside assigned working hours' },
  { id: 'personal_grooming', label: 'Personal grooming, self-medication, or intentional self-inflicted' },
  { id: 'motor_vehicle', label: 'Motor vehicle accident in a parking lot/access road during commuting' },
  { id: 'common_cold_flu', label: 'Common cold or flu' },
  { id: 'mental_illness', label: 'Mental illness — unless work-related per 1904.5(b)(2)(ix)' },
];

/**
 * REPORTER-FORM PATH — simplified, fast, runs at submission time.
 * Looks at the wizard's `type_data` for treatment and any prior OSHA flags
 * the reporter ticked (a small set of high-signal triggers). Returns a
 * recordability decision + a hint that EHS verification is required for
 * Track A/B (caller decides based on track).
 *
 * Backwards-compatible with the original OSHA function shape:
 *   { recordable: boolean, type: string|null }
 * Adds `requires_ehs_verification: boolean` for the EHS card flow.
 */
export function determineOshaRecordability(type, typeData) {
  if (type !== 'injury' && type !== 'illness') {
    return { recordable: false, type: null, requires_ehs_verification: false };
  }

  const td = typeof typeData === 'string' ? JSON.parse(typeData || '{}') : (typeData || {});
  const treatments = td.treatment || td.treatments || [];

  // Treatment-driven path (high-signal user picks)
  if (treatments.includes('Fatality')) {
    return { recordable: true, type: 'death', requires_ehs_verification: true };
  }
  if (treatments.includes('Days away from work')) {
    return { recordable: true, type: 'days_away', requires_ehs_verification: true };
  }
  if (treatments.includes('Restricted duty') || treatments.includes('Job transfer')) {
    return { recordable: true, type: 'job_transfer', requires_ehs_verification: true };
  }
  if (treatments.includes('Hospitalization')) {
    return { recordable: true, type: 'days_away', requires_ehs_verification: true };
  }
  if (treatments.includes('Medical treatment')) {
    return { recordable: true, type: 'other_recordable', requires_ehs_verification: true };
  }

  // Explicit OSHA criteria checkboxes (legacy field — keep for back-compat)
  const oshaChecks = td.osha_recordability || [];
  if (oshaChecks.includes('Death')) {
    return { recordable: true, type: 'death', requires_ehs_verification: true };
  }
  if (oshaChecks.includes('Days away from work (DART)')) {
    return { recordable: true, type: 'days_away', requires_ehs_verification: true };
  }
  if (oshaChecks.includes('Restricted work or job transfer')) {
    return { recordable: true, type: 'job_transfer', requires_ehs_verification: true };
  }
  if (oshaChecks.includes('Medical treatment beyond first aid')) {
    return { recordable: true, type: 'other_recordable', requires_ehs_verification: true };
  }
  if (oshaChecks.includes('Loss of consciousness')) {
    return { recordable: true, type: 'other_recordable', requires_ehs_verification: true };
  }
  if (oshaChecks.includes('Significant injury diagnosed by HCP')) {
    return { recordable: true, type: 'other_recordable', requires_ehs_verification: true };
  }

  // Nothing flagged → first aid only, not recordable. EHS may still verify
  // if the case looks borderline (caller decides based on type/severity).
  return { recordable: false, type: 'first_aid', requires_ehs_verification: false };
}

/**
 * VERIFICATION PATH — full 5-gate decision for the EHS Manager card.
 *
 * Input shape:
 *   {
 *     covered_worker:     boolean,    // gate 1
 *     work_related:       boolean,    // gate 2 (false ⇒ exception_id required)
 *     work_related_exception_id: string|null,
 *     new_case:           boolean,    // gate 3
 *     criterion_id:       string|null,// gate 4 — id from GENERAL_RECORDING_CRITERIA
 *     treatment_choice:   string|null,// gate 5 — exact label from FIRST_AID_TREATMENTS or 'medical_beyond_first_aid'
 *     privacy_case:       boolean,    // 1904.29(b)(7)
 *   }
 *
 * Returns:
 *   { recordable, type, reasoning: [string,...], failed_gate: string|null }
 *
 * `failed_gate` names which gate caused a non-recordable outcome (so the UI
 * can highlight it). `reasoning` is the human-readable trail to surface in
 * the EHS card and the activity log.
 */
export function verifyOshaRecordability(gates = {}) {
  const reasoning = [];

  // Gate 1: covered worker
  if (gates.covered_worker === false) {
    return {
      recordable: false,
      type: null,
      reasoning: ['Person is not a covered employee — not subject to OSHA recordkeeping'],
      failed_gate: 'covered_worker',
    };
  }
  reasoning.push('Person is a covered employee under host-employer control');

  // Gate 2: work-related
  if (gates.work_related === false) {
    const exception = WORK_RELATEDNESS_EXCEPTIONS.find(e => e.id === gates.work_related_exception_id);
    return {
      recordable: false,
      type: null,
      reasoning: [
        ...reasoning,
        `Not work-related${exception ? ` — exception applies: ${exception.label}` : ''}`,
      ],
      failed_gate: 'work_related',
    };
  }
  reasoning.push('Incident occurred in the work environment (no 1904.5(b)(2) exception)');

  // Gate 3: new case
  if (gates.new_case === false) {
    return {
      recordable: false,
      type: null,
      reasoning: [
        ...reasoning,
        'Not a new case (continuation of a previously recorded illness/injury)',
      ],
      failed_gate: 'new_case',
    };
  }
  reasoning.push('New case (no prior recording for this employee for this condition)');

  // Gate 4: general recording criterion
  const criterion = GENERAL_RECORDING_CRITERIA.find(c => c.id === gates.criterion_id);

  // Gate 5: first-aid-vs-medical (only meaningful for the medical_beyond_first_aid criterion path,
  // but the simplified rule is: if treatment_choice is in the FIRST_AID_TREATMENTS set, it's first
  // aid only, regardless of which criterion was selected).
  if (gates.treatment_choice && FIRST_AID_TREATMENTS.has(gates.treatment_choice)) {
    return {
      recordable: false,
      type: 'first_aid',
      reasoning: [
        ...reasoning,
        `Treatment was first aid only — "${gates.treatment_choice}" is on the OSHA 1904.7(b)(5)(ii) first-aid list`,
      ],
      failed_gate: 'treatment_choice',
    };
  }

  if (!criterion) {
    return {
      recordable: false,
      type: 'first_aid',
      reasoning: [
        ...reasoning,
        'No general recording criterion met — no medical treatment beyond first aid, no days away, no transfer, no LOC, no significant diagnosis',
      ],
      failed_gate: 'criterion_id',
    };
  }

  reasoning.push(`General recording criterion met: ${criterion.label}`);
  if (gates.treatment_choice && !FIRST_AID_TREATMENTS.has(gates.treatment_choice)) {
    reasoning.push(`Treatment exceeded first aid: "${gates.treatment_choice}"`);
  }
  if (gates.privacy_case) {
    reasoning.push('Flagged as privacy case per 1904.29(b)(7) — name suppressed on 300 Log');
  }

  return {
    recordable: true,
    type: criterion.recordability,
    reasoning,
    failed_gate: null,
  };
}
