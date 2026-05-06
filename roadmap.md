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

## Wave 5 — Voice intake ✅ complete

- [x] **T5.1** `services/voice_extract.js` (Anthropic SDK + tool-use schema) — commit `5d5d98e`
- [x] **T5.2** `POST /incidents/voice-extract` endpoint + `voice_extractions` write + activity log — commit `8b5f609`
- [x] **F5.1** Voice intake confirmation flow (Web Speech transcribes in browser, BE extracts structure) — commit `108f08f`

## Wave 6 — Polish + seed ✅ code complete (F6.2 is a manual walkthrough)

- [x] **T6.1** Hygiene: multer 2.x cleanup + OSHA 300 `injury_type` granularity + FK error scrubbing — commit `75fb1ef`
- [x] **T6.2 + T6.3** Demo seed rewrite (foundation + incident graph) — bundled in commit `48e29ff` (the seed is one atomic transaction; splitting would have left a half-written, broken seed)
- [x] **F6.1** 300A sign-off button on Reports page — commit `511dab9`
- [ ] **F6.2** End-to-end demo path walkthrough in browser — *manual; run `SEED_FORCE=1 node db/seed.js`, then click through the 10 beats per plan-phase-2.md §5*

## Wave 7 — Deferred enhancements

- [x] **E7.1** **Custom fields per asset type** — SafetyCulture-style. Migration 005 + asset_category_fields table + assets.custom_fields JSON + CRUD endpoints + validation hook + FE category-fields editor + dynamic form rendering on asset create/edit + display card on detail.
  - BE: commit `d4d4b2b`
  - FE editor modal: commit `cab263c`
  - FE dynamic form + display: commit `da0e3fe`

## Phase 3 — Productionization (user-driven backlog, captured 2026-05-06)

User observations after clicking through the Phase 2 build. Treat as an
actual app, not a hackathon. Order shifts based on user direction; nothing
here ships without explicit go-ahead.

### Navigation / pages
- [ ] **P3-N1** **Site details page** — /sites/:id with assets, incidents, work_hours, regulatory subs scoped to that site.
- [x] **P3-N2** **Document folder structure** — folders/sub-folders for documents — commit `12862f8` (BE: migration `010_document_folders` + `/api/folders` CRUD + folder_id filter on docs; FE: breadcrumb, site filter, "+ New folder", folder tiles in grid + list, kebab rename/delete with content-count warning, native HTML5 DnD doc → folder / folder → folder / either → breadcrumb; Drive-style global search at root, scoped inside folders; folder navigation in the link-from-library modal on investigations).
- [x] **P3-N3** **Document preview** — inline PDF/image/video/audio preview without leaving the page — commit `1873bb2` (Drive-inspired redesign on origin/main, merged in `eeafa48`).

### Cross-entity linking + history
- [ ] **P3-L1** **Back-tracking everywhere** — "where is this referenced?" on inspections / CAPAs / incidents / assets / docs. The `entity_links` table already exists; need consistent surfacing.
- [ ] **P3-L2** **Media on investigations** — attachments card on investigation detail (parallel to the incident one).

### Audit
- [ ] **P3-A1** **Proper activity logging** — wider coverage (every mutation writes a row), consistent shape, filterable by entity / actor / action / timestamp window.

### Org / multi-tenancy
- [ ] **P3-O1** **Concept of organization** — proper multi-tenant model. Today there's a single org row in the seed; needs sign-up, invite flows, switching, isolation tests.
- [ ] **P3-O2** **Org + site members management** — see who belongs where, move users between sites, role changes with audit, invite-by-email.

### AI assistance
- [ ] **P3-AI1** **Auto-fill investigation (AI + manual modes)** — five-Why suggestions, root-cause prompts, contributing-factors checklist, recommended CAPAs.
- [ ] **P3-AI2** **Prompt-driven autofill** — system asks targeted questions ("Was the press locked out?"), user answers free-text, AI normalizes into structured fields.

### Operational features
- [ ] **P3-OP1** **Asset maintenance** — schedules, due dates, last-done, escalations to CAPA when overdue.
- [x] **P3-OP2** **Inspection module** — full inspection lifecycle (templates → schedule → run → findings → CAPAs) — commit `918279a` (origin/main; merged in `eeafa48`). Pages: `/inspections`, `/inspections/:id` editor + report; routes `/api/inspections`, `/api/answer-sets`; migrations `008_templates_inspections` + `009_template_versioning`.
- [x] **P3-OP3** **Templates** — reusable templates with versioning + Google-Forms-style builder — commit `918279a` (origin/main; merged in `eeafa48`). Pages: `/templates`, `/templates/:id/edit`; route `/api/templates`.
- [ ] **P3-OP4** **Scheduling** — recurring inspections, calibrations, training, walkthroughs; calendar view + reminders.

### Onboarding + data import
- [ ] **P3-OB1** **User onboarding flow** — first-login walkthrough, sample data toggle, role-tailored "what to do first".
- [ ] **P3-OB2** **CSV import** — users, sites, assets, work_hours, etc. With dry-run + error report.
- [ ] **P3-OB3** **Document versioning** — supersede a doc with a new file while keeping the audit trail of prior revisions.

---

## Backlog — productionization UX (treat this as an actual app, not just demo polish)

These came out of the post-Wave-4 review. The shared theme is **"the incident record lives — investigators keep it accurate as facts emerge, every change is auditable."** OSHA 1904.33 explicitly expects amendments within the 5-year retention window, so none of this is a recordkeeping risk as long as the activity log captures who/what/when.

### Editable Incident Detail (one cohesive bundle)

- [x] **UX-A** **Post-report attachments** — add + delete with audit. Photos surface hours/days later; capturing them at submission only is a real gap. — commit `ba14826`
- [x] **UX-B** **Inline notes on activity timeline** — `POST /incidents/:id/note` + composer + distinct amber styling for note rows + Cmd/Ctrl+Enter to post + optimistic prepend. Commit `31f8be7`.
- [ ] **UX-C** **Editable description / area / department / body parts** on the detail page. PATCH already supports all of these BE-side; UI is what's missing. Use field-level edit affordances rather than a giant edit-mode toggle.
- [ ] **UX-D** **Add/edit witnesses post-creation** — witnesses surface late. Currently captured at submission only. Small route + a witnesses card with add/edit/remove.
- [ ] **UX-E** **Severity override UI** — BE already wires `severity_override` / `severity_override_by` / `severity_override_reason` and writes a `severity_overridden` activity_log entry. UI is missing — needs a small modal: new severity, required reason, confirm. Triage often needs to bump severity after seeing photos.

### Quick wins (independent, can land any time)

- [ ] **UX-F** **Global search jump-to in TopBar** — wire to `/api/search`, keyboard-driven dropdown ("INC-…" / "INV-…" / "CAPA-…" → enter → navigate).
- [x] **UX-G** **CAPA due-date color coding** — pills on kanban + list (red ≤2d & overdue, amber ≤6d, muted else). Commit `48ca9b2`.
- [x] **UX-H** **Cross-page stop-work banner** — slim pulsing red bar above TopBar in ProtectedLayout, polls every 30s, click → first active stop-work. Commit `48ca9b2`.

### Deferred (cool but expensive — revisit only if other beats are solid)

- "Similar incidents" panel on IncidentDetail (semantic match by site + body part + window).
- OSHA 301 PDF export.
- Trending dashboard widgets ("3 incidents at Press 4 this month, +200%").
- Keyboard shortcuts (`?` help, `g i` incidents, `n` new incident).

## Known issues (investigate later, not blocking)

- [x] **BUG-001** ~~"Failed to create category" error~~ — fixed by the upstream AssetsList redesign (`b27b352`). Verified 2026-05-06 against the live Vite proxy: new unique name → 201, active duplicate → 409 with friendly message, case-insensitive duplicate → 409, predefined name → 409, soft-deleted reactivation → returns row with active=1. No reproducer left.

## Pre-Wave-3-design-system-rules violations (carried, do not fix per user direction)

The following Wave 2 FE files were authored before the new `CLAUDE.md` design system was added on main (`317b4c4`). They use `--sds-text-*` tokens (instead of `--sds-fg-*`), `.btn-ghost` (not in canonical set), and inline modals (no `createPortal`). Upstream redesigns at `ef1cc50` (Sites) and `b27b352` (Assets + Documents) have **already replaced** the Wave 2 versions, so most of these are no longer present in the repo. Wave 3 work follows the design rules from the start.

---

## State

- **Branch**: `backend` — synced with `origin/backend`.
- **Phase 2**: code complete. Only F6.2 (manual demo walkthrough) outstanding.
- **Wave 7**: E7.1 done.
- **Productionization backlog** (UX-A through UX-H): A, B, G, H done. C, D, E, F pending.
- **BUG-001**: closed.
- **Phase 3** (P3-* items): all open, captured 2026-05-06.
- **Migrations applied**: 001–007.
- **Running**: dev servers via `cd server && node index.js` (BE :3001) and `cd client && npm run dev` (FE :5173). Demo accounts in seed.

## Most recent session — 2026-05-06

Session shipped 14 commits to `origin/backend`. Headline UI changes:

| Area | What changed | Commit |
|---|---|---|
| Asset types modal | 2-pane redesign + DEFAULT badges + field-count badges | `8096bbb` |
| Default fields per type | Migration 006 — Vehicle/Machine/Building/Tool/Chemical come pre-loaded | `74f3557` |
| Drop "Area" + Display ID | Migration 007 + system-fields banner with Display name + Unique identifier | `6ac9d51` `22b921f` |
| Start-from picker | New asset type → Blank / From existing / From template (8 industry templates) | `dd5ee85` |
| UX-A post-report attachments | Add + delete + audit on incident detail | `ba14826` |
| UX-B inline notes | Amber composer + interleaved NOTE rows on activity timeline | `31f8be7` |
| UX-G CAPA due-date colors | Red / amber / gray pills on kanban + list | `48ca9b2` |
| UX-H cross-page stop-work | Pulsing red bar above TopBar on every page | `48ca9b2` |
| BUG-001 | Verified fixed; no code change needed | `b4d4952` |
| Phase 3 backlog | 16 P3-* items captured into roadmap | `9dc6a35` |

Latest commit on `origin/backend` is the most recent roadmap update; run `git log -10` to see the chain.

## Quick re-orientation for a fresh session

1. Read this `roadmap.md` first — full status with commit SHAs.
2. Read `plan-phase-2.md` if you need design rationale for any Phase-2 wave.
3. Read `~/.claude/projects/-Users-rukaiyafahmida-Downloads-SDS-Manager-Incident-Management-System-project-ehs-incident-manager/memory/MEMORY.md` for user preferences and project context.
4. `git fetch origin && git status` — should show `backend` in sync with `origin/backend`.
5. Boot: `cd server && node index.js` and `cd client && npm run dev`. Login as `elena@sdsmanager.com / password123`.
6. **What's likely next** (in user-priority order):
   - **UX-C** editable description / area / dept / body_parts on incident detail (~1.5h) — BE PATCH already supports all of these
   - **UX-E** severity override UI (~45min) — BE fully wired, just missing the modal
   - **UX-D** witness add/edit (~1h) — small new route + card
   - **UX-F** global search jump-to in TopBar (~1.5h)
   - Then Phase 3 (P3-N1 site details / P3-OP2 inspection module / P3-AI1 investigation auto-fill, etc.) — these are bigger and the user will direct.
7. **Operating norms** (per user feedback during Phase 2):
   - Treat as an actual app, not hackathon polish.
   - Each task = one focused commit + push to `origin/backend`.
   - Always leave dev servers running at the end so the user can click-test.
   - Don't claim FE success without actually exercising the UI; "Vite transforms cleanly" alone is not proof.
