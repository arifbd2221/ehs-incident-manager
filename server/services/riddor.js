// server/services/riddor.js — UK RIDDOR (Reporting of Injuries, Diseases and
// Dangerous Occurrences Regulations 2013) detection.
//
// Triggered only for sites in the UK (siteCountry === 'UK'). Returns:
//   { reportable: boolean, category?: string, phoneRequired?: boolean,
//     writtenDeadlineDays?: number|null }
//
// Categories per RIDDOR:
//   - dangerous_occurrence : type === 'dangerous' → immediate phone + F2508 within 10 days
//   - fatality             : injury with 'Fatality' treatment → immediate phone + F2508 within 10 days
//   - specified_injury     : fracture, amputation, crush, concussion, vision loss → phone + F2508 within 10 days
//   - over_7_day           : injury with > 7 days away from work → F2508 within 15 days
//   - disease              : occupational disease (carpal tunnel, dermatitis, etc.) → F2508 on diagnosis
//
// Phase 2 W3 T3.1. Direct port of the original regulatory.js RIDDOR logic;
// kept separate from OSHA for clarity and so regional rules can be added
// independently later.

export function determineRiddorReportability(type, typeData, siteCountry) {
  if (siteCountry !== 'UK') return { reportable: false };

  if (type === 'dangerous') {
    return { reportable: true, category: 'dangerous_occurrence', phoneRequired: true, writtenDeadlineDays: 10 };
  }

  const td = typeof typeData === 'string' ? JSON.parse(typeData || '{}') : (typeData || {});

  if (type === 'injury') {
    const treatments = td.treatment || td.treatments || [];
    if (treatments.includes('Fatality')) {
      return { reportable: true, category: 'fatality', phoneRequired: true, writtenDeadlineDays: 10 };
    }

    const injuryType = td.injury_type || '';
    const specifiedInjuries = ['Fracture', 'Amputation', 'Crush Injury', 'Concussion', 'Vision Loss'];
    if (specifiedInjuries.some(si => injuryType.includes(si))) {
      return { reportable: true, category: 'specified_injury', phoneRequired: true, writtenDeadlineDays: 10 };
    }

    if ((td.osha_days_away || 0) > 7) {
      return { reportable: true, category: 'over_7_day', phoneRequired: false, writtenDeadlineDays: 15 };
    }
  }

  if (type === 'illness') {
    const riddorDiseases = ['Carpal tunnel', 'Hand-arm vibration', 'Occupational asthma', 'Tendonitis', 'Tenosynovitis', 'Dermatitis', 'Occupational cancer'];
    const category = td.illness_category || '';
    if (riddorDiseases.some(d => category.toLowerCase().includes(d.toLowerCase()))) {
      return { reportable: true, category: 'disease', phoneRequired: false, writtenDeadlineDays: null };
    }
  }

  return { reportable: false };
}

export function calculateDeadline(incidentDatetime, deadlineDays) {
  if (!deadlineDays) return null;
  const d = new Date(incidentDatetime);
  d.setDate(d.getDate() + deadlineDays);
  return d.toISOString();
}
