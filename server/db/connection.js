import Database from 'better-sqlite3';
import crypto from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from './migrate.js';
import { hydrateActivityLogChain } from './activity_log_chain.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH
  ? join(dirname(fileURLToPath(import.meta.url)), '..', process.env.DB_PATH)
  : join(__dirname, 'incident_management.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// WI-C: sha256_hex(text) is the SQL handle for the activity_log chain
// trigger's hashing step. Registered before schema/migrations so the
// chain-INSERT trigger (installed by hydrateActivityLogChain below) can
// invoke it. Deterministic so SQLite can short-circuit repeated calls
// with identical input.
db.function('sha256_hex', { deterministic: true }, (s) => {
  if (s === null || s === undefined) return null;
  return crypto.createHash('sha256').update(String(s)).digest('hex');
});

const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

runMigrations(db);

// WI-C: backfill hash chain for rows that pre-date migration 024 and
// install the chain-INSERT + append-only triggers. Idempotent on
// already-hydrated DBs.
hydrateActivityLogChain(db);

export default db;
