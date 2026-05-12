// server/services/riddor.js — UK RIDDOR (Reporting of Injuries, Diseases and
// Dangerous Occurrences Regulations 2013) detection.
//
// Triggered only for sites in the UK (siteCountry === 'UK'). Returns:
//   { reportable: boolean, category?: string, phoneRequired?: boolean,
//     writtenDeadlineDays?: number|null }
//
// Categories per RIDDOR:
//   - dangerous_occurrence        : Reg 7  → immediate phone + Sch 1 §1 written within 10 days
//   - fatality                    : Reg 6  → immediate phone + 10 days
//   - specified_injury            : Reg 4(1) → immediate phone + 10 days
//   - over_7_day                  : Reg 4(2) → no phone + 15 days
//   - disease                     : Reg 8  → on diagnosis (no fixed deadline)
//   - non_worker_hospitalization  : Reg 5(a) → immediate phone + 10 days
//   - non_worker_specified_injury : Reg 5(b) → immediate phone + 10 days
//   - gas_incident                : Reg 11(1) → without delay + 14 days
//   - gas_dangerous_fitting       : Reg 11(2) → no phone + 14 days
//
// Phase 2 W3 T3.1. Reg 5 + Reg 11 added in WI-04 (PRD chunk 2). Within the
// injury block, Reg 5 (non-workers) is checked BEFORE Reg 4 (workers)
// because Reg 4 is titled "Non-fatal injuries to workers" and applies only
// to "any person at work". Reg 11 is checked LAST so Reg 11(3)(a) precedence
// ("nothing reportable under Reg 11 if reportable elsewhere") is preserved
// by the early-return pattern.

// Reg 4(1)(a)–(h) specified-injury list. Used by Reg 4 AND Reg 5(b)
// (Sch 1 §1 timing applies via "reporting procedure" in both).
const SPECIFIED_INJURY_TOKENS = ['Fracture', 'Amputation', 'Crush Injury', 'Concussion', 'Vision Loss'];

// Reg 5 calls "any person not at work" the non-worker class. Reg 4 is titled
// "Non-fatal injuries to workers" — so anyone whose employment_status maps
// outside the at-work set falls into Reg 5 territory. Visitors and members
// of the public are unambiguous non-workers. Volunteers are ambiguous:
// HSE treats volunteers working alongside an employer's undertaking as
// "at work" for most purposes, but this is fact-dependent. Treating
// volunteers as workers here matches the conservative reading.
// TODO: regulation ambiguous — confirm volunteer treatment with user.
const NON_WORKER_STATUSES = new Set(['visitor', 'member_of_public']);

export function determineRiddorReportability(type, typeData, siteCountry) {
  if (siteCountry !== 'UK') return { reportable: false };

  // RIDDOR 2013 Reg 7 — Dangerous occurrences (Schedule 2 classes).
  if (type === 'dangerous') {
    return { reportable: true, category: 'dangerous_occurrence', phoneRequired: true, writtenDeadlineDays: 10 };
  }

  const td = typeof typeData === 'string' ? JSON.parse(typeData || '{}') : (typeData || {});

  if (type === 'injury') {
    const treatments = td.treatment || td.treatments || [];
    // RIDDOR 2013 Reg 6(1) — Work-related fatality applies to workers AND
    // non-workers ("Where any person dies as a result of a work-related
    // accident..."). Checked first, before the worker/non-worker split.
    if (treatments.includes('Fatality')) {
      return { reportable: true, category: 'fatality', phoneRequired: true, writtenDeadlineDays: 10 };
    }

    const employmentStatus = td.injured_person?.employment_status || td.employment_status;
    const isNonWorker = NON_WORKER_STATUSES.has(employmentStatus);

    // Reg 14(1) — medical procedure exception (applies to Regs 4, 5, 6(1),
    // 12(1)(b)). Reg 14(3) — road-vehicle exception (applies to Regs 4, 5,
    // 6, 12(1)(b)). The engine treats `td.reg14_3_road_vehicle_excluded
    // === true` as the wizard's final decision after applying the four
    // sub-carve-outs of Reg 14(3)(a)–(d) (train accident, substance
    // exposure, loading/unloading, roadside work). Currently scoped only
    // to the Reg 5 (non-worker) path to match the previous commit's blast
    // radius; Reg 4 retains its existing behaviour.
    // TODO: extend Reg 14(1)/(3) gating to the Reg 4 worker path in a
    // future WI (requires owner approval — existing behaviour change).
    const reg14NonWorkerExcluded =
      td.reg14_medical_procedure_exception === true ||
      td.reg14_3_road_vehicle_excluded === true;

    if (isNonWorker) {
      // ─── Reg 5 — Non-fatal injuries to non-workers (members of public,
      // visitors). Verbatim text reproduced below.
      //
      //   "Where any person not at work, as a result of a work-related
      //    accident, suffers—
      //      (a) an injury, and that person is taken from the site of the
      //          accident to a hospital for treatment in respect of that
      //          injury; or
      //      (b) a specified injury on hospital premises,
      //    the responsible person must follow the reporting procedure,
      //    subject to regulations 14 and 15."
      //
      // INDG453: "There is no requirement to establish what hospital
      // treatment was actually provided, and no need to report incidents
      // where people are taken to hospital purely as a precaution when no
      // injury is apparent. If the accident occurred at a hospital, the
      // report only needs to be made if the injury is a 'specified injury'."
      //
      // Sch 1 Part 1 §1 prescribes "without delay" phone + 10 days written.
      if (!reg14NonWorkerExcluded) {
        const hospitalized = !!(td.hospitalized || td.injured_person?.hospitalized);
        const onHospitalPremises = td.on_hospital_premises === true;
        const injuryType = td.injury_type || '';
        const isSpecifiedInjury = SPECIFIED_INJURY_TOKENS.some(si => injuryType.includes(si));

        if (onHospitalPremises) {
          // Reg 5(b) — specified injury on hospital premises.
          if (isSpecifiedInjury) {
            return { reportable: true, category: 'non_worker_specified_injury', phoneRequired: true, writtenDeadlineDays: 10 };
          }
        } else if (hospitalized) {
          // Reg 5(a) — non-worker taken from site of accident to hospital.
          return { reportable: true, category: 'non_worker_hospitalization', phoneRequired: true, writtenDeadlineDays: 10 };
        }
      }
      // A non-worker who does not meet Reg 5(a) or 5(b) is NOT reportable
      // under Reg 4 (which only applies to "any person at work").
    } else {
      // Worker path: employee / contractor / labour_hire / volunteer /
      // self_employed, or an unknown employment_status (defaulted to worker
      // treatment per the conservative reading noted on NON_WORKER_STATUSES).

      // RIDDOR 2013 Reg 4(1)(a)–(h) — Specified-injury list for persons at work.
      const injuryType = td.injury_type || '';
      if (SPECIFIED_INJURY_TOKENS.some(si => injuryType.includes(si))) {
        return { reportable: true, category: 'specified_injury', phoneRequired: true, writtenDeadlineDays: 10 };
      }

      // RIDDOR 2013 Reg 4(2) — Over-7-day incapacitation for persons at work.
      if ((td.osha_days_away || 0) > 7) {
        return { reportable: true, category: 'over_7_day', phoneRequired: false, writtenDeadlineDays: 15 };
      }
    }
  }

  if (type === 'illness') {
    // RIDDOR 2013 Reg 8(a)–(f) — Occupational diseases for persons at work.
    const riddorDiseases = ['Carpal tunnel', 'Hand-arm vibration', 'Occupational asthma', 'Tendonitis', 'Tenosynovitis', 'Dermatitis', 'Occupational cancer'];
    const category = td.illness_category || '';
    if (riddorDiseases.some(d => category.toLowerCase().includes(d.toLowerCase()))) {
      return { reportable: true, category: 'disease', phoneRequired: false, writtenDeadlineDays: null };
    }
  }

  // ─── RIDDOR 2013 Reg 11 — Gas-related injuries and hazards ────────────────
  //
  // Reg 11(3)(a) precedence: "Nothing is reportable under this regulation, if
  // it is notifiable or reportable elsewhere in these Regulations." Preserved
  // here because any matching earlier branch has already returned.
  //
  // The reporting duty under Reg 11 attaches to a SPECIFIC class of person
  // (the gas conveyor/filler/importer/supplier under Reg 11(1), or the
  // "approved person" — a Gas Safe registered engineer — under Reg 11(2)).
  // Our app only fires this branch when the reporting org's role is
  // explicitly recorded on the incident as `type_data.gas_reporter_role`:
  //   'flammable_gas_conveyor' — Reg 11(1) fixed-pipe distributor
  //   'lpg_supplier'           — Reg 11(1) LPG filler/importer/supplier
  //   'approved_person'        — Reg 11(2) Gas Safe registered engineer
  //
  // Reg 2 defines "flammable gas" via Part 2 of Annex I of the CLP Regulation
  // (EC) No 1272/2008. The engine does not classify gas mixtures; the wizard
  // operator chooses the role only when the substance qualifies.
  const gasRole = td.gas_reporter_role;

  // Reg 11(1):
  //   "Where a conveyor of flammable gas through a fixed pipe distribution
  //    system, or a filler, importer or supplier (except by retail) of a
  //    refillable container containing liquefied petroleum gas, receives
  //    notification of the death, loss of consciousness or taking to
  //    hospital of a person because of an injury arising in connection with
  //    that gas, that person must—
  //      (a) notify the Executive of the incident without delay; and
  //      (b) send a report of the incident to the Executive in an approved
  //          manner within 14 days of the incident."
  if (gasRole === 'flammable_gas_conveyor' || gasRole === 'lpg_supplier') {
    const treatments = td.treatment || td.treatments || [];
    const oshaFlags = td.osha_recordability || [];
    const reg11Outcome =
      treatments.includes('Fatality') ||
      oshaFlags.includes('Death') ||
      oshaFlags.includes('Loss of consciousness') ||
      treatments.includes('Hospitalization') ||
      !!td.hospitalized;
    if (reg11Outcome) {
      return { reportable: true, category: 'gas_incident', phoneRequired: true, writtenDeadlineDays: 14 };
    }
  }

  // Reg 11(2):
  //   "Where an approved person has sufficient information to decide that the
  //    design, construction, manner of installation, modification or
  //    servicing of a gas fitting is or could have been likely to cause the
  //    death, loss of consciousness or taking to hospital of a person because
  //    of—
  //      (a) the accidental leakage of gas;
  //      (b) the incomplete combustion of gas; or
  //      (c) the inadequate removal of the products of combustion of gas,
  //    the approved person must send a report of that information to the
  //    Executive in an approved manner within 14 days of acquiring that
  //    information."
  //
  // Reg 11(3)(b)–(c) carve-outs: not reportable while the fitting is under
  // test at a place set aside for that purpose, or if the approved person
  // has previously reported the same information. Honoured via explicit
  // `td.gas_fitting_under_test === true` and `td.gas_previously_reported
  // === true` flags.
  if (gasRole === 'approved_person'
      && td.gas_dangerous_fitting === true
      && td.gas_fitting_under_test !== true
      && td.gas_previously_reported !== true) {
    return { reportable: true, category: 'gas_dangerous_fitting', phoneRequired: false, writtenDeadlineDays: 14 };
  }

  return { reportable: false };
}

export function calculateDeadline(incidentDatetime, deadlineDays) {
  if (!deadlineDays) return null;
  const d = new Date(incidentDatetime);
  d.setDate(d.getDate() + deadlineDays);
  return d.toISOString();
}
