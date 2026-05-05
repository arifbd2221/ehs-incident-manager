# EHS Incident Manager — Phase 2 Refined Plan (full-stack, hackathon demo)

## 1. Context

Phase 1 shipped (PR #1, commits `732788a` + `d319ad3`): all 17 GET endpoints return 200, mutations succeed, the existing client at `localhost:5173` integrates cleanly, and main has been merged in (auth additions + `BodyMap3D.jsx` + browser Web Speech transcription). Phase 2 adds the seven sellable demo beats locked under the hackathon-demo lens (auto-classification, STOP WORK, OSHA 300 live, anonymous + DB proof, live TRIR/DART, EHS recordability verify, voice intake) plus the structural backing they need: assets, documents, polymorphic CAPA source, work_hours, severity history, body-parts service.

**Scope revised on 2026-05-05:** frontend is now in scope. Backend-only would leave half the demo beats demoable only via curl, weakening the presentation. Each backend task gets a paired frontend task where UI is needed; both are individually shippable + testable + push-able.

This plan supersedes the earlier draft after a rigorous design pass found three issues that would have blocked execution:
- `incidents.reported_by NOT NULL` blocks the anonymous flag — needs a table rebuild bundled into migration 002.
- `capas` polymorphic source needs `investigation_id` to become nullable — also a rebuild, with explicit trigger re-attachment.
- Multer 2.x bump moves to Wave 1 (alongside Anthropic SDK install) so dependency churn is contained, not deferred to polish.

---

## 2. Demo path → wave mapping

| # | Demo beat | Wave | Backend deliverable |
|---|---|---|---|
| 1 | Auto-classification + risk matrix lights up | W3 | `services/auto_classify.js` + `risk_matrix_cells` seed + reasoning string in POST response |
| 2 | STOP WORK button + dashboard banner | W3 | `POST /incidents/stop-work`, `stop_work_status` column, no-down-route guard |
| 3 | OSHA 300 live updates on classify | W3 + W6 | `services/recordability.js` + body-parts label join (existing 300 insert keeps working) |
| 4 | Independent CAPA verifier blocked | already in Phase 1 | confirm regression in W6 smoke-test only |
| 5 | Anonymous reporting + DB row proof | W3 | `is_anonymous` column, `reported_by` nullable, activity log scrubs actor |
| 6 | Live TRIR / DART | W1 + W6 | `work_hours` table + `services/metrics.js` rewrite + 24-month seed |
| 7 | EHS recordability verification card | W3 | `POST /incidents/:id/recordability-verify` + `osha_recordable_verified_*` columns |
| 8 | AI voice intake | W5 | `POST /incidents/voice-extract` + Anthropic SDK + `voice_extractions` table |
| 9 | Trending banner ("3 prior at this asset") | W2 + W3 | assets table + `prior_incidents_count` field on POST response |
| 10 | Investigation Kanban auto-close | W4 | derived state in GET /investigations (read-time compute, no migration) |

Beats 4 and 10 require **zero new code** — both are read-time concerns surfaced via seed.

---

## 3. Sequenced waves

### W0 — Pre-flight (30 min, blocks everything)

- Verify clean `git status` against `backend` branch. Phase 1 + main merge already in place.
- `cd server && node index.js` boots without error.
- `curl localhost:3001/api/auth/sites` → 200 with sites array.
- Login as `elena@sdsmanager.com / password123` returns JWT.

### W1 — Foundation: migration runner + schema (4 hr, blocks W2/W3/W4/W5)

**Goal:** Phase 2 tables and columns applied idempotently against existing dev DBs.

**Files modified:**
- `server/db/connection.js` — call new `runMigrations(db)` after `db.exec(schema)`
- `server/db/schema.sql` — leave alone (existing `CREATE TABLE IF NOT EXISTS` stays; column additions go in migrations only)
- `server/package.json` — add `@anthropic-ai/sdk`, bump `multer` to `^2.0.0` here so dependency churn lands once

**Files created:**
- `server/db/migrate.js` — runs every `.sql` file in `migrations/` lexically; tracks applied set in `_schema_migrations(name TEXT PRIMARY KEY, applied_at TEXT)`; each file wrapped in `db.transaction`, skipped if already applied.
- `server/db/migrations/001_phase2_tables.sql` — new tables: `assets`, `documents`, `entity_links`, `work_hours`, `risk_matrix_cells`, `severity_history`, `regulatory_certifications`, `regulatory_submissions`, `voice_extractions`. Indexes on `entity_links(source_type, source_id)` and `(target_type, target_id)`. INSERT 25 risk-matrix rows.
- `server/db/migrations/002_incident_columns.sql` — column adds: `is_anonymous`, `is_imminent_danger`, `stop_work_status`, `body_parts_affected`, `asset_id`, `voice_extraction_id`, `osha_recordable_verified_by`, `osha_recordable_verified_at`. **PLUS table rebuild** to relax `reported_by NOT NULL` (SQLite cannot drop NOT NULL via ALTER): `PRAGMA foreign_keys=OFF; CREATE TABLE incidents_new ...; INSERT...SELECT; DROP old; RENAME; recreate indexes; PRAGMA foreign_keys=ON`. Wrap in transaction with row-count assertion.
- `server/db/migrations/003_capa_polymorphic.sql` — `ALTER TABLE capas ADD source_type TEXT NOT NULL DEFAULT 'investigation'`, `ADD incident_id INTEGER`. Then table rebuild to relax `investigation_id NOT NULL` and add CHECK constraint that exactly one of `(investigation_id, incident_id)` is set per `source_type`. Re-attach Phase 1 owner≠verifier triggers explicitly. Single rebuild, single transaction.

**Acceptance:**
- `node db/migrate.js` against the populated dev DB completes without losing rows (`SELECT COUNT(*) FROM incidents` matches pre-migration).
- Re-running is a no-op (skip-on-applied).
- `SELECT COUNT(*) FROM risk_matrix_cells` returns 25.
- All 17 Phase 1 GET endpoints still 200.
- `SELECT source_type FROM capas` returns `'investigation'` for all existing rows.
- Phase 1 attachment upload endpoint still works after multer 2.x bump.

**Time:** 4 hr. **Blockers:** W0 only.

### W2 — Site + Asset + Document modules + EntityLink (5 hr, parallelizable with W4)

**Goal:** sites, assets, and documents are CRUD-able and linkable to anything via `entity_links`.

**Files modified:**
- `server/index.js` — mount `/api/sites`, `/api/assets`, `/api/documents`, `/api/links`
- `server/services/numbering.js` — add `nextAssetNumber()`, `nextDocumentNumber()` (`AST-YYYY-NNNNN`, `DOC-YYYY-NNNNN`)

**Files created:**
- `server/routes/sites.js` — full CRUD. `GET /api/auth/sites` and `GET /api/users/sites` already exist for read-only; this adds POST/PATCH/DELETE under `/api/sites` for elevated roles only. **NEW per user direction.**
- `server/routes/assets.js` — GET list (filters: site_id, asset_type, active, q), GET :id (joins linked incidents + documents via entity_links), POST, PATCH, DELETE (soft, set active=0)
- `server/routes/documents.js` — same shape; POST is multipart with `upload.single('file')` from existing middleware (multer 2.x)
- `server/routes/links.js` — POST/DELETE/GET; helpers exported via `services/entity_links.js`
- `server/services/entity_links.js` — `link({source_type, source_id, target_type, target_id, link_role, created_by})`, `unlink(id)`, `listLinks({source_type, source_id})`, `incidentsForAsset(assetId)`

**Acceptance:**
- POST /api/sites as ehs_manager creates a new site; as worker returns 403.
- POST /api/assets creates row, returns display_id.
- POST /api/links {source_type:'asset', target_type:'incident', ...} creates row.
- GET /api/assets/:id includes `linked_incidents: [...]`.
- POST /api/documents (multipart, 1MB PDF) returns 201 with file_url.

**Time:** 5 hr (was 4 hr; +1 hr for Site CRUD). **Blockers:** W1.

### W3 — Incident extensions (recordability, classification, stop-work, anonymous, body-parts, trending) (6-8 hr, critical path)

**Goal:** the bulk of the visible demo beats.

**Files modified:**
- `server/routes/incidents.js` — POST accepts `is_anonymous`, `body_parts_affected` (flat array), `asset_id`; null `reported_by` when anonymous; new endpoints `POST /stop-work`, `POST /:id/stop-work-acknowledge|resolve|cancel`, `POST /:id/recordability-verify`; POST response includes `prior_incidents_count`.
- `server/services/regulatory.js` — leave a thin shim re-exporting from new files so existing callers don't break mid-wave.
- `server/services/classification.js` — keep existing exports as a back-compat shim while new auto_classify.js is wired in.

**Files created:**
- `server/services/recordability.js` — reporter-form path returns `{recordable, type, requires_ehs_verification: bool}`; `verifyOshaRecordability(...)` runs the 5-gate full decision.
- `server/services/riddor.js` — moves `determineRiddorReportability` and `calculateDeadline` out of `regulatory.js` unchanged.
- `server/services/auto_classify.js` — replaces `classification.js`. Takes `{type, type_data, body_parts_affected, site_id, asset_id, description}`; returns `{suggested_likelihood, suggested_consequence, suggested_severity, suggested_track, reasoning}`. Triggers: treatment beyond first aid → at least Moderate; days away > 0 → at least Major; hospitalization/amputation/fatality → Catastrophic; any region in `SPECIFIED_INJURY_REGIONS` → at least Major; reportable-quantity spill → at least Major; type=dangerous → Likely/Catastrophic; type=observation → cap at Track C unless escalated. Likelihood inference from prior-incident count at asset/site+area: 3+ → Possible+, 5+ → Likely+, 10+ → Almost Certain.
- `server/services/body_parts.js` — exports `PART_LABELS` (mirrors BodyMap3D.jsx — 30 region IDs → human labels), `SPECIFIED_INJURY_REGIONS = new Set(['head','face','upper_back','lower_back'])`, `formatForOsha300ColumnE(regionIds[])`. Header documents the eye/internal gap deferred.

**Stop-work guard:** in PATCH /incidents/:id, if existing row has `stop_work_status='active'` AND request would lower `severity` or change `track` away from 'A', return 409. Also enforce in POST /:id/escalate.

**Anonymous logic:** when POST receives `is_anonymous: true`, set `reported_by = NULL` (column was NOT NULL — relaxed in migration 002). Activity log uses `user_id = NULL` and description "Anonymous reporter submitted INC-...".

**Acceptance:**
- POST /incidents with `is_anonymous:true` writes `reported_by IS NULL`.
- POST /incidents with treatment=Medical and 2 days away → response `severity ≤ 3`, non-empty `reasoning`.
- POST /incidents with `body_parts_affected:['upper_back']` → response severity ≤ 3 (specified-injury bump).
- POST /stop-work creates incident with severity=1, track='A', is_imminent_danger=1, stop_work_status='active'; subsequent PATCH attempting `track='C'` returns 409.
- POST /incidents response includes `prior_incidents_count`.
- POST /incidents/:id/recordability-verify as ehs_manager sets `osha_recordable_verified_by`; as worker returns 403.

**Time:** 6-8 hr. **Blockers:** W1; landing after W2 is preferred so `asset_id` has an FK target with seed data.

### W4 — CAPA polymorphic source (2 hr, parallelizable with W3)

**Goal:** CAPA can originate from incident or be proactive.

**Files modified:**
- `server/routes/capas.js` — add `POST /` accepting `{source_type, investigation_id?, incident_id?, ...}`; route validation matches DB CHECK.
- `server/routes/incidents.js` — add `POST /:id/create-capa` (sets source_type='incident', incident_id=:id).
- `server/routes/investigations.js` — adapt assign-capa to write `source_type='investigation'` explicitly (one-line change).

**Acceptance:**
- POST /api/capas `{source_type:'proactive'}` with both ids null → 201.
- POST /api/capas `{source_type:'incident', incident_id:5}` → 201.
- POST /api/capas `{source_type:'incident', investigation_id:5}` → 400 (mismatch).
- POST /api/incidents/5/create-capa → 201, capa row has source_type='incident' and incident_id=5.
- Existing POST /api/investigations/:id/assign-capa still 201 with source_type='investigation'.

**Time:** 2 hr. **Blockers:** W1.

### W5 — Voice intake (3 hr, parallelizable with W3/W4 if Anthropic key available)

**Goal:** transcript text → structured fields with reasoning.

**Voice handling: browser-side only.** The frontend captures speech via Web Speech API and sends pre-transcribed text to the backend. Backend never sees audio. Endpoint accepts `{transcript: string}`. This is simpler than originally planned (no Whisper, no audio streaming, no media-type handling) — confirmed by user direction.

**Files modified:**
- `server/routes/incidents.js` — add `POST /voice-extract` route (no `:id` — pre-incident).
- `.env.example` — add `ANTHROPIC_API_KEY=`.

**Files created:**
- `server/services/voice_extract.js` — Anthropic SDK with tool-use, low-temp; system prompt anchored on the 8 incident types + the 30 BodyMap3D region IDs. Returns `{extraction_id, extracted_fields, suggested_followups, missing_required, transcript_hash}`. Transcript text **not stored** — only hash.

**Asset fuzzy match:** case-insensitive substring against `assets.name` for the user's org_id.

**Acceptance:**
- POST /voice-extract with `{transcript:"cut my left hand at press 4"}` returns `body_parts_affected:["l_hand"]` and matching `asset_id`.
- voice_extractions row exists with the hash, no transcript_text stored.
- Missing API key: endpoint returns 503 with `{error:"Voice intake unavailable — ANTHROPIC_API_KEY not configured"}`. Other endpoints unaffected.

**Time:** 4 hr. **Blockers:** W1. **Risk:** no Anthropic key → demo this beat with a seeded `voice_extractions` row + activity log; fallback documented.

### W6 — Polish + demo seed (4-6 hr, blocked by W1-W5)

**Goal:** seed makes the dashboard look alive on first paint; deferred Phase 1 fixes land.

**Files modified:**
- `server/db/seed.js` — full rewrite. Drop the `if (exists > 0) skip` gate to `if (process.env.SEED_FORCE)` so re-seeding works without rm.
- `server/middleware/errorHandler.js` — FK error scrubbing.
- `server/routes/incidents.js` — OSHA 300 `injury_type` granularity using body-parts service for column E.

**Seed contents (matches demo path order):**
- 3 sites: Cleveland (US, NAICS 325199), Sheffield (UK), Dallas (US — 14-month edge case).
- 5 users (current 5-role schema retained for demo; Phase 3 collapses): Elena, Marcus, James, Mehta, Wendy-Worker.
- 18 assets across sites: Press 4, Forklift FL-3, CNC-7, Solvent-Storage-A, Bench Grinder #4, etc.
- 8 documents: SDS for IPA, equipment manuals, policies.
- 24 months `work_hours` per site with edge cases (most-recent-month-missing for Sheffield, anomalous Cleveland month, Dallas 14-month online).
- 13 incidents covering all 8 types and all 3 tracks, including:
  - 1 active stop-work (red banner on first paint)
  - 1 anonymous near-miss (`reported_by NULL`)
  - 1 voice-intake-assisted (linked to a voice_extractions row + activity log entry)
  - The chemical-splash already in seed → enriched with EHS verification + body_parts_affected=['r_forearm']
  - 3 incidents at same asset (Press 4) for the trending demo
  - 1 active OSHA 24-hr banner, 1 active RIDDOR phone banner
- Investigations + 5-Why + CAPA mix (investigation/incident/proactive sources).
- 1 signed 300A annual cert for Cleveland 2025.

**Acceptance:**
- `rm db/incident_management.db && node db/seed.js && node index.js` boots clean.
- GET /api/dashboard returns TRIR > 0, DART > 0, an active stop-work indicator, an active regulatory deadline.
- GET /api/incidents includes the anonymous incident with reporter_name as "Anonymous" (COALESCE in SELECT).
- All 10 demo beats visible via curl scripts before any UI work.

**Time:** 4-6 hr. **Blockers:** W1-W5.

---

## 4. Critical path + parallelization

```
W0 ──> W1 ──┬──> W2 ──┐
            │         ├──> W6
            ├──> W3 ──┤
            ├──> W4 ──┤
            └──> W5 ──┘
```

- **Critical path:** W0 → W1 → W3 → W6 (~16-20 hr).
- **Parallel:** W2, W4, W5 can run concurrently with W3 once W1 lands. W4 is small (2 hr) — slot into W3's idle moments.
- W3 should land before W6 because the seed wants to exercise stop-work, anonymous, body-map.
- W5 can be deferred latest — fallback exists if Anthropic key missing.

---

## 5. Minimum viable demo cut (drop order if time runs out)

If running short, drop in this order — **each cut still leaves a coherent demo:**

1. **Drop W5** (voice intake) — fall back to seeded `voice_extractions` row + screenshot. Saves 4 hr, loses 1 of 10 beats.
2. **Drop W4** — keep CAPA-from-investigation only. Loses "proactive CAPA" demo, kanban auto-close still works. Saves 2 hr.
3. **Drop W2 documents only** (keep assets) — assets are needed for trending + auto-classify; documents are visual filler. Saves ~2 hr.
4. **Trim W6 seed scope** — drop Dallas + Sheffield-missing-month edges; keep Cleveland fully populated. Saves ~1.5 hr.

**Hard floor for a coherent demo:** W0 + W1 + W3 + minimal W6 seed. Preserves auto-classification, STOP WORK, anonymous + DB proof, OSHA 300 live, recordability verification, trending banner, TRIR/DART. ~14-16 hr.

---

## 6. Risks and mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | `incidents.reported_by NOT NULL` blocks anonymous flag | Certain | Hard block on demo beat 5 | Bundle table rebuild into migration 002. Test on populated copy first. |
| 2 | CAPA polymorphic CHECK + nullable investigation_id rebuild — risk of FK or trigger loss | Medium | Lose CAPA history if mishandled | Migration 003 wraps in transaction, re-creates owner≠verifier triggers explicitly, asserts row count. |
| 3 | Multer 2.x breaking change (ESM import paths, `req.file` shape) | Medium | W2 doc upload breaks | Land bump in W1. Keep curl test for `/api/attachments/upload` as W1 acceptance gate. |
| 4 | No Anthropic key on demo machine | Medium | W5 beat unfireable | Seed a `voice_extractions` row tied to one incident; demo says "ran earlier on a real key, here's the activity log." Endpoint returns 503 with clean message. |
| 5 | WAL/journal contention during dense seed | Low | Boot crashes after seed | Wrap seed in `db.transaction(() => { ... })()`; call `db.pragma('wal_checkpoint(FULL)')` before exit. |
| 6 | Frontend lacks UI for half of W2/W3 endpoints | Certain | Half of beats need API-only proof (curl/Postman) | Demo path mixes UI beats (TRIR/DART, OSHA 300, kanban, trending banner once UI added) with backend-proof beats (anonymous DB row, voice extraction JSON, recordability JSON). |
| 7 | LLM token cost / latency on voice extract (~3-5s) | Low | Demo stalls | Pre-warm by calling endpoint once before demo opens. |

---

## 7. Migration strategy

**Append-only migration files + applied-set tracking.**

- `schema.sql` already uses `CREATE TABLE IF NOT EXISTS` — leave as bootstrap for fresh DBs.
- Add `_schema_migrations(name PRIMARY KEY, applied_at)`. `runMigrations(db)` reads migrations dir, skips files already in the table, applies the rest inside `db.transaction(() => db.exec(sql))`.
- **Never wipe-and-reseed in dev** — demo machine has uploaded attachments in `server/uploads/`.
- **Two structural rebuilds on populated tables:**
  - Migration 002 (relax `incidents.reported_by NOT NULL` + column adds)
  - Migration 003 (`capas` polymorphic source + relax `investigation_id NOT NULL`)
- Both follow SQLite-recommended 12-step rebuild: `PRAGMA foreign_keys=OFF; CREATE new; INSERT...SELECT; DROP old; ALTER RENAME; recreate triggers + indexes; PRAGMA foreign_keys=ON`. Wrap each in single transaction.
- Migrations 001 and any future additive ones are pure additive (new tables, indexes, INSERTs).
- Idempotency: applied table is single source of truth. Final statement of each migration `INSERT INTO _schema_migrations`. If any statement fails, transaction rolls back, file isn't marked applied.
- **Fresh-DB path:** `node db/migrate.js` runs after `db.exec(schema)`. On a fresh DB, schema.sql creates original tables; then 002/003 will rebuild them. Wasteful but consistent. Phase 3 cleanup can fold migrations back into schema.sql.

---

## 8. Frontend tasks (now in scope)

Each frontend task is paired with the backend task that delivers its API. They land in the same commit-push cycle so demo beats are fully demoable as each wave completes.

| FE task | Pairs with | UI work | Files (new/modified) |
|---|---|---|---|
| **F2.1** Sites admin page | T2.1 | List + create/edit/delete Sites; nav link under Settings | new `pages/admin/Sites.jsx` + `api/sites.js`; modify `Sidebar.jsx` |
| **F2.2** Assets module | T2.2 | List + detail + create/edit pages; nav link in sidebar | new `pages/assets/AssetsList.jsx`, `AssetDetail.jsx`, `AssetForm.jsx` + `api/assets.js`; modify `Sidebar.jsx`, `App.jsx` (routing) |
| **F2.3** Asset cascade in wizard | T2.3 | Site → Area → Asset cascade dropdowns in Step 1, replacing `specific_location` free text | modify `pages/wizard/ReportWizard.jsx` (Step 1 fields) |
| **F2.4** Documents library | T2.4 | List + upload modal page; nav link | new `pages/documents/DocumentsList.jsx`, `DocumentUpload.jsx` + `api/documents.js`; modify `Sidebar.jsx`, `App.jsx` |
| **F2.5** Document linking on investigation | T2.4 | Investigation detail evidence section gains "Link existing document" + "Upload new" actions; uses EntityLink | modify `pages/investigations/InvestigationDetail.jsx` |
| **F3.1** Body map wiring | T3.2 | Inject `BodyMap3D` component into `InjuryForm`; flat array goes into wizard form state and POST body | modify `pages/wizard/types/InjuryForm.jsx` (replace string-array body_parts handler with `BodyMap3D` selection) |
| **F3.2** Anonymous toggle | T3.2 | Toggle on Step 1 (disabled for injury/illness types); when on, hide reporter identity preview | modify `pages/wizard/ReportWizard.jsx` (Step 1) |
| **F3.3** Stop-work UI | T3.3 | Red STOP WORK button in TopBar (always visible); single-step submission modal; active stop-work banner on Dashboard | modify `components/layout/TopBar.jsx`, `pages/Dashboard.jsx`; new `components/modals/StopWorkModal.jsx` |
| **F3.4** Trending banner | T3.2 | Wizard Step 2 reads `prior_incidents_count` from POST preview / classify response; displays "3 prior incidents on Press 4 in last 90 days" | modify `pages/wizard/ReportWizard.jsx` (Step 2 panel) |
| **F3.5** EHS recordability verification card | T3.4 | New card on `IncidentDetail.jsx` for elevated roles only; calls `POST /incidents/:id/recordability-verify`; surfaces 5-gate decision JSON | modify `pages/incidents/IncidentDetail.jsx`; new `components/incidents/RecordabilityVerifyCard.jsx` |
| **F4.1** Standalone CAPA creation | T4.1 | "+ New CAPA" button on CAPA list page with source picker (proactive / from incident); modal collects source-specific fields | modify `pages/capas/CapasList.jsx`, `api/capas.js` (add `createCapa`); new `components/modals/NewCapaModal.jsx` |
| **F5.1** Voice intake confirmation flow | T5.2 | Existing Web Speech API integration (already in `ReportWizard.jsx` from main commit `5326a85`) wires to `POST /voice-extract`; received fields appear with "✨ AI suggested" badge until confirmed | modify `pages/wizard/ReportWizard.jsx`; new `components/wizard/AiSuggestedField.jsx` (lightweight wrapper) |
| **F6.1** 300A sign-off | T6.1 | Reports page: button next to 300A summary; modal with affirmation text + typed-name input | modify `pages/reports/Reports.jsx` (or wherever 300A lives); new `components/modals/CertifyAnnualSummaryModal.jsx` |

**Frontend conventions (existing repo):**
- React 18, React Router v6, Axios, hand-rolled CSS in `client/src/styles/*.css`.
- API modules under `client/src/api/*.js` mirror backend route names; use the existing `client.js` axios instance (auto-attaches Bearer token).
- Per-feature CSS file (e.g. `assets.css`, `documents.css`) imported from the page component.
- No external UI lib — match the existing card/button/badge classes from `styles/styles.css`.

**Frontend total estimate:** ~16-19 hr. Combined full-stack effort: **~40-45 hr.**

---

## Critical files for implementation

- `server/db/connection.js` — call migration runner on boot
- `server/db/migrate.js` — new, applied-set tracker
- `server/routes/incidents.js` — heaviest modifications (W3 + W4)
- `server/services/auto_classify.js` — replaces `classification.js` (W3)
- `server/services/recordability.js` — new (W3)
- `server/services/body_parts.js` — new (W3)
- `server/services/voice_extract.js` — new (W5)
- `server/db/seed.js` — full rewrite (W6)

## Verification

After each wave:
1. `cd server && rm -f db/incident_management.db && node db/seed.js` — clean reseed.
2. `node index.js` — boots without errors.
3. Run wave-specific smoke test (curl scripts).
4. Open `http://localhost:5173/`, log in as `elena@sdsmanager.com / password123`, verify dashboard, incidents list, investigation detail, CAPA list load without console errors.
5. Run *demo path walkthrough* manually (final, after W6).

**Final demo readiness check:**
- All 10 demo beats visible and functional.
- TRIR/DART numbers plausible.
- Active stop-work + active regulatory banner on first paint.
- Voice intake works end-to-end against an Anthropic key (or seeded fallback).
- No 500 errors in server log during 10-minute demo walkthrough.

---

## 9. Small-task breakdown (test-commit-push pattern)

Per user direction: each task is individually shippable, individually testable, gets its own commit + push to `origin/backend`. Don't batch waves into giant commits — small steps catch mistakes fast. Frontend (`F`) and backend (`T`) tasks ordered so each demo beat is **fully working** when its row is checked off.

| # | Wave | Task | Stack | Acceptance check before commit | ~Time |
|---|---|---|---|---|---|
| **T1.1** | W1 | Migration runner + `_schema_migrations` table + `connection.js` hook | BE | Empty migrations dir is no-op on boot; re-runs are no-ops | 45 min |
| **T1.2** | W1 | Bump multer to 2.x + install `@anthropic-ai/sdk` (no usage yet) | BE | `POST /api/attachments` upload still works | 30 min |
| **T1.3** | W1 | Migration 001: new tables + risk_matrix seed (additive only) | BE | 9 new tables exist; `risk_matrix_cells` has 25 rows; all GETs still 200 | 1 hr |
| **T1.4** | W1 | Migration 002: incident column adds + `reported_by` rebuild | BE | Row count preserved; INSERT with `reported_by=NULL` succeeds | 1 hr |
| **T1.5** | W1 | Migration 003: capa polymorphic + `investigation_id` rebuild + CHECK constraint | BE | Existing CAPAs have `source_type='investigation'`; mismatched insert errors | 1 hr |
| **T2.1** | W2 | Site CRUD (`POST/PATCH/DELETE /api/sites`) | BE | ehs_manager creates/edits/soft-deletes; worker 403; existing read endpoints unchanged | 1 hr |
| **F2.1** | W2 | Sites admin page + `api/sites.js` + Sidebar nav | FE | Browse to /admin/sites, create site, see it in dropdown elsewhere | 1.5 hr |
| **T2.2** | W2 | Asset CRUD (no linking yet) | BE | 5 verbs; soft-delete sets `active=0`; numbering works | 1 hr |
| **F2.2** | W2 | Assets module pages + nav link + routing | FE | Navigate to /assets, create one, see in list, open detail | 2 hr |
| **T2.3** | W2 | EntityLink endpoints + `services/entity_links.js` + asset detail enrichment | BE | Link asset↔incident; GET asset detail includes `linked_incidents` array | 1 hr |
| **F2.3** | W2 | Asset cascade in wizard (Site→Area→Asset, drop `specific_location`) | FE | Wizard Step 1 picks asset from dropdown; submits with `asset_id` | 1 hr |
| **T2.4** | W2 | Document module (CRUD + multipart upload + linking) | BE | Upload PDF, link to investigation, GET investigation includes linked docs | 1 hr |
| **F2.4** | W2 | Documents library page + upload modal + nav link | FE | Browse to /documents, upload PDF, see in list, open detail | 1.5 hr |
| **F2.5** | W2 | Document linking on investigation evidence | FE | On investigation detail, link existing doc + upload new — both appear in evidence list | 1 hr |
| **T3.1** | W3 | Service foundations: `body_parts.js` + recordability/riddor split + `auto_classify.js` | BE | Unit-style: import + invoke each, returns expected shape | 1.5 hr |
| **T3.2** | W3 | `incidents.js` POST extends: `body_parts_affected`, `asset_id`, `is_anonymous`, `prior_incidents_count` | BE | Anonymous → `reported_by NULL`; body parts stored; prior count returned | 1.5 hr |
| **F3.1** | W3 | Body map wiring in `InjuryForm` (use existing `BodyMap3D` component) | FE | Click region → form state has `["l_hand"]` → submit lands in DB | 1 hr |
| **F3.2** | W3 | Anonymous toggle in wizard Step 1 | FE | Toggle on → submit → DB row has `reported_by NULL` and "Anonymous" appears in list | 30 min |
| **F3.4** | W3 | Trending banner on wizard Step 2 (uses prior_incidents_count) | FE | Pick same asset twice → second submission shows "1 prior incident on X in last 90 days" | 1 hr |
| **T3.3** | W3 | Stop-work endpoints + state machine + down-route guard | BE | Create stop-work; PATCH `track='C'` returns 409; resolve transitions | 1.5 hr |
| **F3.3** | W3 | STOP WORK button (TopBar) + active dashboard banner | FE | Click button, fill form, submit → red banner appears on Dashboard until resolved | 1.5 hr |
| **T3.4** | W3 | `POST /incidents/:id/recordability-verify` (5-gate) | BE | ehs_manager verifies; `osha_recordable_verified_*` populated; worker 403 | 1 hr |
| **F3.5** | W3 | EHS recordability verification card on incident detail | FE | Card visible to ehs_manager only; submitting writes verification + reloads detail | 1.5 hr |
| **T4.1** | W4 | CAPA polymorphic: `POST /capas` + `POST /incidents/:id/create-capa` + assign-capa source_type | BE | All 3 paths; CHECK enforces shape mismatches | 1.5 hr |
| **F4.1** | W4 | "+ New CAPA" with source picker on CAPA list | FE | Modal: pick proactive or from-incident, submit, new CAPA appears in list | 1.5 hr |
| **T5.1** | W5 | `services/voice_extract.js` (Anthropic SDK + tool-use schema) | BE | Synthetic transcript → expected JSON in unit test | 1.5 hr |
| **T5.2** | W5 | `POST /incidents/voice-extract` endpoint + `voice_extractions` write + activity log | BE | End-to-end: text in → structured fields out → hash stored | 1 hr |
| **F5.1** | W5 | Voice intake confirmation flow (already-shipped speech recognition wires to backend) | FE | Speak → transcript appears → backend extracts → fields show "✨ AI suggested" badge → confirm/edit | 1.5 hr |
| **T6.1** | W6 | Hygiene: multer 2.x cleanup pass + OSHA 300 `injury_type` granularity + FK error scrubbing | BE | No regression; 300 log column F has real type per case | 1 hr |
| **T6.2** | W6 | Demo seed Part 1: sites, assets, documents, work_hours, users, risk_matrix | BE | Boot clean; dashboard TRIR/DART plausible; assets visible | 2 hr |
| **T6.3** | W6 | Demo seed Part 2: incidents (all types + flags), investigations, CAPAs (mixed source), regulatory submissions, activity log, voice extraction row | BE | All 10 demo beats walkthroughable via curl | 2 hr |
| **F6.1** | W6 | 300A sign-off button on Reports page | FE | Button + modal with typed-name affirmation; submission writes `regulatory_certifications` row | 1 hr |
| **F6.2** | W6 | End-to-end demo path walkthrough in browser | FE | All 10 demo beats demonstrable via UI in <15 min | 1 hr |

**Total: 32 tasks (19 BE + 13 FE), ~38-43 hr.** Each task ends with: test in-context → `git commit` → `git push origin backend` → tick checkbox → start next.

**Per-task discipline:**
- Branch stays `backend` throughout — small commits on the same branch, all attached to PR #1 (or split into per-wave PRs if user prefers).
- After each commit, manually exercise the new endpoint or flow against `localhost:5173` if there's existing UI; otherwise curl proof.
- If a task introduces a regression to a Phase 1 acceptance criterion, **stop and fix before moving on.** Don't accumulate broken state.
- If a task takes 2x its estimate, pause and ask the user before continuing — usually means the task should have been split smaller.
