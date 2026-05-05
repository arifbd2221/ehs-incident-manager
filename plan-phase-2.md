# EHS Incident Manager — Phase 2 Implementation Plan

## Context

The current backend (Node + Express + better-sqlite3) is a working baseline after Phase 1 fixes — all 17 GET endpoints return 200, mutations succeed, the existing client at `localhost:5173` integrates cleanly. Phase 2 implements the locked PRD addenda we agreed across the design discussion: AI voice intake, hybrid OSHA recordability, auto-classification, anonymous + stop-work flows, asset & document modules, CAPA polymorphic source, and a polished demo seed.

This is being built for a 15-minute hackathon demo. The plan applies the hackathon-demo lens: prefer **sellable + visible** over **complete + correct on invisible features**. Several locked items are explicitly deferred to a post-demo Phase 3 (listed at the end).

Backend-only — `client/` is not edited (per user direction). Frontend gaps are flagged at the end so the user knows what UI work will be required after.

---

## Pre-flight (before any Phase 2 code)

1. **Pull `git main`** in `project/ehs-incident-manager/`. Phase 1 changes (severity audit, attachment scoping, etc.) are local-only — check whether main has diverged. If main has new commits, rebase / merge with awareness of the 5 backend files Phase 1 touched: `server/index.js`, `server/db/schema.sql`, `server/routes/incidents.js`, `server/routes/notifications.js`, `server/routes/attachments.js`, plus `.env.example`.
2. **Verify build still works** post-pull: reinstall if `package.json` changed (with `TMPDIR=/tmp/claude-build/npm-tmp` override per env memory), reseed, boot server, smoke-test GETs. If any regression, surface and stop before proceeding.
3. **Mirror this plan** to `project/ehs-incident-manager/plan-phase-2.md` so it's checked into the repo alongside the work.

---

## Architecture changes overview

| Area | Change |
|---|---|
| **Schema** | Add 8 new tables; add columns to `incidents`, `capas`. SQLite migration runner (better-sqlite3 has none). |
| **Roles** | Keep 5-role schema for demo. Defer 3-role collapse to Phase 3. |
| **Polymorphic linking** | New `entity_links` table; helper service. |
| **State machines** | Severity-history table; reopen + override authority gating. Investigation Kanban-close derived. |
| **OSHA logic** | Rewrite `services/regulatory.js` recordability into hybrid (reporter simplified, EHS verification). |
| **Classification** | Rewrite `services/classification.js` with rule-based inference using prior wizard fields + asset history. |
| **AI** | New `services/voice_extract.js` using Anthropic SDK. New endpoint `POST /api/incidents/voice-extract`. |
| **CAPA** | Polymorphic source (investigation / incident / proactive). New `POST /api/capas`. |

---

## Wave 1 — Foundation (do first, blocks everything)

**Files:**
- New: `server/db/migrate.js` (migration runner)
- New: `server/db/migrations/001_phase2_schema.sql`
- Modify: `server/db/connection.js` (call migrate on boot)

**New tables:**
```sql
-- assets — equipment/location register, linkable to anything via entity_links
assets (id, org_id, site_id, name, asset_type, location_description, serial_number, active, created_at, updated_at)
asset_type enum: machine, vehicle, building, area, tool, chemical, other

-- documents — standalone library, linkable to anything
documents (id, org_id, name, document_type, file_url, uploaded_by, uploaded_at)
document_type enum: sds, manual, policy, photo, video, log, certificate, other

-- entity_links — polymorphic many-to-many
entity_links (id, source_type, source_id, target_type, target_id, link_role, created_at, created_by)
INDEX on (source_type, source_id) and (target_type, target_id)

-- work_hours — TRIR/DART denominator per site per period
work_hours (id, site_id, period_start, period_end, hours_worked, avg_employees, entered_by, entered_at, notes)
UNIQUE (site_id, period_start)

-- risk_matrix_cells — 5x5 standard matrix as data
risk_matrix_cells (likelihood, consequence, severity, level_label)
PRIMARY KEY (likelihood, consequence)

-- severity_history — append-only override log
severity_history (id, incident_id, from_severity, to_severity, from_track, to_track, actor_user_id, reason, created_at)

-- regulatory_certifications — 300A typed-name attestations (lean)
regulatory_certifications (id, type, site_id, period_year, certifier_user_id, certifier_title, affirmation_text, signed_at)

-- regulatory_submissions — actual submission records (HSE/OSHA reference numbers)
regulatory_submissions (id, type, incident_id, certification_id, submission_method, external_reference_number, submitted_at, submitted_by)
```

**Column additions on existing tables:**
```sql
incidents:
  + is_anonymous INTEGER DEFAULT 0
  + is_imminent_danger INTEGER DEFAULT 0
  + stop_work_status TEXT  -- active, acknowledged, resolved, cancelled
  + body_parts_affected TEXT DEFAULT '[]'  -- JSON flat array of region IDs from BodyMap3D, e.g. ["l_hand","r_forearm"]
  + asset_id INTEGER REFERENCES assets(id)
  + voice_extraction_id INTEGER  -- links to a voice_extractions row if AI-assisted

capas:
  + source_type TEXT NOT NULL DEFAULT 'investigation'  -- investigation, incident, proactive
  + incident_id INTEGER REFERENCES incidents(id)
  + CHECK constraint: exactly one source matches source_type
```

**Backfill:** existing CAPAs get `source_type = 'investigation'`.

**Risk matrix seed:**
```sql
INSERT into risk_matrix_cells values (per PRD §8 — 25 rows)
```

**Tests after Wave 1:**
- Migration runs idempotently on existing DB (no data loss).
- `node db/seed.js` succeeds against fresh schema.
- All Phase 1 GET endpoints still return 200.
- New tables exist; risk_matrix_cells has 25 rows.

---

## Wave 2 — Asset + Document modules

**Files:**
- New: `server/routes/assets.js`
- New: `server/routes/documents.js`
- New: `server/services/entity_links.js`
- New: `server/services/numbering.js` additions: `nextAssetNumber()`, `nextDocumentNumber()`
- Modify: `server/index.js` (mount new routes)

**Endpoints:**

```
# Assets
GET    /api/assets                       — list (filters: site_id, asset_type, active, q)
GET    /api/assets/:id                   — detail (includes linked incidents + documents)
POST   /api/assets                       — create
PATCH  /api/assets/:id                   — update
DELETE /api/assets/:id                   — soft-delete (set active=0)

# Documents
GET    /api/documents                    — list (filters: document_type, q)
GET    /api/documents/:id                — detail (includes linked entities)
POST   /api/documents                    — upload (multipart) + create
PATCH  /api/documents/:id                — update metadata
DELETE /api/documents/:id                — soft-delete

# EntityLink helpers (used internally + via these routes)
POST   /api/links                        — create link {source_type, source_id, target_type, target_id, link_role}
DELETE /api/links/:id                    — remove link
GET    /api/links?source_type=X&source_id=Y    — list links for a source
```

**Permissions:** elevated roles (supervisor, ehs_officer, ehs_manager, admin) can create/edit assets + documents. Worker can view only.

**Reuse:** existing multer config (`middleware/upload.js`) for document uploads. Existing `attachments` table stays as-is (used for incident/investigation/capa file attachments). New `documents` table is for the standalone library — different concept.

**Tests:** create asset, link to incident via /api/links, fetch /api/assets/:id and confirm linked incidents appear; same for documents.

---

## Wave 3 — Incident extensions

**Files:**
- Rewrite: `server/services/regulatory.js` → split into `services/recordability.js` (OSHA hybrid) + `services/riddor.js` (RIDDOR detection unchanged)
- Rewrite: `server/services/classification.js` (auto-classification with rule-based inference)
- Modify: `server/routes/incidents.js` (anonymous flag, stop-work, body-map JSON, trending banner data, asset_id linkage)

**Hybrid OSHA recordability** (`services/recordability.js`):
- **Reporter-form path:** simplified — work-related y/n + treatment selector (first-aid grouped at top) + privacy-case toggle. Returns `{recordable, type, requires_ehs_verification: true|false}`.
- **EHS verification path:** full 5-gate decision tree (covered worker / work-related / new case / general criterion / treatment). Endpoint: `POST /api/incidents/:id/recordability-verify` (elevated role only). Sets `osha_recordable_verified_by` + `osha_recordable_verified_at`.
- First-aid list as code constant (per OSHA 1904.7 fixed enumeration).
- Privacy case flag suppresses name on 300 Log render and exports.

**Auto-classification** (`services/classification.js`):
- Rule-based inference function: takes `{type, type_data, body_parts_affected, site_id, asset_id, description}` and prior-incident count at this asset/location → returns `{suggested_likelihood, suggested_consequence, suggested_severity, suggested_track, reasoning: string}`.
- Triggers: treatment beyond first aid → at least Moderate; days away > 0 → at least Major; hospitalization/amputation/fatality → Catastrophic; **any region in `SPECIFIED_INJURY_REGIONS` (head, face, upper_back, lower_back) selected → at least Major**; reportable-quantity spill → at least Major; type=dangerous → Likely/Catastrophic; type=observation → cap at Track C unless escalated.
- Likelihood inference: count of incidents at same `asset_id` (or site+area fallback) in last 12 months → maps to band. 3+ in 12 months → Possible+. 5+ → Likely+. 10+ → Almost Certain.
- Reasoning string: human-readable, e.g. *"Major consequence: medical treatment + 2 days away. Likely: third near-miss this quarter at Sheffield Site."*

**Body-parts service** (`services/body_parts.js`, NEW):
- Mirrors `PART_LABELS` from `client/src/components/shared/BodyMap3D.jsx` — 30 region IDs → human labels (e.g. `l_hand` → "Left hand").
- Exports `SPECIFIED_INJURY_REGIONS` set for auto-classification.
- Exports `formatForOsha300ColumnE(regionIds[]) → string` joining labels with commas.
- Single source of truth on the backend for OSHA mapping. **One gap**: the frontend currently has no `eye` or `internal` region (face covers eye); flag for post-demo expansion. Document this in the service header.

**Incident POST changes:**
- Accept `is_anonymous: true` → set `reported_by = NULL`, ignore JWT identity for that field, log activity as `actor = "Anonymous"`.
- Accept `body_parts_affected: ["l_hand","r_forearm",...]` (flat JSON array of BodyMap3D region IDs); also pulled from `type_data.body_parts` for back-compat with the existing client during the transition. Maps to OSHA 300 column E via the body-parts label table.
- Accept `asset_id` (validates against assets table); replaces `specific_location` for asset-related incidents.
- Trending banner data: include `prior_incidents_count` in response (count at same asset/site+area in last 90 days).

**Stop-work endpoint:**
```
POST /api/incidents/stop-work
  body: {site_id, area, description, photo? (optional)}
  → creates incident with type=unsafe, is_imminent_danger=1, severity=1, track='A', stop_work_status='active'
  → notifications fire to all elevated users at site
  → cannot be down-routed (server-side guard)

POST /api/incidents/:id/stop-work-acknowledge      — sets stop_work_status='acknowledged'
POST /api/incidents/:id/stop-work-resolve {reason} — sets stop_work_status='resolved'
POST /api/incidents/:id/stop-work-cancel {reason}  — sets stop_work_status='cancelled' (Site Admin only)
```

**Tests:** anonymous flag scrubs reported_by; stop-work cannot down-route; auto-classification returns correct severity for treatment=medical+2 days away; trending count correct after multiple incidents at same asset.

---

## Wave 4 — CAPA escalation

**Files:**
- Modify: `server/routes/capas.js` (add POST, polymorphic source check)
- Modify: `server/routes/incidents.js` (add `/:id/create-capa` action)

**Endpoints:**
```
POST   /api/capas                              — create with {source_type, investigation_id?, incident_id?, ...}
POST   /api/incidents/:id/create-capa          — convenience: source_type=incident, incident_id=:id
```

**Behavior:**
- DB CHECK constraint enforces exactly one of investigation_id/incident_id matches source_type.
- Owner ≠ verifier still enforced via existing trigger (Phase 1).
- Activity log records source on creation.

**Updates to existing assign-capa:**
- `POST /api/investigations/:id/assign-capa` keeps working but now writes `source_type='investigation'` explicitly.

**Tests:** standalone proactive CAPA (both nullable); CAPA from incident (incident_id set); CAPA from investigation (investigation_id set); reject malformed combos.

---

## Wave 5 — Voice intake (LLM)

**Files:**
- New: `server/services/voice_extract.js` (Anthropic SDK)
- New: `server/db/migrations/002_voice_extractions.sql` adds `voice_extractions` table
- Modify: `server/routes/incidents.js` (new `/voice-extract` endpoint)
- Modify: `server/package.json` (`@anthropic-ai/sdk`)
- Modify: `.env.example` (`ANTHROPIC_API_KEY`)

**Schema:**
```sql
voice_extractions (
  id, incident_id (nullable, set after incident created),
  transcript_text, transcript_hash,
  ai_extracted_json,        -- the structured fields the LLM proposed
  user_confirmed_fields,    -- array of fields the user confirmed
  user_edited_fields,       -- array of fields the user edited
  user_rejected_fields,     -- array of fields the user rejected
  created_by, created_at
)
```

**Endpoint:**
```
POST /api/incidents/voice-extract
  body: {transcript: string, site_id?: int, prior_extraction_id?: int}
  response: {
    extraction_id,
    extracted_fields: {type, title, area, asset_id (fuzzy), body_parts_affected, treatment, witnesses_named, ...},
    suggested_followups: ["Which hand — left or right?"],
    missing_required: ["body_parts_affected"],
    transcript_hash
  }
```

**Implementation:**
- Anthropic SDK with tool-use mode for structured JSON output.
- System prompt anchored on the 8 incident types and known wizard fields.
- Low temperature (0.2).
- Asset fuzzy match: case-insensitive substring match against `assets.name` for the user's org.
- User fuzzy match (witness names): substring against `users.name` for the user's org.
- Audio transcription handled in browser (Web Speech API) for v1 — backend takes pre-transcribed text. Document this in the endpoint contract.
- **No transcript retention beyond the request lifecycle** — only the hash + AI-extracted JSON go into `voice_extractions`. Confirmation logging records which fields the user accepted/edited/rejected when the incident is finally submitted.

**Hallucination guardrails:**
- Activity log entry on incident creation: "Voice intake used; transcript hash X; N fields suggested; M confirmed, K edited, J rejected."
- Caller (frontend) is expected to mark each field as "AI suggested" until user confirms — backend doesn't enforce, but the schema supports it.

**Tests:** synthetic transcript ("cut my left hand at press 4") returns `body_parts_affected = [{region: 'hand', side: 'left'}]` and matches asset id for Press 4 if seeded.

---

## Wave 6 — Polish + demo seed

**Files:**
- Replace: `server/db/seed.js`
- Modify: `server/package.json` (multer 2.x bump per Phase 1 deferred fix)
- Modify: `server/routes/attachments.js` if multer 2.x API differs
- Modify: `server/middleware/errorHandler.js` (FK error scrubbing per Phase 1 deferred fix)
- Modify: `server/routes/incidents.js` (OSHA 300 injury_type granularity per Phase 1 deferred fix)

**Demo seed contents** (matches the demo path):
- 2-3 sites: Cleveland (US, NAICS 325199), Sheffield (UK), Dallas (US new — for the 14-month-online edge case)
- Users covering all 5 current roles (renamed for demo: Elena/Marcus/James/Mehta/Wendy-Worker)
- ~15-20 assets across sites: Press 4, Forklift FL-3, CNC-7, Solvent-Storage-A, etc.
- ~8 documents: SDS for IPA, IPA, MSDS for chemicals, equipment manuals
- 24 months of `work_hours` per site with the agreed edge cases:
  - Most-recent-month missing for Sheffield (demos the missing-metrics badge)
  - Anomalous low-hours month for Cleveland (demos TRIR spike)
  - Dallas online for last 14 months only
- ~12-15 incidents covering all 8 types and all 3 tracks:
  - 1 stop-work currently active (red banner demo)
  - 1 anonymous near-miss (DB-proof demo)
  - 1 voice-intake-assisted (links to voice_extractions row)
  - The chemical-splash injury already in the seed → enriched with EHS verification
  - Multiple at same asset for trending demo
  - Active OSHA 24hr banner + active RIDDOR phone-required banner
- Investigations: 5-Why chains, evidence (linked documents), team
- CAPAs: mix of investigation-source / incident-source / proactive; one overdue; one pending verification; one closed
- 300A annual cert for Cleveland 2025 already signed (typed-name attestation)
- Activity log dense enough to make the dashboard feed look alive

**Final tests:**
- Boot server + reseed: no errors.
- All Phase 1 + Phase 2 endpoints return expected codes.
- Existing client at localhost:5173 renders without errors against new schema.
- TRIR/DART on dashboard shows real numbers from seeded work_hours.
- Stop-work demo: open dashboard, see red banner, click resolve, banner clears.
- Anonymous demo: open the seeded anonymous incident detail; confirm reporter shows "Anonymous"; query DB to show `reported_by = NULL`.
- Voice demo: POST /api/incidents/voice-extract with synthetic transcript, confirm extraction.
- OSHA 300 export: includes the chemical-splash + forklift cases with new `description` (Phase 1 fix verified).

---

## Critical files (existing) — modified across waves

| File | Waves | Notes |
|---|---|---|
| `server/db/schema.sql` | 1 | New tables + column additions appended |
| `server/db/seed.js` | 6 | Replaced |
| `server/db/connection.js` | 1 | Calls migrate on boot |
| `server/index.js` | 2, 5 | Mount new routes |
| `server/routes/incidents.js` | 3, 4, 5 | Anonymous, stop-work, asset_id, body map, voice |
| `server/routes/capas.js` | 4 | POST + polymorphic source |
| `server/routes/investigations.js` | (minimal) | Adapt to source_type when assigning CAPA |
| `server/services/regulatory.js` | 3 | Renamed/split into `recordability.js` + `riddor.js` |
| `server/services/classification.js` | 3 | Rewrite |
| `server/services/numbering.js` | 2 | Add `nextAssetNumber`, `nextDocumentNumber` |
| `server/middleware/upload.js` | 6 | Multer 2.x bump |
| `server/middleware/errorHandler.js` | 6 | FK error scrubbing |
| `server/package.json` | 5, 6 | Anthropic SDK, multer 2.x |
| `.env.example` | 5 | `ANTHROPIC_API_KEY` |

## New files

```
server/db/migrate.js
server/db/migrations/001_phase2_schema.sql
server/db/migrations/002_voice_extractions.sql
server/routes/assets.js
server/routes/documents.js
server/routes/links.js
server/services/entity_links.js
server/services/recordability.js
server/services/riddor.js
server/services/auto_classify.js   (renaming current classification.js)
server/services/voice_extract.js
server/services/body_parts.js   (mirrors PART_LABELS from BodyMap3D.jsx + SPECIFIED_INJURY_REGIONS)
plan-phase-2.md   (mirror of this plan, in project root)
```

---

## Frontend gaps to flag (will not build per backend-only direction)

The Explore agent confirmed the existing client lacks UI for several Phase 2 features. Backend will be ready; UI work is a separate effort:

| Feature | Frontend gap |
|---|---|
| **Asset module** | No `pages/assets/`, no nav link, no `client/src/api/assets.js`. Backend ready, UI must be built. |
| **Document library** | Same — no UI, no API module. |
| **Anonymous reporting** | Zero scaffolding. Wizard needs a toggle. |
| **Stop-work button** | Only a label inside `UnsafeConditionForm.jsx`. Needs a top-bar button + dashboard banner. |
| **Voice intake** | Mic icon exists in `Icon.jsx` but never invoked. Needs Web Speech API recording + extraction-confirmation flow. |
| **EHS recordability verification card** | New UI on incident detail for elevated roles. |
| **Body map** | ✅ Already shipped in main as `BodyMap3D.jsx` (4 views, 30 prefix-encoded region IDs) — backend mirrors the IDs as-is. No frontend gap. |
| **Trending banner** | Wizard needs to display the prior-incidents-count we now return. |
| **Polymorphic CAPA source** | CAPA module needs "+ New CAPA" with source picker. |
| **300A typed-name cert UI** | Reports module needs a sign-off button. |

After demo, these become a frontend task list. Backend exposes everything cleanly so it should be incremental UI work, not API rework.

---

## Deferred to Phase 3 (post-demo) — not in this plan

Per hackathon-demo lens, these locked-but-invisible items are deferred:

- **3-role RBAC simplification** (worker/ehs_manager/site_admin). Current 5-role schema works for demo. Phase 3 collapses, migrates user.role values, updates all permission gates.
- **PHI/PII field-level redaction.** Code-level `[redacted]` substitution + `_redacted_fields` array. Not visible in demo.
- **Retention Celery beat / soft-delete buffer / litigation hold / SAR report.** Lock-only, not built.
- **Email notification channel.** Web in-app works; email via Resend deferred.
- **SLA timer scan job.** Overdue derived at query time; no proactive escalation.
- **300A digital sign-off cert document hash + snapshot storage + stale-on-edit cascade.** Lean version (typed-name only) ships in Wave 6.
- **WorkHours management UI.** Seed-only for demo.
- **State machine formalization** (full reopen rules, locked-on-submit regulatory fields). Current rough states work.

---

## Verification

**End-to-end test after each wave:**
1. `cd server && rm -f db/incident_management.db && node db/seed.js` — clean reseed.
2. `node index.js` — boots without errors.
3. Run the wave-specific smoke test (curl scripts for new endpoints + regression on Phase 1 endpoints).
4. Open `http://localhost:5173/` in a browser, log in as `elena@sdsmanager.com / password123`, verify the dashboard, incidents list, investigation detail, CAPA list all load without console errors.
5. Run the *demo path walkthrough* manually: report incident → escalate → 5-Why → CAPA → verify → OSHA export.

**Final demo readiness check (after Wave 6):**
- All 17 demo beats from the locked plan are visible and functional.
- TRIR/DART numbers look plausible.
- Active stop-work + active regulatory banner on first paint.
- Voice intake works end-to-end against an Anthropic key.
- No 500 errors in server log during a 10-minute demo walk-through.

---

## Estimated effort

| Wave | Estimated time | Dependencies |
|---|---|---|
| Pre-flight | 30 min | — |
| Wave 1 (foundation) | 4-6 hr | Pre-flight |
| Wave 2 (asset + doc) | 4-6 hr | Wave 1 |
| Wave 3 (incident extensions) | 6-8 hr | Wave 2 (uses asset_id) |
| Wave 4 (CAPA escalation) | 2-3 hr | Wave 1 |
| Wave 5 (voice intake) | 4-5 hr | Wave 1 + needs Anthropic key |
| Wave 6 (polish + seed) | 4-6 hr | Waves 1-5 |
| **Total** | **24-34 hr** focused work | |

Roughly 4-5 working days at full focus, or one extended weekend.
