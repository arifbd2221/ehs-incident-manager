export function determineOshaRecordability(type, typeData) {
  if (type !== 'injury' && type !== 'illness') {
    return { recordable: false, type: null };
  }

  const td = typeof typeData === 'string' ? JSON.parse(typeData || '{}') : (typeData || {});
  const treatments = td.treatment || td.treatments || [];

  if (treatments.includes('Fatality')) return { recordable: true, type: 'death' };
  if (treatments.includes('Days away from work')) return { recordable: true, type: 'days_away' };
  if (treatments.includes('Restricted duty') || treatments.includes('Job transfer'))
    return { recordable: true, type: 'job_transfer' };
  if (treatments.includes('Hospitalization')) return { recordable: true, type: 'days_away' };
  if (treatments.includes('Medical treatment'))
    return { recordable: true, type: 'other_recordable' };

  const oshaChecks = td.osha_recordability || [];
  if (oshaChecks.includes('Death')) return { recordable: true, type: 'death' };
  if (oshaChecks.includes('Days away from work (DART)')) return { recordable: true, type: 'days_away' };
  if (oshaChecks.includes('Restricted work or job transfer')) return { recordable: true, type: 'job_transfer' };
  if (oshaChecks.includes('Medical treatment beyond first aid')) return { recordable: true, type: 'other_recordable' };
  if (oshaChecks.includes('Loss of consciousness')) return { recordable: true, type: 'other_recordable' };
  if (oshaChecks.includes('Significant injury diagnosed by HCP')) return { recordable: true, type: 'other_recordable' };

  return { recordable: false, type: 'first_aid' };
}

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
