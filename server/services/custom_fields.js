// server/services/custom_fields.js — validate + coerce per-category custom field values.
//
// Used by routes/assets.js on POST and PATCH to:
//   - reject missing required values
//   - coerce types (numbers as numbers, checkboxes as 0/1, etc.)
//   - reject select values that aren't in the configured options
//   - drop unknown keys (silent — keep stored values for fields that were
//     deleted from the category, so historical data isn't lost)
//
// Returns { values, errors } — the route decides whether to 400 on errors
// or save the cleaned values.
//
// Phase 2 W7 E7.1.

import db from '../db/connection.js';

export function loadFieldsForCategory(categoryId) {
  if (!categoryId) return [];
  return db.prepare(`
    SELECT id, field_key, field_label, field_type, is_required, options, helper_text, position
    FROM asset_category_fields
    WHERE category_id = ?
    ORDER BY position, id
  `).all(categoryId);
}

function coerce(value, type) {
  if (value === undefined || value === null || value === '') return null;
  switch (type) {
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case 'checkbox':
      return value === true || value === 1 || value === '1' || value === 'true' ? true : false;
    case 'date':
      // Trust the FE to send YYYY-MM-DD; normalize to that slice if a longer string came in.
      return String(value).slice(0, 10);
    default:
      return String(value);
  }
}

/**
 * Validate + coerce a custom_fields JSON object against a category's field defs.
 *  - definitions: array of field rows from loadFieldsForCategory
 *  - submitted: plain object keyed by field_key
 * Returns { values: {key: coercedValue}, errors: [string,...] }
 */
export function validateCustomFields(definitions, submitted) {
  const out = {};
  const errors = [];
  const submittedSafe = submitted && typeof submitted === 'object' ? submitted : {};

  for (const def of definitions) {
    const raw = submittedSafe[def.field_key];
    const coerced = coerce(raw, def.field_type);

    if (def.is_required && (coerced === null || coerced === '')) {
      errors.push(`"${def.field_label}" is required`);
      continue;
    }

    if (coerced === null) continue;

    if (def.field_type === 'select') {
      const options = def.options ? JSON.parse(def.options) : [];
      if (options.length > 0 && !options.includes(coerced)) {
        errors.push(`"${def.field_label}": "${coerced}" is not one of the configured options`);
        continue;
      }
    }

    if (def.field_type === 'number' && submittedSafe[def.field_key] !== '' && coerced === null) {
      errors.push(`"${def.field_label}" must be a number`);
      continue;
    }

    out[def.field_key] = coerced;
  }

  // Preserve unknown keys from the existing record so historical custom
  // values for fields deleted from the category aren't wiped silently.
  // Caller is responsible for merging these in if it cares.
  return { values: out, errors };
}
