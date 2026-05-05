# Phase 2 Roadmap

Live task tracker. Tick boxes as tasks land. Each task gets one focused commit.

## Wave 1 — Foundation

- [x] **T1.1** Migration runner + `_schema_migrations` table (commit `c7d0be4`)
- [x] **T1.2** Bump multer → 2.x + install `@anthropic-ai/sdk` (local, uncommitted)
- [x] **T1.3** Migration 001 — 9 new tables + 25 risk_matrix rows (local, uncommitted)
- [x] **T1.4** Migration 002 — incident column adds + `reported_by` rebuild (local, uncommitted)
- [x] **T1.5** Migration 003 — capa polymorphic + `investigation_id` rebuild + CHECK (local, uncommitted)

## Wave 2 — Site / Asset / Document / EntityLink

- [x] **T2.1** Site CRUD (`POST/PATCH/DELETE /api/sites`) (local, uncommitted)
- [x] **F2.1** Sites admin page + `api/sites.js` + Sidebar nav (local, uncommitted)
- [ ] **T2.2** Asset CRUD
- [ ] **F2.2** Assets module pages + nav + routing
- [ ] **T2.3** EntityLink endpoints + service + asset-detail enrichment
- [ ] **F2.3** Site → Area → Asset cascade in wizard (drop `specific_location`)
- [ ] **T2.4** Document module (CRUD + multipart upload + linking)
- [ ] **F2.4** Documents library page + upload modal + nav
- [ ] **F2.5** Document linking on investigation evidence

## Wave 3 — Incident extensions

- [ ] **T3.1** Service foundations: `body_parts.js` + recordability/riddor split + `auto_classify.js`
- [ ] **T3.2** `incidents.js` POST extends: `body_parts_affected`, `asset_id`, `is_anonymous`, `prior_incidents_count`
- [ ] **F3.1** Body map wiring (`InjuryForm` uses `BodyMap3D`)
- [ ] **F3.2** Anonymous toggle in wizard Step 1
- [ ] **F3.4** Trending banner on wizard Step 2
- [ ] **T3.3** Stop-work endpoints + state machine + down-route guard
- [ ] **F3.3** STOP WORK button (TopBar) + active dashboard banner
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

---

**Progress: 1 / 32 committed · 7 / 32 done locally** (Wave 1 + Sites BE/FE in sync)

See `plan-phase-2.md` for full design rationale, acceptance criteria, risks, and migration strategy.
