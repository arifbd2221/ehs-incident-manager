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

  const appliedRows = db.prepare('SELECT name FROM _schema_migrations').all();
  const appliedSet = new Set(appliedRows.map(r => r.name));

  const applied = [];
  const skipped = [];

  for (const file of files) {
    if (appliedSet.has(file)) {
      skipped.push(file);
      continue;
    }

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    const insertStmt = db.prepare('INSERT INTO _schema_migrations (name) VALUES (?)');

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
