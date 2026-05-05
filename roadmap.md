# Phase 2 Roadmap

Live task tracker. Tick boxes as tasks land. Each task gets one focused commit.

## Wave 1 — Foundation ✅ complete

- [x] **T1.1** Migration runner + `_schema_migrations` table — commit `c7d0be4`
- [x] **T1.2** Bump multer → 2.x + install `@anthropic-ai/sdk` — commit `6f56829`
- [x] **T1.3** Migration 001 — 9 new tables + 25 risk_matrix rows — commit `d3a4a27`
- [x] **T1.4** Migration 002 — incident column adds + `reported_by` rebuild — commit `c2c2494`
- [x] **T1.5** Migration 003 — capa polymorphic + `investigation_id` rebuild + CHECK — commit `07944db`

## Wave 2 — Site / Asset / Document / EntityLink ✅ complete

- [x] **T2.1** Site CRUD (`POST/PATCH/DELETE /api/sites`) — commit `6a881c1`
- [x] **F2.1** Sites admin page + `api/sites.js` + Sidebar nav — commit `d4786a8` (later redesigned upstream by `ef1cc50`)
- [x] **T2.2** Asset CRUD — commit `982c39c`
- [x] **F2.2** Assets module pages + nav + routing — commit `907a3b4` (later redesigned upstream by `b27b352`)
- [x] **T2.2b** Custom asset categories (`/api/asset-categories` + migration 004 + auto-seed trigger) — commit `982c39c`
- [x] **F2.2b** Asset detail rebuild + category picker w/ "+ New" inline — commit `907a3b4`
- [x] **T2.3** EntityLink endpoints + service + asset-detail enrichment — commit `982c39c`
- [x] **F2.3** Site → Asset cascade in wizard + incidents POST accepts `asset_id` — commit `a58f8a7`
- [x] **T2.4** Document module (CRUD + multipart upload + linking via entity_links) — commit `ec1c292`
- [x] **F2.4** Documents library page + upload modal + nav — commit `d1540c4` (later redesigned upstream by `b27b352`)
- [x] **F2.5** Document linking on investigation evidence — commit `0837e2a`

## Wave 3 — Incident extensions ✅ complete

- [x] **T3.1** Service foundations: `body_parts.js` + recordability/riddor split + `auto_classify.js` — commit `7053b7b` (severity-floor refinement in `661e9b0`)
- [x] **T3.2** `incidents.js` POST extends: `body_parts_affected`, `is_anonymous`, `prior_incidents_count` + new `POST /classify-preview` endpoint — commit `302cf7a`
- [x] **T3.3** Stop-work endpoints + state machine + down-route guard — commit `1de6eb5`
- [x] **F3.3** STOP WORK button (TopBar) + active dashboard banner — commit `f18d712`
- [x] **F3.1** Body map wiring (`InjuryForm` uses `BodyMap3D`) — commit `73db417`
- [x] **F3.2** Anonymous toggle in wizard Step 1 — commit `73db417`
- [x] **F3.4** Trending banner + auto-classification suggestion on wizard Step 2 — commit `73db417`
- [x] **T3.4** `POST /incidents/:id/recordability-verify` (5-gate decision) — commit `29d390e`
- [x] **F3.5** EHS recordability verification card on incident detail — commit `2aa3e3b`

## Wave 4 — CAPA polymorphic ✅ complete

- [x] **T4.1** CAPA polymorphic: `POST /capas` + `POST /incidents/:id/create-capa` + assign-capa source_type — commit `465a5dd`
- [x] **F4.1** "+ New CAPA" button with source picker on CAPA list — commit `18eeb68`

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

- [ ] **E7.1** **Custom fields per asset type** — SafetyCulture-style. New `asset_category_fields` table (field_name, field_type, required, options, order). `assets.custom_fields` JSON. UI: define fields when creating/editing a category; render fields when creating an asset of that type; display on detail page.

## Backlog — productionization UX (treat this as an actual app, not just demo polish)

These came out of the post-Wave-4 review. The shared theme is **"the incident record lives — investigators keep it accurate as facts emerge, every change is auditable."** OSHA 1904.33 explicitly expects amendments within the 5-year retention window, so none of this is a recordkeeping risk as long as the activity log captures who/what/when.

### Editable Incident Detail (one cohesive bundle)

- [x] **UX-A** **Post-report attachments** — add + delete with audit. Photos surface hours/days later; capturing them at submission only is a real gap. — commit `ba14826`
- [ ] **UX-B** **Inline notes on activity timeline** — `POST /incidents/:id/note` writes one `activity_log` row with `action='note'` + free text. Renders in the existing timeline UI. Single biggest investigation-quality win — turns a passive system log into an actual investigation tool ("Spoke with site mgr — no PPE was issued").
- [ ] **UX-C** **Editable description / area / department / body parts** on the detail page. PATCH already supports all of these BE-side; UI is what's missing. Use field-level edit affordances rather than a giant edit-mode toggle.
- [ ] **UX-D** **Add/edit witnesses post-creation** — witnesses surface late. Currently captured at submission only. Small route + a witnesses card with add/edit/remove.
- [ ] **UX-E** **Severity override UI** — BE already wires `severity_override` / `severity_override_by` / `severity_override_reason` and writes a `severity_overridden` activity_log entry. UI is missing — needs a small modal: new severity, required reason, confirm. Triage often needs to bump severity after seeing photos.

### Quick wins (independent, can land any time)

- [ ] **UX-F** **Global search jump-to in TopBar** — wire to `/api/search`, keyboard-driven dropdown ("INC-…" / "INV-…" / "CAPA-…" → enter → navigate).
- [ ] **UX-G** **CAPA due-date color coding** on kanban cards — red <3d, amber <7d, gray else. Five-minute change, instant readability win.
- [ ] **UX-H** **Cross-page stop-work banner** — if any incident has `stop_work_status='active'`, render a thin red bar on every protected page, not just Dashboard.

### Deferred (cool but expensive — revisit only if other beats are solid)

- "Similar incidents" panel on IncidentDetail (semantic match by site + body part + window).
- OSHA 301 PDF export.
- Trending dashboard widgets ("3 incidents at Press 4 this month, +200%").
- Keyboard shortcuts (`?` help, `g i` incidents, `n` new incident).

## Known issues (investigate later, not blocking)

- [ ] **BUG-001** "Failed to create category" error using the inline `+ Add new category…` flow in the AssetsList modal. Backend `POST /api/asset-categories` works via curl. Suspect (a) Vite proxy / Origin header mismatch on POST, (b) async state race after `refreshCategories()`, or (c) hitting a default-seeded name → 409 not surfacing properly. Note: AssetsList.jsx was redesigned upstream by `b27b352` after this bug was logged — the redesign may have already fixed it.

## Pre-Wave-3-design-system-rules violations (carried, do not fix per user direction)

The following Wave 2 FE files were authored before the new `CLAUDE.md` design system was added on main (`317b4c4`). They use `--sds-text-*` tokens (instead of `--sds-fg-*`), `.btn-ghost` (not in canonical set), and inline modals (no `createPortal`). Upstream redesigns at `ef1cc50` (Sites) and `b27b352` (Assets + Documents) have **already replaced** the Wave 2 versions, so most of these are no longer present in the repo. Wave 3 work follows the design rules from the start.

---

## State

- **Local commits ahead of `origin/main`**: see `git log origin/main..backend` — all Wave 3 + Wave 4 + UX-A commits pushed to `origin/backend`.
- **Branch**: `backend`
- **Running**: dev servers usually started via `npm run dev` from the project root (BE on `:3001`, FE on `:5173`). Demo accounts in seed.

## Quick re-orientation for a fresh session

1. Read `~/.claude/projects/-Users-rukaiyafahmida-Downloads-SDS-Manager-Incident-Management-System/MEMORY.md` (index of memory files).
2. Read `plan-phase-2.md` (full design + acceptance criteria + waves) and this `roadmap.md` (live status with commit SHAs).
3. `git fetch origin && git status` — confirm branch state vs `origin/main`.
4. `cd server && rm -f db/incident_management.db db/*.db-wal db/*.db-shm && node db/seed.js && cd .. && npm run dev` — clean reset + boot.
5. Login as `elena@sdsmanager.com / password123`. Quick sanity click: Dashboard, Sites, Assets, Documents, Investigations, Wizard.
6. **Next task**: T5.1 (`services/voice_extract.js` — Anthropic SDK + tool-use schema) — start of Wave 5.
