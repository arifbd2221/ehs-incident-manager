// client/src/utils/riddor.js — labels for incidents.riddor_category /
// riddor_reports.category values produced by server/services/riddor.js.
//
// Source of truth for the category strings is the RIDDOR engine. Keep this
// map aligned with the categories there. Adding a new category in the
// engine MUST land here in the same commit, otherwise the UI will fall
// back to the snake_case raw value.

const RIDDOR_CATEGORY_LABELS = {
  dangerous_occurrence:        { label: 'Dangerous occurrence',         reg: 'Reg 7' },
  fatality:                    { label: 'Fatality',                     reg: 'Reg 6' },
  specified_injury:            { label: 'Specified injury (worker)',    reg: 'Reg 4(1)' },
  over_7_day:                  { label: 'Over-7-day absence',           reg: 'Reg 4(2)' },
  disease:                     { label: 'Occupational disease',         reg: 'Reg 8' },
  non_worker_hospitalization:  { label: 'Non-worker hospitalisation',   reg: 'Reg 5(a)' },
  non_worker_specified_injury: { label: 'Non-worker specified injury',  reg: 'Reg 5(b)' },
  gas_incident:                { label: 'Gas incident',                 reg: 'Reg 11(1)' },
  gas_dangerous_fitting:       { label: 'Dangerous gas fitting',        reg: 'Reg 11(2)' },
};

export function riddorCategoryLabel(category) {
  if (!category) return '';
  const entry = RIDDOR_CATEGORY_LABELS[category];
  if (entry) return entry.label;
  return category.replace(/_/g, ' ');
}

export function riddorCategoryReg(category) {
  return RIDDOR_CATEGORY_LABELS[category]?.reg || '';
}
