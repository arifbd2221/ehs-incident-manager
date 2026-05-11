const UNIVERSAL_REQUIRED = ['title', 'type', 'site_id', 'incident_datetime'];

const TYPE_REQUIRED = {
  injury:      ['injured_name'],
  illness:     ['affected_name', 'illness_category'],
  nearmiss:    ['primary_hazard'],
  property:    ['equipment_name'],
  env:         ['substance_name'],
  unsafe:      ['primary_hazard'],
  observation: [],
  dangerous:   [],
};

const ILLNESS_CATEGORIES = [
  'Respiratory condition', 'Skin disorder', 'Hearing loss', 'Poisoning',
  'Heat illness', 'Musculoskeletal disorder', 'Infectious disease', 'Other',
];

const HAZARD_TYPES = [
  'Slip / Trip / Fall', 'Fall from height', 'Struck by object', 'Caught in / between',
  'Electrical', 'Chemical exposure', 'Fire / Explosion', 'Confined space',
  'Mechanical', 'Ergonomic', 'Biological', 'Lockout / Tagout', 'Other',
];

const FIELD_META = {
  title:             { label: 'Title',            prompt: 'Give this incident a short title',          input: 'text' },
  type:              { label: 'Incident Type',    prompt: 'What type of incident was this?',           input: 'type' },
  site_id:           { label: 'Site',             prompt: 'Which site did this happen at?',            input: 'site' },
  incident_datetime: { label: 'Date & Time',      prompt: 'When did this happen?',                    input: 'datetime' },
  injured_name:      { label: 'Injured Person',   prompt: "What is the injured person’s name?",  input: 'text' },
  affected_name:     { label: 'Affected Person',  prompt: "What is the affected person’s name?", input: 'text' },
  illness_category:  { label: 'Illness Category', prompt: 'What category of illness?',                input: 'select', options: ILLNESS_CATEGORIES },
  primary_hazard:    { label: 'Primary Hazard',   prompt: 'What was the primary hazard?',             input: 'select', options: HAZARD_TYPES },
  equipment_name:    { label: 'Equipment',        prompt: 'Which equipment was damaged?',             input: 'text' },
  substance_name:    { label: 'Substance',        prompt: 'What substance was released?',             input: 'text' },
};

export function getRequiredFields(type) {
  return [...UNIVERSAL_REQUIRED, ...(TYPE_REQUIRED[type] || [])];
}

export function checkCompleteness(extraction, gapValues, sites) {
  const fields = extraction?.extracted_fields || {};
  const type = fields.type || gapValues.type;
  const required = getRequiredFields(type);

  const filled = [];
  const missing = [];

  for (const key of required) {
    if (isPresent(key, fields, gapValues, sites)) filled.push(key);
    else missing.push(key);
  }

  return {
    total: required.length,
    filled: filled.length,
    missing,
    pct: required.length ? Math.round((filled.length / required.length) * 100) : 100,
  };
}

function isPresent(key, fields, gap, sites) {
  if (key === 'incident_datetime') return true;
  if (key === 'site_id') {
    if (fields.site_id || gap.site_id) return true;
    return sites && sites.length === 1;
  }
  if (key === 'title') return !!(fields.title || gap.title);
  if (key === 'type') return !!(fields.type || gap.type);

  if (gap[key]) return true;

  if (key === 'injured_name')     return !!(fields.injured_name || fields.witnesses?.some(w => w.name));
  if (key === 'affected_name')    return !!fields.affected_name;
  if (key === 'illness_category') return !!fields.illness_category;
  if (key === 'primary_hazard')   return !!fields.primary_hazard;
  if (key === 'equipment_name')   return !!(fields.equipment_name || fields.asset_match);
  if (key === 'substance_name')   return !!fields.substance_name;

  return false;
}

export function getFieldMeta(key) {
  return FIELD_META[key] || { label: key, prompt: `Please provide: ${key}`, input: 'text' };
}

export { UNIVERSAL_REQUIRED, TYPE_REQUIRED, ILLNESS_CATEGORIES, HAZARD_TYPES };
