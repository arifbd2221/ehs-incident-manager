// server/services/csv_import.js — generic CSV import engine for P3-OB2.
//
// Built around a strict-template model: the admin downloads a per-entity
// template, fills it in, uploads. Headers must match exactly (order + spelling)
// — there is no column-mapping UI in v1.
//
// Per-entity definitions plug in via the shape:
//   {
//     entityName: 'user',
//     headers: ['email', 'name', ...],
//     validateRow(raw, ctx) -> { errors: [{column?, reason}], parsed? }
//     insertRow(parsed, ctx) -> insertedId           // called inside transaction
//     onAllInserted?(insertedIds, ctx)               // optional summary hook
//   }
//
// The engine handles parsing, header validation, per-row validation
// accumulation, dry-run vs commit, and an all-or-none transaction. Per-entity
// definitions own only their schema-specific rules.

import { parse } from 'csv-parse/sync';
import db from '../db/connection.js';

export class CsvImportError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function parseCsv(csvText, expectedHeaders) {
  if (typeof csvText !== 'string' || csvText.trim().length === 0) {
    throw new CsvImportError('CSV body is empty');
  }

  let records;
  try {
    records = parse(csvText, {
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      bom: true,
    });
  } catch (e) {
    throw new CsvImportError(`CSV parse error: ${e.message}`);
  }

  if (records.length === 0) throw new CsvImportError('CSV has no rows');

  const [headerRow, ...dataRows] = records;
  if (headerRow.length !== expectedHeaders.length
      || headerRow.some((h, i) => h !== expectedHeaders[i])) {
    throw new CsvImportError(
      `Header row mismatch. Expected exactly: ${expectedHeaders.join(', ')}`
    );
  }

  // Drop trailing all-empty rows that some editors add. A row is empty if
  // every cell is whitespace-only.
  const filtered = dataRows.filter(cells => cells.some(c => String(c ?? '').trim() !== ''));

  const rows = filtered.map((cells, i) => {
    const obj = { __rowNumber: i + 2 };  // +2: 1-based + header row
    expectedHeaders.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? '').toString();
    });
    return obj;
  });

  return rows;
}

// Runs the definition against a CSV body. mode='dry_run' parses+validates only;
// mode='commit' writes inside a transaction iff there are zero errors. Returns
// { total, valid_count, error_count, errors, inserted_ids? }. The route layer
// decides HTTP status (400 on parse / header errors, 200 with errors[] on
// per-row validation errors so the FE can render them).
export function runImport(definition, csvText, mode, ctx) {
  const rows = parseCsv(csvText, definition.headers);

  const errors = [];
  const validRows = [];
  const seen = new Map();  // for in-file uniqueness checks (e.g. duplicate emails)

  for (const raw of rows) {
    const result = definition.validateRow(raw, { ...ctx, seen });
    if (result.errors && result.errors.length) {
      for (const err of result.errors) {
        errors.push({ row: raw.__rowNumber, column: err.column || null, reason: err.reason });
      }
    } else if (result.parsed) {
      validRows.push({ ...result.parsed, __rowNumber: raw.__rowNumber });
    }
  }

  const summary = {
    total: rows.length,
    valid_count: validRows.length,
    error_count: errors.length,
    errors,
  };

  if (mode === 'dry_run' || errors.length > 0) {
    return summary;
  }

  // Atomic commit: all rows or none. better-sqlite3 transactions throw out
  // on any uncaught exception, rolling back automatically.
  const insertAll = db.transaction((rows) => {
    const ids = [];
    for (const r of rows) {
      ids.push(definition.insertRow(r, ctx));
    }
    if (definition.onAllInserted) {
      definition.onAllInserted(ids, ctx);
    }
    return ids;
  });

  let insertedIds;
  try {
    insertedIds = insertAll(validRows);
  } catch (e) {
    // A late error (e.g. UNIQUE collision from a concurrent insert between
    // dry-run and commit) — surface it as a single error row.
    return {
      ...summary,
      error_count: 1,
      errors: [{ row: null, column: null, reason: `Commit failed: ${e.message}` }],
    };
  }

  return { ...summary, inserted_ids: insertedIds };
}
