# Phase 2 Roadmap

Live task tracker. Tick boxes as tasks land. Each task gets one focused commit.

## Wave 1 — Foundation

- [x] **T1.1** Migration runner + `_schema_migrations` table (commit `c7d0be4`)
- [x] **T1.2** Bump multer → 2.x + install `@anthropic-ai/sdk` (commit `6f56829`)
- [x] **T1.3** Migration 001 — 9 new tables + 25 risk_matrix rows (commit `d3a4a27`)
- [x] **T1.4** Migration 002 — incident column adds + `reported_by` rebuild (commit `c2c2494`)
- [x] **T1.5** Migration 003 — capa polymorphic + `investigation_id` rebuild + CHECK (commit `07944db`)

## Wave 2 — Site / Asset / Document / EntityLink

- [x] **T2.1** Site CRUD (`POST/PATCH/DELETE /api/sites`) (commit `6a881c1`)
- [x] **F2.1** Sites admin page + `api/sites.js` + Sidebar nav (commit `d4786a8`)
- [x] **T2.2** Asset CRUD (commit `982c39c`)
- [x] **F2.2** Assets module pages + nav + routing (commit `907a3b4`)
- [x] **T2.2b** Custom asset categories (`/api/asset-categories` + migration 004 + auto-seed trigger) (commit `982c39c`)
- [x] **F2.2b** Asset detail rebuild (tabs, edit-in-place, archive/restore actions) + category picker w/ "+ New" inline (commit `907a3b4`)
- [x] **T2.3** EntityLink endpoints + service + asset-detail enrichment (commit `982c39c`)
- [x] **F2.3** Site → Asset cascade in wizard + incidents POST accepts `asset_id`
- [x] **T2.4** Document module (CRUD + multipart upload + linking via entity_links)
- [x] **F2.4** Documents library page + upload modal + nav
- [x] **F2.5** Document linking on investigation evidence + investigation GET includes `linked_documents`

## Wave 3 — Incident extensions

- [x] **T3.1** Service foundations: `body_parts.js` + recordability/riddor split + `auto_classify.js` (local, uncommitted)
- [x] **T3.2** `incidents.js` POST extends: `body_parts_affected`, `asset_id` (was already done in F2.3), `is_anonymous`, `prior_incidents_count` + new `POST /classify-preview` endpoint (local, uncommitted)
- [ ] **F3.1** Body map wiring (`InjuryForm` uses `BodyMap3D`)
- [ ] **F3.2** Anonymous toggle in wizard Step 1
- [ ] **F3.4** Trending banner on wizard Step 2
- [x] **T3.3** Stop-work endpoints + state machine + down-route guard (local, uncommitted)
- [x] **F3.3** STOP WORK button (TopBar) + active dashboard banner (local, uncommitted)
- [ ] **T3.4** `POST /incidents/:id/recordability-verify` (5-gate)
- [ ] **F3.5** EHS recordability verification card on incident detail

## Wave 4 — CAPA polymorphic

- [ ] **T4.1** CAPA polymorphic: `POST /capas` + `POST /incidents/:id/create-capa` + assign-capa source_type
- [ ] **F4.1** "+ New CAPA" button with source picker on CAPA list

## Wave 5 — Voice intake

- [ ] **T5.1** `services/voice_extract.js` (Anthropic SDK + tool-use schema)
- [ ] **T5.2** `POST /incidents/voice-extract` endpoint + `voice_extractions` write + activity log
- [ ] **F5.1** Voice intake confirmation flow (existing Web Speech wires to backend)

## Wave 6 — Polish + seed

- [ ] **T6.1** Hygiene: multer 2.x cleanup + OSHA 300 `injury_type` granularity + FK error scrubbing
- [ ] **T6.2** Demo seed Part 1: sites, assets, documents, work_hours, users, risk_matrix
- [ ] **T6.3** Demo seed Part 2: incidents (all types + flags), investigations, CAPAs (mixed source), regulatory submissions, activity log, voice extraction row
- [ ] **F6.1** 300A sign-off button on Reports page
- [ ] **F6.2** End-to-end demo path walkthrough in browser

## Wave 7 — Deferred enhancements (post-demo / time permitting)

- [ ] **E7.1** **Custom fields per asset type** — SafetyCulture-style. New `asset_category_fields` table (field_name, field_type, required, options, order). `assets.custom_fields` JSON. UI: define fields when creating/editing a category; render fields when creating an asset of that type; display on detail page. Enables asset-type-specific data capture (Forklift → capacity/power-source; Chemical → CAS-number/SDS-link; etc.)

## Known issues (investigate later, not blocking)

- [ ] **BUG-001** "Failed to create category" error when using the inline `+ Add new category…` flow in the AssetsList modal. Backend `POST /api/asset-categories` works via curl (returns 201 + `{id, name, ...}`); confirmed reactivation + 409 paths. Likely candidates: (a) Vite proxy not forwarding `Origin` header on POST while a JWT is in localStorage, (b) async state race after `refreshCategories()` blocks the dropdown selection, (c) duplicate check vs default seeded categories — user may have hit "Machine"/"Vehicle" which already exist and the 409 message isn't surfacing in the modal correctly. Repro path: Assets → New asset → Type dropdown → "+ Add new category…" → enter name → Save. Check browser devtools → Network tab for the actual response. Patch in the next polish pass alongside the design-token alignment.

---

**Progress: Wave 2 complete · 19 / 32 done locally** (Wave 1 + entire Wave 2). Next: **Wave 3 — Incident extensions** (T3.1 service foundations + body map wiring + anonymous + stop-work + recordability).

See `plan-phase-2.md` for full design rationale, acceptance criteria, risks, and migration strategy.
