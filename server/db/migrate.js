// server/db/migrate.js — applied-set tracker for one-shot SQL migrations.
//
// Each .sql file under server/db/migrations/ is applied once, in lexical order,
// inside a single transaction. Successful application records the file name in
// _schema_migrations(name PRIMARY KEY, applied_at). Re-runs are idempotent.

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

export function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  if (!existsSync(MIGRATIONS_DIR)) {
    return { applied: [], skipped: [] };
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const applied = [];
  const skipped = [];
  const insertStmt = db.prepare('INSERT INTO _schema_migrations (name) VALUES (?)');
  const queryApplied = db.prepare('SELECT 1 FROM _schema_migrations WHERE name = ?');

  // Re-check the applied set per file rather than caching once. Some fixup
  // migrations rewrite rows in _schema_migrations (e.g., renaming a legacy
  // entry after a file rename), and a downstream file in the same boot may
  // depend on that change being visible.
  for (const file of files) {
    if (queryApplied.get(file)) {
      skipped.push(file);
      continue;
    }

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');

    const apply = db.transaction(() => {
      db.exec(sql);
      insertStmt.run(file);
    });

    try {
      apply();
      applied.push(file);
      console.log(`[migrate] applied ${file}`);
    } catch (err) {
      console.error(`[migrate] FAILED ${file}: ${err.message}`);
      throw err;
    }
  }

  return { applied, skipped };
}
