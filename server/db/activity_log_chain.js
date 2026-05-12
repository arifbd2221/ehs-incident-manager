// server/db/activity_log_chain.js — WI-C runtime support for the tamper-
// evident activity_log hash chain.
//
// Responsibilities:
//   1. canonicalSerialize(row, prevHash) — pipe-delimited byte-exact
//      string used for hashing. MUST match the SQL trigger's
//      concatenation token-for-token; if you change one, change the other
//      and bump a guard test.
//   2. hydrateActivityLogChain(db) — one-time backfill of prev_hash +
//      entry_hash for rows that pre-date migration 024, then installs
//      the chain-INSERT + append-only triggers. Idempotent: on a fully-
//      hydrated DB this short-circuits before the backfill loop and only
//      ensures the triggers exist.
//   3. verifyChain(db, org_id) — re-walks an org's chain and confirms
//      each stored entry_hash matches a fresh recomputation. Returns
//      {ok, count} or {ok:false, brokenAt, reason, count}.
//
// Per-org chains. Each tenant gets its own head; cross-org rows never
// participate in each other's chains so a forensic export of one org's
// log can be verified standalone.
//
// Trigger model:
//   - activity_log_hash_chain_insert (AFTER INSERT, WHEN entry_hash IS NULL):
//     autocomputes prev_hash + entry_hash so both writeActivity() and
//     any hand-rolled INSERT INTO activity_log path are chained.
//   - activity_log_no_update_originals (BEFORE UPDATE OF substantive cols):
//     blocks modification of org_id, entity_type, entity_id, action,
//     description, user_id, metadata, ip_address, user_agent, field_diffs,
//     created_at. The hash columns are deliberately excluded so the
//     chain-INSERT trigger can populate them.
//   - activity_log_no_rehash (BEFORE UPDATE OF prev_hash, entry_hash WHEN
//     OLD.entry_hash IS NOT NULL): once the chain is hydrated for a row
//     its hashes are immutable. Allows the NULL→value transition during
//     the chain-INSERT trigger and the one-time backfill.
//   - activity_log_no_delete (BEFORE DELETE): no deletions ever.

import crypto from 'crypto';

// Pipe-delimited because (a) it's trivially mirrored in SQL string
// concatenation and (b) sidesteps SQLite's unstable json_object key
// ordering. The chain trigger below uses the same template.
//
// Null handling: NULL → '' (empty string between pipes). entity_id and
// user_id are common nullables; metadata defaults to '{}'.
export function canonicalSerialize(row, prevHash) {
  return [
    prevHash ?? '',
    row.id,
    row.org_id,
    row.entity_type,
    row.entity_id ?? '',
    row.action,
    row.description,
    row.user_id ?? '',
    row.metadata ?? '{}',
    row.ip_address ?? '',
    row.user_agent ?? '',
    row.field_diffs ?? '',
    row.created_at,
  ].join('|');
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export function hydrateActivityLogChain(db) {
  // If migration 024 hasn't been applied (fresh test DB, partial migrate
  // state), short-circuit. We detect by checking PRAGMA table_info.
  const cols = db.prepare("PRAGMA table_info(activity_log)").all().map(c => c.name);
  if (!cols.includes('entry_hash')) return;

  const unhashed = db.prepare(
    "SELECT COUNT(*) as n FROM activity_log WHERE entry_hash IS NULL"
  ).get().n;

  if (unhashed > 0) {
    // Trigger isn't installed yet (or wouldn't fire on UPDATE anyway), so
    // plain UPDATEs work for backfill. Process per-org so each chain head
    // is its own walk.
    const orgIds = db.prepare(
      "SELECT DISTINCT org_id FROM activity_log WHERE entry_hash IS NULL ORDER BY org_id"
    ).all().map(r => r.org_id);

    const selectOrgRows = db.prepare(
      "SELECT * FROM activity_log WHERE org_id = ? ORDER BY id ASC"
    );
    const updateChain = db.prepare(
      "UPDATE activity_log SET prev_hash = ?, entry_hash = ? WHERE id = ?"
    );

    const apply = db.transaction(() => {
      for (const orgId of orgIds) {
        let prev = null;
        for (const row of selectOrgRows.all(orgId)) {
          if (row.entry_hash) {
            // Already hashed (e.g. partial backfill restart) — use as
            // the chain head and continue.
            prev = row.entry_hash;
            continue;
          }
          const hash = sha256Hex(canonicalSerialize(row, prev));
          updateChain.run(prev, hash, row.id);
          prev = hash;
        }
      }
    });
    apply();
    console.log(`[activity_log] hydrated hash chain for ${unhashed} row(s)`);
  }

  installTriggers(db);
}

function installTriggers(db) {
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS activity_log_hash_chain_insert
    AFTER INSERT ON activity_log
    WHEN NEW.entry_hash IS NULL
    BEGIN
      UPDATE activity_log SET
        prev_hash = (
          SELECT entry_hash FROM activity_log
           WHERE org_id = NEW.org_id AND id < NEW.id
           ORDER BY id DESC LIMIT 1
        ),
        entry_hash = sha256_hex(
          COALESCE((SELECT entry_hash FROM activity_log
                     WHERE org_id = NEW.org_id AND id < NEW.id
                     ORDER BY id DESC LIMIT 1), '') ||
          '|' || NEW.id || '|' || NEW.org_id || '|' || NEW.entity_type ||
          '|' || COALESCE(NEW.entity_id, '') || '|' || NEW.action ||
          '|' || NEW.description || '|' || COALESCE(NEW.user_id, '') ||
          '|' || COALESCE(NEW.metadata, '{}') ||
          '|' || COALESCE(NEW.ip_address, '') ||
          '|' || COALESCE(NEW.user_agent, '') ||
          '|' || COALESCE(NEW.field_diffs, '') ||
          '|' || NEW.created_at
        )
      WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS activity_log_no_update_originals
    BEFORE UPDATE OF org_id, entity_type, entity_id, action, description,
                     user_id, metadata, ip_address, user_agent, field_diffs,
                     created_at
    ON activity_log
    BEGIN
      SELECT RAISE(ABORT, 'activity_log is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS activity_log_no_rehash
    BEFORE UPDATE OF prev_hash, entry_hash
    ON activity_log
    WHEN OLD.entry_hash IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'activity_log hash chain is immutable once written');
    END;

    CREATE TRIGGER IF NOT EXISTS activity_log_no_delete
    BEFORE DELETE ON activity_log
    BEGIN
      SELECT RAISE(ABORT, 'activity_log entries cannot be deleted');
    END;
  `);
}

export function verifyChain(db, org_id) {
  const rows = db.prepare(
    "SELECT * FROM activity_log WHERE org_id = ? ORDER BY id ASC"
  ).all(org_id);

  let expectedPrev = null;
  for (const row of rows) {
    const storedPrev = row.prev_hash ?? null;
    if (storedPrev !== expectedPrev) {
      return {
        ok: false,
        brokenAt: row.id,
        reason: 'prev_hash mismatch',
        count: rows.length,
      };
    }
    const expectedEntry = sha256Hex(canonicalSerialize(row, expectedPrev));
    if (row.entry_hash !== expectedEntry) {
      return {
        ok: false,
        brokenAt: row.id,
        reason: 'entry_hash mismatch',
        count: rows.length,
      };
    }
    expectedPrev = row.entry_hash;
  }
  return { ok: true, count: rows.length };
}
