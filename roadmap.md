# EHS Incident Management — Roadmap

Live status for what's open, what's done (with commit SHAs), and how to operate
on this codebase. Done items are one-line entries; `git show <sha>` recovers
the full detail. Most recent session entries at the bottom.

---

## Current state

- **Branch:** `backend` at `9d1faf8` (merge from `origin/main`). Equal to
  `origin/backend`. Working tree clean.
- **`origin/main`** at `bb0fca3`. Main's two new commits since `6051395`:
  global voice report feature (`b2e6a9f`, +2982 lines, new
  `@google/generative-ai` server dep) and a small ReferencedByCard
  double-modal fix. Both merged into backend cleanly (no manual conflicts).
- **PR #11** open: backend → main — "P3-OB2 sellable-tier work_hours +
  audit log timeline fixes" — 12 commits. Awaits click-test approval.
  `https://github.com/arifbd2221/ehs-incident-manager/pull/11`.
- **Phase 2:** code complete (only F6.2 manual demo walkthrough open).
- **Wave 7:** E7.1 (custom asset fields per category) done.
- **UX backlog A–H:** done. UX-C body-parts editor deferred (needs BodyMap3D
  outside the wizard).
- **Phase 3 done:** N1, N2, N3, L1, L2, A1, O1, O2, **OB2** (users + sites + assets + work_hours
  full industry-standard surfaces — manual CRUD + year-group/YoY + live OSHA 300A + TRIR/DART/LTIR/Severity
  cards on SiteDetail and Dashboard + CSV export + contractor split), OP2, OP3.
- **Phase 3 open:** AI1, AI2, AI3, OP1, OP4, OP5, OB1, OB3, RG1.
- **Migrations applied:** 001–021 + letter fixups `014a`, `017a`. `017a` aliases
  the legacy backend names in `_schema_migrations` — idempotent on fresh DBs.
  `020` widens `activity_log` CHECK to accept `entity_type='work_hours'`.
  `021` adds nullable `contractor_hours_worked` + `contractor_avg_employees`
  on `work_hours` (ISO 45001 / Cority parity).
- **Demo accounts** (all `password123`):
  - `priya@sdsmanager.com` (admin, COO of SDS Manager Inc., id=13) — primary admin test account
  - `elena@sdsmanager.com` (ehs_manager, multi-framework: OSHA 300/300A/301 + RIDDOR)
  - `marcus@sdsmanager.com` (supervisor), `james@sdsmanager.com` (ehs_manager Sheffield),
    `mehta@sdsmanager.com` (ehs_officer), `wendy@sdsmanager.com` (worker)
  - `acme@sdsmanager.com` — empty Acme Manufacturing org, OSHA-only US (onboarding showcase)
  - `riddor-test@example.com` — empty UK org, RIDDOR-only
  - `sydney-test@example.com` — empty AU org, SafeWork-NSW-only (no Reports card yet — RG1 open)
- **Dev servers:** `cd server && node --watch index.js` (BE :3001) +
  `cd client && npm run dev` (FE :5173).

### Next session priority

**P3-OB3 — document versioning.** Supersede a doc with a new file, keep an
immutable audit trail of prior revisions. Industry standard for ISO 9001
+ OSHA records management. Inspectors on 1903 visits routinely ask "what
did this SDS / SOP / certificate say on date X" — must be answerable.

**Locked design decisions** (the auto-memory file `project_state.md` has
the full rationale — read before starting):

1. New `document_versions` table (mig 022). Each version is an immutable
   row. The `documents` table keeps name/type/number stable; file-shaped
   fields move to versions. Backfill v1 from each existing document so
   reads always resolve to ≥1 version.
2. Keep every uploaded file on disk forever — never overwrite, never
   delete. Inspector defensibility.
3. References (entity_links) auto-follow to the latest version. No
   version-pinning in v1.
4. Elevated-role gate (same as existing upload).
5. UX placement: inline expandable section on `DocumentsList.jsx`
   per-row. NOT a new DocumentDetail page. Reuse `.activity-feed` /
   `.act-item` styles, no new CSS.

**Files to read END TO END before any edit** — none are warm:

- `server/db/migrations/001_phase2_tables.sql` (documents table top)
- `server/routes/documents.js`
- `server/middleware/upload.js` (multer storage path + naming convention)
- `server/routes/attachments.js` (sister polymorphic table; pattern
  reference, NOT the same model)
- `server/routes/folders.js`
- `client/src/api/documents.js`
- `client/src/pages/documents/DocumentsList.jsx`
- `server/services/audit_actions_catalog.js` (extend with
  `document_superseded`)

**Proposed shape** (verify against current schema first):

```sql
-- mig 022
CREATE TABLE document_versions (
  id PK,
  document_id FK documents(id) NOT NULL,
  version_number INTEGER NOT NULL,
  file_url, stored_filename, mime_type, size_bytes,
  uploaded_by FK users(id) NOT NULL,
  notes TEXT,                  -- "Updated cover image"
  created_at,
  UNIQUE(document_id, version_number)
);
-- + INSERT v1 backfill for every existing document row.
```

```
POST /api/documents/:id/versions          → multer upload, +1 version,
                                            writes document_superseded
GET  /api/documents/:id                   → extended: include versions[]
                                            (DESC by version_number)
GET  /api/documents/:id/download          → still serves LATEST
GET  /api/documents/:id/versions/:vid/download → serves historical
```

**Start order:** read every file in the list above → confirm decisions
still hold with the user → BE commit (mig + supersede route + GET
extension + audit catalog) → curl-test thoroughly → push → STOP and
report → user confirms API surface → FE commit (inline version list
on DocumentsList row) → push.

**After this slice, P3-OB3 is closed.** Next roadmap candidate:
P3-OB1 (first-login walkthrough), P3-OP1 (asset maintenance), or
P3-RG1 (AU regulator) — pick with the user.

### Other files cold / never read end-to-end in recent sessions

Carryovers from prior merges + the latest one from main:
- **Voice report feature (`b2e6a9f`, just merged 2026-05-11)** — adds
  `client/src/components/voice/{GlobalVoiceFab,VoiceBottomSheet,VoiceReviewCard}.jsx`
  + `voiceFieldConfig.js` + `hooks/{useAudioRecorder,useSpeechRecognition}.js`
  + `styles/voice.css` (602 lines) + `server/services/{gemini_extract,gemini_transcribe}.js`
  + modifications to `App.jsx`, `TopBar.jsx`, `AppContext.jsx`, `ReportWizard.jsx`,
  `VoiceIntakeModal.jsx`, `api/incidents.js`, `routes/incidents.js`. BE was
  tested via PR #11 curl smoke; FE not click-tested.
- `server/services/closure_gates.js` — ISO 45001 / OSHA / ANSI Z10 closure gates
- `server/services/notifications.js` — backend-side notification creation
- `client/src/pages/incidents/IncidentDetail.jsx` — main's consolidated cards
- `client/src/pages/capas/CAPADetail.jsx` — main's hero-card redesign
- `client/src/pages/incidents/modals/{ClosureChecklistModal,ClosureApprovalModal,ReopenModal}.jsx`
- `client/src/pages/capas/UpdateProgressModal.jsx`
- `client/src/pages/templates/{TemplatesList,TemplateEditor}.jsx`
- `client/src/pages/inspections/{InspectionsList,InspectionEditor,InspectionReport}.jsx`
- New onboarding files from earlier main merge (`SignupOrg.jsx` redesign,
  `OnboardingFirstSite.jsx`, `components/shared/OnboardingIllustrations.jsx`)
- **Responsive commit `6051395`** — Sidebar mobile drawer + 8 page-CSS
  media queries. Diff was read; live mobile rendering not tested.


---

## Open work — Phase 3

### Onboarding + data import
- [ ] **P3-OB1** User onboarding flow — first-login walkthrough, sample-data toggle, role-tailored "what to do first".
- [x] **P3-OB2** CSV import — users / sites / assets / work_hours **all done** (`e30954d` `57db454` `7388574` `fb8fc8f`).
- [ ] **P3-OB3** Document versioning — supersede a doc with a new file, audit trail of prior revisions.

### AI assistance
- [ ] **P3-AI1** Auto-fill investigation (AI + manual) — five-Why suggestions, root-cause prompts, contributing-factors checklist, recommended CAPAs.
- [ ] **P3-AI2** Prompt-driven autofill — system asks targeted questions ("Was the press locked out?"), AI normalizes free-text answers into structured fields.
- [ ] **P3-AI3** Video → incident report — extend voice intake to accept video. Pipeline: video → audio → transcript → existing `services/voice_extract.js` → confirmation UX.

### Operational features
- [ ] **P3-OP1** Asset maintenance — schedules, due dates, last-done, escalation to CAPA when overdue.
- [ ] **P3-OP4** Scheduling — recurring inspections, calibrations, training, walkthroughs; calendar view + reminders.
- [ ] **P3-OP5** Risk register / risk assessment — *proactive*: identify hazards at sites/assets, assess L×C, mitigations, periodic review, link to incidents/CAPAs. Distinct from the post-event 5×5 in `ReportWizard.jsx`. Likely needs `risks` + `risk_assessments` tables, `risk_review_due`, entity_links wiring. Big enough to be its own phase — scope before starting.

### Regulatory
- [ ] **P3-RG1** Australian regulation — third regulator alongside US OSHA + UK HSE. Add `country='AU'` on sites + Safe Work Australia notifiable-incident workflow. Per-state WHS Acts (NSW WHS s38, Vic OHS Act 2004 s37) with different categories (death / serious injury / dangerous incident) and notification deadlines (immediately for death/serious, written follow-up 48h–7d). Schema: likely `notifiable_incidents` table (incident + state + category + phone_notified_at + written_submitted_at + reference_number). New Reports card. Per-state deadline tracking on dashboard. **Closes the `safework_nsw` framework loop** — currently has no Reports card.
  - When RG1 lands, extend `client/src/utils/frameworks.js` with `showSafework` (one-line addition; pattern shipped 2026-05-08 in `2e8daa7`).

### Smaller open follow-ups
- **work_hours deferred items** (sellable-tier + next-tier polish):
  - **Parent-site rollup** — on a parent site (parent_id hierarchy from P3-N1),
    show recursive sum of all descendant work_hours. Read-only widget;
    distinct from per-site rates (rates don't aggregate cleanly through a
    weighted parent because contractor mix differs). ~30 min.
  - **Period-overlap warning** — currently `UNIQUE(site_id, period_start)`
    enforces "no two periods start on the same day"; doesn't catch
    overlapping ranges (e.g. Jan-Feb + Feb-Mar fine, but Jan-Feb +
    Jan15-Feb15 is silently accepted). Add overlap check to
    `validateRow` + the manual POST/PATCH paths.
  - **Rolling-12-month aggregate** + sparkline on SiteDetail — most enterprise
    EHS dashboards show a 12-month trend chart. Cheap once we add a
    `?range=rolling12` mode to `/api/reports/site-metrics`.
  - **Multi-denominator support** — OSHA 200K is hard-coded. UK HSE / RIDDOR
    convention uses 100K-employee-hours; ILO uses 1M. Surface as a setting on
    the org or as a per-card toggle.
- Body-parts editor for UX-C — BodyMap3D integration outside the wizard.
- Real invitation/email flow (slice 2 of P3-O1) — needs `invitations` table + token + email service.
- Org rename / archive UI.
- Per-answer inspection-item logging (P3-A1 deferred #9) — route's `status='in_progress'` guard returns 409 for completed inspections, so successful mutations can't reach an audit-worthy state. Code comment in `inspections_routes.js` documents where to add logging.
- Verb normalization across activity_log actions (P3-A1 deferred #10) — cosmetic; would touch every existing log call site.
- F6.2 — manual end-to-end demo walkthrough.

---

## Done — Phase 2

Waves 1–6 + Wave 7. Foundation (migrations + multer + Anthropic SDK), Site/Asset/Document/EntityLink CRUD, Incident extensions (body parts, anonymous toggle, stop-work, recordability verification), CAPA polymorphic, Voice intake (Anthropic tool-use), Polish + seed, Custom asset fields per category. Full commit history on `git log`.

## Done — Phase 3

| Item | Description | Commit(s) |
|---|---|---|
| P3-N1 | Site detail page + parent_id hierarchy (mig `015`) | `25ad9af` |
| P3-N2 | Document folders + DnD | `12862f8` |
| P3-N3 | Document inline preview | `1873bb2` (main) |
| P3-L1 | Back-tracking everywhere — `referencesFor()` + `<ReferencedByCard>` + `<AddLinkModal>` | initial + `8b3359d` |
| P3-L2 | Media on investigations | `e75e8ce` + `77a2eab` |
| P3-A1 | Activity-log widening (`013`+`014`) + `services/activity_log.js` + audit CSV export + Reports tab | 4 chunks |
| P3-O1 | Org sign-up + onboarding (mig `018`+`019`); compliance_frameworks multi-select; Reports filter | `b72bd6c` `650a2e8` `8f3b01c` `37e6826` |
| P3-O2 | Members management — admin-gated CRUD; auth re-checks `is_active` per request; shared validators | `7aafa99` `8f3b01c` |
| P3-OP2 | Inspection module (mig `008`+`009`) | `918279a` (main) |
| P3-OP3 | Templates with versioning | `918279a` (main) |
| OSHA/RIDDOR gating | `frameworkVisibility(user)` helper; gated 6 surfaces (IncidentDetail, InvestigationDetail, InvestigationsPage, Dashboard, ReportWizard) | `2e8daa7` |
| P3-OB2 (users) | Generic `csv_import.js` engine + users adapter; admin-only; dry-run + atomic commit; Members.jsx button | `e30954d` + `d8d6803` (modal fixes) |
| P3-OB2 (sites) | Sites adapter (parent_name resolves to parent_id, two-pass for in-file parent refs, cycle/depth re-checked at insert); generic `<ImportModal>` extracted; users adapter consistency fix | `57db454` |
| P3-OB2 (assets) | Assets adapter (display_id case-insensitive uniqueness; asset_type → category resolution; v1 skips custom_fields); button on AssetsList | `7388574` |
| P3-OB2 (work_hours) | Migration `020` widens `activity_log` CHECK; `routes/work_hours.js` adapter mounted at `/api/work-hours`; ISO date validation w/ calendar round-trip; UNIQUE(site_id, period_start) collision detection; second "Import work hours" button on `/admin/sites` | `fb8fc8f` |
| P3-OB2 (work_hours surfaces) | Mig 021 contractor split; manual CRUD + CSV export at `/api/work-hours`; new `WorkHoursModal` + periods card on SiteDetail (year-group, YoY delta, weighted avg employees); TRIR/DART/LTIR/Severity Rate live from `work_hours`; rate cards on SiteDetail + Dashboard org-wide rollup; dropped `sites.total_hours_worked` form inputs + writes (column kept as legacy/no-op) | `db5c483` `4d15011` `9849e60` `a47615b` `3848029` |
| Priya admin demo | Seeded admin user in SDS Manager Inc. + first row in Login.jsx DEMO grid | `dd94fe4` |

## Done — UX backlog

| Item | Description | Commit |
|---|---|---|
| UX-A | Post-report attachments | `ba14826` |
| UX-B | Inline notes on activity timeline | `31f8be7` |
| UX-C | Inline-edit description / area / department + PATCH activity log (body-parts deferred) | `ff465d8` |
| UX-D | Witness CRUD post-creation | `d87ea04` |
| UX-E | Severity override modal | `dffaf1f` |
| UX-F | Global search jump-to in TopBar | (earlier) |
| UX-G | CAPA due-date color coding | `48ca9b2` |
| UX-H | Cross-page stop-work banner | `48ca9b2` |

---

## Architectural decisions worth knowing

- **Single-org-per-user.** `users.email` is globally UNIQUE. No `org_memberships` table, no "active org" concept. JWT carries one `org_id`. Switching orgs would require a schema rebuild (drop UNIQUE on email + add `org_memberships`).
- **No real invitation flow.** Admin creates users directly via `POST /api/users` with email + initial password, hands credentials off out-of-band.
- **`primary_regulator` is dead schema.** Replaced by `compliance_frameworks` JSON array. Column kept (SQLite DROP COLUMN is expensive). Never read or write `primary_regulator`.
- **6 framework codes** whitelisted in `server/routes/auth.js` `VALID_FRAMEWORKS`: `osha_300 / osha_300a / osha_301 / riddor_f2508 / safework_nsw / generic`. Adding a new framework needs touches in: `VALID_FRAMEWORKS`, `client/src/pages/SignupOrg.jsx` `FRAMEWORKS`, `client/src/pages/Settings.jsx` `FRAMEWORK_LABELS`, `client/src/pages/reports/ReportsPage.jsx` `requiresFramework`, and (for incident-side gating) `client/src/utils/frameworks.js`.
- **Admin-mutation guardrails on users** (`server/routes/users.js`): admin-only allowlist; self-edit block on role + is_active; last-admin lockout. `authMiddleware` re-checks `users.is_active` per request via cached prepared statement — deactivation revokes JWT instantly.
- **Shared validators** in `server/services/validators.js`: `validEmail()`, `checkLen()`, `checkPassword()` + caps (`NAME_MAX=100, EMAIL_MAX=254, PASSWORD_MIN=8, PASSWORD_MAX=72, NAICS_MAX=32`). New input-accepting routes should import these.
- **Activity logging:** `server/services/activity_log.js` exposes `writeActivity()` + `diffFields()`. Use for any audit-relevant mutation. `entity_type` CHECK accepts: `incident, investigation, capa, system, template, inspection, asset, document, folder, site, user, link, asset_category, answer_set, organization`.
- **List endpoints disagree on search param:** `incidents/investigations/capas/inspections` use `search`; `assets/documents` use `q`. Send both for cross-endpoint search.
- **Migration collisions** (both branches numbered the same migration in parallel): renumber yours upward and add a letter-suffixed fixup (e.g. `017a_…`) that aliases the legacy filename in `_schema_migrations`. Mirrors `014a_normalize_site_hierarchy_name.sql` and `017a_rename_legacy_org_migrations.sql`. Idempotent on fresh DBs.

---

## Operating norms

- Treat as an actual app, not hackathon polish.
- Each task = one focused commit + push to `origin/backend`.
- Always leave dev servers running so the user can click-test.
- Don't claim FE success without exercising the UI; "Vite transforms cleanly" is not proof.
- **Never override or overdo UI/UX** — reuse existing classes/tokens; no new CSS or inline styles unless the feature genuinely needs them, in which case ask first. Page-scoped CSS uses prefixes (`idet-`, `invd-`, `dp-`, `tp-`, `ie-`, `sd-`, etc.).
- **After every multi-step Edit on JSX/JS**, verify the file actually parses — run `cd client && npx vite build` or grep the Vite log for "SyntaxError"/"Failed to" lines, not just timestamp markers.
- **For merges from main with both backend + UI/UX changes:** prefer default merge with manual resolution over `-X theirs`. The latter silently dropped a `useRef` import on a prior merge.
- **Read schema before referencing columns.** Don't trust grep summaries for files in the "re-read cold" list above.

---

## Quick re-orientation for a fresh session

1. Read this file. Most recent session at the bottom.
2. `git fetch origin && git status` — `backend` should be at `9d1faf8`
   (or +1 if this roadmap commit landed), working tree clean.
   `origin/main` lags by ~12 backend commits which are awaiting PR #11
   review/merge.
3. Boot servers (`cd server && node --watch index.js` BE :3001;
   `cd client && npm run dev` FE :5173). Login as priya (admin, COO)
   for the broadest admin exercise, elena (ehs_manager, multi-framework)
   for broad EHS work, or one of the empty test orgs (acme / riddor-test
   / sydney-test) to see framework-gated UI + empty-state behaviour.
4. The auto-memory file `project_state.md` (in your home memory dir)
   has detailed locked design decisions for the next slice. Read it.
5. For new work in any cold file (see "Other files cold" below), read
   it top-to-bottom before editing.
6. Ask the user which P3 item to pick up if unclear. Don't guess.

---

## Recent session log

### 2026-05-11 — Activity timeline forensics, audit log polish, main merge, PR #11

Two themes shipped + main merged + PR #11 opened. Six commits on backend,
one merge from main.

| Area | What changed | Commit |
|---|---|---|
| AssetDetail Activity | Tab was a hardcoded stub ("will be tracked here"); now renders the real audit trail. `GET /api/assets/:id` returns `asset.activity`. FE reuses Dashboard's `.activity-feed`/`.act-item` classes — no new CSS. | `7531fa5` |
| SiteDetail Activity | No timeline anywhere previously; new Activity card surfaces both `site_*` and `work_hours_*` entries scoped by site_id (joined via `json_extract(metadata,'$.site_id')` for work_hours rows). Auto-refreshes after Add/Edit/Delete/Export. | `9ab8b16` |
| UTC timestamp bug | Every server timestamp was off by browser UTC offset (Asia/Dhaka rendered just-now rows as "6h ago"). SQLite's `datetime('now')` returns 'YYYY-MM-DD HH:MM:SS' UTC with no `Z`; JS parsed it as local time. New `parseServerDate()` in `time.js` treats untimezoned strings as UTC. Fixes activity timelines, timeAgo across the app. 7 other direct `new Date(server_str)` call sites remain (cosmetic; logged as a sweep). | `4825251` |
| Audit log filter bug | Picking "incident.created" visually checked `capa.created` and `investigation.created` because the React key was the bare action name. Composite `entity_type\|action` keys on the FE + new `entity_action_pairs` BE filter that ORs precise pairs. Plus added `organization` + `work_hours` to entity_types dropdown; jargon types relabelled ("Inspection answer set" not "answer_set"). | `974130b` |
| Audit actions catalog | Picker was DB-distinct only — 17 of 83 known pairs visible. New `audit_actions_catalog.js` (canonical 83 pairs); BE endpoint now returns catalog UNION DB counts so fresh tenants can filter "every CAPA closure" with 0 results instead of "completed" being absent from the dropdown. | `a90a9ed` |
| Merge from main | Brought in `b2e6a9f` (global voice report, +2982 lines, new `@google/generative-ai` dep) and `bb0fca3` (ReferencedByCard fix). Default merge, zero manual conflicts (only auto-merge on `server/index.js`). Server fresh-restart required after npm install. All my endpoints verified intact post-merge. | `9d1faf8` |
| PR #11 | Opened backend → main. 12 commits scoped. Click-test punch list in PR body. Awaits review. | — |

**Honest hallucination flags:**
- Dashboard layout iteration earlier showed my visual-rendering judgement is unreliable. Three swings at the 6-card squeeze (4+2, 3+3, revert) before user said "revert to first design." All FE work this session was build-clean but not browser-tested.
- The new asset Activity tab + Site Activity card + audit log picker
  changes haven't been opened in a browser.

### 2026-05-08 (evening) — work_hours industry-standard surfaces (Sellable tier)

Five focused commits closing P3-OB2 at sellable tier — what every serious EHS
buyer expects (TRIR/DART/LTIR/Severity rate cards, live OSHA 300A, contractor
split, year-group/YoY, CSV export). Decisions locked at start: Sellable tier
scope, drop `sites.total_hours_worked` reads + form inputs, weighted-by-period
avg employees. Per-employee timesheet shape considered and rejected (industry
standard is per-site aggregate).

| Area | What changed | Commit |
|---|---|---|
| BE: manual CRUD + mig 021 + CSV export | Mig 021 adds `contractor_hours_worked` + `contractor_avg_employees` (nullable) on `work_hours`. Validation factored out of the CSV adapter into module-level helpers (`validateRow`, `parseNonNegInt`, `loadExistingKeys`, `isIsoDate`). Manual routes: `GET/POST/PATCH/DELETE /api/work-hours` + `GET /api/work-hours/export.csv` — all elevated, all org-scoped via the site, all `writeActivity()` audited. CSV import + template extended with optional contractor columns. 16 curl tests including UNIQUE collision, cross-org 404, calendar-round-trip date check, period_end > period_start, PATCH UNIQUE-self-exclude, worker-role 403 on POST/PATCH/DELETE with GET allowed. | `db5c483` |
| FE: api module + modal + SiteDetail rebuild | `client/src/api/workHours.js` (manual CRUD + export client). `client/src/pages/admin/WorkHoursModal.jsx` (new, `createPortal` per `.page` transform constraint). On Add when prior periods exist, fields auto-fill from latest period; dates advance by same duration ("copy from prior period" UX). SiteDetail.jsx work hours section rebuilt: year-grouped periods table with subtotal rows + weighted avg employees + contractor totals + YoY ▲/▼ delta pill computed against prior year. Per-period Edit/Delete affordances (elevated only). Export CSV uses fetch+blob+click pattern (axios doesn't ride plain anchors). Reuses `.tbl/.modal-*/.field/.btn/.pill/.icon-btn/.stat-grid` — no new CSS. | `4d15011` |
| BE: switch metrics + reports to live SUM | metrics.js drops `sites.total_hours_worked` read; computes weighted avg employees by `julianday()` period length, contractor totals (separate fields, never folded into TRIR), and adds LTIR field. Divide-by-zero now correctly returns 0 (was producing astronomical rates with `\|\| 1` fallback). reports.js `/osha-300a` returns live SUM in `total_hours_worked` response key (FE shape preserved). New `GET /api/reports/site-metrics` for embed components. SiteDetail.jsx adds "Safety performance" card with year picker + 4 stat-cards (TRIR/DART/LTIR/Severity Rate) + caption row citing OSHA 200K denominator + hours/period/contractor context. Verified site 1/2026 with 3 cases / 171,164 hours: TRIR=3.51, DART=1.17, LTIR=1.17, SR=3.51 — match hand-computed 200K rates. | `9849e60` |
| Cache cleanup: drop form inputs + writes | sites.js POST/PATCH/CSV-import drop `total_hours_worked` from accepted body, INSERT, audit fields, updatable allowlist, template, parse, INSERT. Sites.jsx form input + initial state + populate + PATCH payload + table column + inline calc strip removed. OnboardingFirstSite.jsx field removed. SiteDetail.jsx sub-sites column swaps "Hours/yr" for "Time zone" (was about to show stale 0). Schema column kept as legacy (DROP COLUMN expensive on SQLite); seed.js writes are harmless no-ops. Final grep: no remaining reads in routes/ or services/. | `a47615b` |
| Dashboard org-wide rate cards | `calculateOrgMetrics(orgId, year)` sums hours + cases across every org site, applies OSHA 200K denominator once at the org level (averaging per-site rates would weight a 50-emp sub-site equally with a 500-emp plant — wrong). dashboard.js drops the legacy single-site code path. Dashboard.jsx adds 2 new KPI widgets (kpi_ltir reuses `.kpi-dart` accent, kpi_severity reuses `.kpi-overdue`); 6 cards total. DART/LTIR/Severity foot lines now show backing case/days context. Verified Priya's org: 298,020 hours / 3 cases / 1 days-away → TRIR=2.01 DART=0.67 LTIR=0.67 SR=2.01 (matches DB). Empty tenant (acme) returns all 0 — no NaN. | `3848029` |

**BE testing depth (high):** every route exercised end-to-end with curl across
20+ test cases. All metrics hand-verified against SQL aggregations.

**FE testing depth (medium-low):** every commit `npx vite build` clean
(189 modules transformed), Vite proxy routes work end-to-end (curl through 5173
returns BE responses). Did NOT click-test in a browser. Honest hallucination
risk: medium on FE — five files modified across two pages and a new modal
without browser verification of the rendered output. Punch list for next
session in "Next session priority" above.

**PR #11 not yet opened.** Slice ready for backend → main once user
click-tests.

### 2026-05-08 (afternoon) — OSHA/RIDDOR gating + Priya admin + P3-OB2 (full) + main merges

Long session, ~3hr. Nine commits + two PRs round-tripped. P3-OB2 closed in full
(users + sites + assets + work_hours all on the shared engine).

| Area | What changed | Commit |
|---|---|---|
| OSHA/RIDDOR gating | New `client/src/utils/frameworks.js` mirrors ReportsPage's defensive-fallback pattern. Gates 6 surfaces by org's `compliance_frameworks`. | `2e8daa7` |
| Roadmap compress | 330 → 195 lines. Done items become one-line entries with commit SHAs. | `3c18b63` |
| Priya admin demo | Seeded admin in SDS Manager Inc. + first row in Login.jsx DEMO grid. Direct-inserted into running dev DB (id=13) so it works without SEED_FORCE rebuild. | `dd94fe4` |
| P3-OB2 users | New `server/services/csv_import.js` engine; users adapter inline in `routes/users.js`. Strict template, admin-only, dry-run + atomic commit. New dep `csv-parse@^6.2.1`. ImportUsersModal on `/admin/members`. | `e30954d` |
| ImportUsersModal fixes | File re-pick (clear input value after read), close-during-commit guarded by `safeClose`. | `d8d6803` |
| Merge from main (PR #10's pre-cursor) | UI/UX overhaul (`fd3d165`): signup wizard redesign + 567-line OnboardingIllustrations + 509-line members.css + members page redesign + eye/eyeOff toggle. Design precedence to main on conflicts; backend functionality preserved (Priya kept as DEMO admin since main's `admin@sdsmanager.com` reference points at non-existent user). | `1849051` |
| PR #9 (backend → main) | Round-tripped. | merge `669be3c` |
| P3-OB2 sites + ImportModal generic | Sites adapter mounted on the engine. Modal extracted to `client/src/components/shared/ImportModal.jsx` parameterized by `{title, subtitle, helperText, templateUrl, templateFilename, importFn, entityNoun}`. Members + Sites both use it now. Users adapter consistency fix bundled (mixed-error duplicate detection). | `57db454` |
| P3-OB2 assets | Assets adapter — display_id case-insensitive uniqueness, asset_type → category resolution, custom fields skipped in v1. AssetsList "Import CSV" button between "Asset types" and "+ New asset". | `7388574` |
| PR #10 (backend → main) | Round-tripped. Maintainer also pushed `6051395` "responsive: full mobile/tablet support" between PR #10 merge and my fast-forward — fast-forwarded into backend post-merge. | merge `7a8f72e` + ff `6051395` |
| Roadmap tick | OB2 done for users + sites + assets; session entry added; old "(later)" mini-entry merged in. | `beeda7b` |
| P3-OB2 work_hours | Migration `020` widens `activity_log` CHECK; `routes/work_hours.js` adapter mounted at `/api/work-hours`; ISO date format with calendar round-trip (Feb 30 rejected); UNIQUE(site_id, period_start) collision detection (in-file + against DB); second "Import work hours" button on `/admin/sites`; full activity log with thousands-formatted hours descriptions. **Closes P3-OB2 entirely.** Per-site aggregate (industry standard) — per-employee was considered and rejected. | `fb8fc8f` |

**BE testing depth (high):** every adapter exercised end-to-end with curl
across 26+ test cases including CRLF / BOM / Unicode / quoted commas /
case-insensitive collisions / cross-org isolation / atomic rollback /
20-row batch / late conflict simulation / role gating. All green.

**FE testing depth (medium):** maintainer click-test passed for /admin/members,
/admin/sites, /assets after PR #10 merge. Wider responsive verification
(mobile/tablet at 768/480 breakpoints from `6051395`) not done by me.

**Hallucination-risk notes for next session:**
- `6051395` responsive commit: read the diff, didn't browser-test.
- The `<ImportModal>` is the modal pattern for any future bulk operations —
  reuse before re-implementing.
- `csv_import.js` engine is the canonical place to extend for new entities.
  Adapter pattern: `{entityName, headers, validateRow, insertRow, onAllInserted}`.

### 2026-05-08 — Reports framework filter + merge-from-main + PR #8

Two pieces of work + one round-trip PR.

| Area | What changed | Commit |
|---|---|---|
| Reports cards filter by `compliance_frameworks` (closes P3-O1/O2 follow-up) | Each regulator card declares `requiresFramework` (`osha_300/300a/301/riddor_f2508`); `useMemo`-based `visibleReports` + tab-fallback effect; empty-state copy when no cards visible; defensive fallback for missing/empty frameworks. | `37e6826` |
| Merge from `origin/main` | 8 commits (OSHA compliance fields + 301 form + notifications, tiered closure workflow + ISO 45001 gates, hooks fix, animated logo, CAPA hero redesign, IncidentDetail consolidation, ReferencedByCard inline). UI/UX wins on conflicting hunks; backend logic preserved. | `8c9ac40` |
| Migration collision resolved | Renumbered backend's `016` → `018` and `017` → `019`; new `017a_rename_legacy_org_migrations.sql` aliases legacy names in `_schema_migrations`. Idempotent on fresh DBs. | `8c9ac40` |
| PR #8 (backend → main) | Merged, fast-forward-pulled. `origin/backend == origin/main == 36a564f` at end of session. | merge `36a564f` |

Two manual conflicts: `Register.jsx` (kept backend's invite-only stub) and
`ReportsPage.jsx` (merged main's new osha301 card with backend's `requiresFramework` gate).

**Honest hallucination report:** BE low risk (curl-tested per user/org). FE
medium-high risk — heavy main-side refactors auto-merged but never opened in a
browser. See "Files to re-read cold" in Current state.

### Earlier sessions (compressed)

- **2026-05-07 (later evening)** — P3-O1 (org sign-up + onboarding showcase, mig `018`+`019`) + P3-O2 (members management) + audit-fix pass (auth re-checks `is_active`, shared validators). Commits `b72bd6c` / `650a2e8` / `7aafa99` / `8f3b01c`.
- **2026-05-07** — UX-C/D/E + P3-L1 closure (link/unlink + missing CSS). Merged 7 commits from main (investigations redesign, ComboBox/SmartTextarea, accessibility). Commits `f313722` / `dffaf1f` / `ff465d8` / `d87ea04` / `8b3359d`.
- **2026-05-06 (afternoon → evening)** — P3-N2 doc folders + seed-PDF fix + investigation link-modal repair + P3-L2 media on investigations. PRs #5 + #6. Folded in main's templates/inspections + Drive-style preview + premium UI overhaul. Commits `12862f8` / `e75e8ce` / `77a2eab` / `ab2313f`.
- **2026-05-06 (earlier)** — P3-N1 site detail + hierarchy (mig `015`), P3-L1 prototype, P3-A1 four chunks (foundation / admin gaps / export endpoint / polish). Pulled main's dashboard customization + assets/incidents redesigns. Roadmap items P3-AI3 / P3-OP5 / P3-RG1 added.
- **Earlier** — Phase 2 waves 1–7, UX-A/B/F/G/H. All commit history visible via `git log`.
