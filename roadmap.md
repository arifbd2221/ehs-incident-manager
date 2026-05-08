# EHS Incident Management — Roadmap

Live status for what's open, what's done (with commit SHAs), and how to operate
on this codebase. Done items are one-line entries; `git show <sha>` recovers
the full detail. Most recent session entries at the bottom.

---

## Current state

- **Branch:** `backend` at `fb8fc8f` (plus this roadmap update). 2 commits ahead of
  `origin/main` at `6051395` — work_hours CSV slice not yet PR'd to main.
  Two PRs merged this session: #9 (UI/UX overhaul merge), #10 (P3-OB2 sites + assets).
  Main added `6051395` (responsive mobile/tablet support) which fast-forwarded into
  backend post-PR #10 merge.
- **Phase 2:** code complete (only F6.2 manual demo walkthrough open).
- **Wave 7:** E7.1 (custom asset fields per category) done.
- **UX backlog A–H:** done. UX-C body-parts editor deferred (needs BodyMap3D
  outside the wizard).
- **Phase 3 done:** N1, N2, N3, L1, L2, A1, O1, O2, **OB2** (users + sites + assets + work_hours),
  OP2, OP3.
- **Phase 3 open:** AI1, AI2, AI3, OP1, OP4, OP5, OB1, OB3, RG1.
- **Migrations applied:** 001–020 + letter fixups `014a`, `017a`. Final lexical
  order: 001 → 014 → 014a → 015 → 016_osha_compliance_fields → 017_closure_workflow
  → 017a_rename_legacy_org_migrations → 018_org_onboarding_fields → 019_compliance_frameworks
  → 020_activity_log_work_hours. `017a` aliases the legacy backend names in
  `_schema_migrations` — idempotent on fresh DBs. `020` widens `activity_log` CHECK
  to accept `entity_type='work_hours'`.
- **Demo accounts** (all `password123`):
  - `elena@sdsmanager.com` (ehs_manager, multi-framework: OSHA 300/300A/301 + RIDDOR)
  - `marcus@sdsmanager.com` (supervisor), `james@sdsmanager.com` (ehs_manager Sheffield),
    `mehta@sdsmanager.com` (ehs_officer), `wendy@sdsmanager.com` (worker)
  - `acme@sdsmanager.com` — empty Acme Manufacturing org, OSHA-only US (onboarding showcase)
  - `riddor-test@example.com` — empty UK org, RIDDOR-only
  - `sydney-test@example.com` — empty AU org, SafeWork-NSW-only (no Reports card yet — RG1 open)
- **Dev servers:** `cd server && node --watch index.js` (BE :3001) +
  `cd client && npm run dev` (FE :5173).

### Next session priority

**work_hours: industry-standard surfaces** — see "Smaller open follow-ups" below
for the full scoped breakdown. Storage + CSV import are done (`fb8fc8f`); next
slice adds the manual entry / edit / delete UI, periods-list display on
`/admin/sites/:id`, and switches OSHA 300A + rate calcs from reading
`sites.total_hours_worked` to `SUM(work_hours.hours_worked)`. ~1.5–2hr slice;
yellow zone. Per-employee shape was considered and rejected — industry
standard is per-site aggregate (VelocityEHS / Cority / Enablon all confirm).

### Files to re-read cold before extending

These were auto-merged from main and never read end-to-end this session:
- `server/services/closure_gates.js` — ISO 45001 / OSHA / ANSI Z10 closure gates
- `server/services/notifications.js` — backend-side notification creation
- `server/routes/incidents.js` — backend's witnesses + recordability + stop-work merged
  alongside main's closure_request / approve / reject / reopen
- `client/src/pages/incidents/IncidentDetail.jsx` — main's consolidated cards merged with
  backend's witnesses + edit affordances
- `client/src/pages/capas/CAPADetail.jsx` — main's hero-card redesign
- `client/src/pages/incidents/modals/{ClosureChecklistModal,ClosureApprovalModal,ReopenModal}.jsx`
- `client/src/pages/capas/UpdateProgressModal.jsx`
- `client/src/components/layout/TopBar.jsx` — also gets hamburger button + label `<span>` wraps from `6051395`
- **Responsive commit `6051395`** (2026-05-08) — `Sidebar.jsx` becomes a slide-in drawer at ≤768px;
  `AppContext.jsx` adds `sidebarOpen` / `setSidebarOpen`; `Icon.jsx` adds `menu`;
  8 page-CSS files get `@media` blocks at 768px + 480px. BE untouched. Diff was read
  but the live mobile rendering wasn't browser-tested.
- New onboarding files from main (`SignupOrg.jsx` redesign, `OnboardingFirstSite.jsx`,
  `components/shared/OnboardingIllustrations.jsx` — 6 SVGs) — read to verify P3-O1
  framework logic survived the redesign, but never opened in a browser.

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
- **work_hours: full industry-standard surfaces** (next-session priority). The CSV import + storage shape are done (`fb8fc8f`); what remains to match VelocityEHS / Cority / Enablon-tier behavior:
  - **Manual entry modal on `SiteDetail.jsx`** — "Add work hours" + per-row "Edit" / "Delete" affordances on a periods table. Single-period add via form (period_start, period_end, hours_worked, avg_employees, notes). New BE routes: `POST /api/work-hours`, `PATCH /api/work-hours/:id`, `DELETE /api/work-hours/:id` (all elevated; same UNIQUE collision check + activity log shape as the import endpoint already uses).
  - **Periods list on `SiteDetail.jsx`** — table showing every entered period for the site, sorted desc, with year-grouped subtotals. Replace or augment the existing aggregate display ("`SUM(hours_worked)`, `COUNT(periods)`").
  - **Wire OSHA 300A + rate calcs to read from `work_hours`** — currently OSHA 300A and any TRIR/DART surfaces read `sites.total_hours_worked` (a denormalized cache). Switch to `SUM(work_hours.hours_worked) WHERE site_id = ? AND period_start BETWEEN ? AND ?`. Keep `sites.total_hours_worked` populated as a derived cache (auto-update on every work_hours INSERT/PATCH/DELETE) OR drop reads of it entirely. Audit which queries touch it first: `grep -rn "total_hours_worked" server/ client/`.
  - **Dashboard rate widgets** (optional this slice) — TRIR / DART / severity-rate cards reading live from `work_hours`.
  - **Decision recorded:** per-employee timesheet shape was considered and rejected — VelocityEHS / Cority / Enablon all use **per-site, per-period aggregate** for OSHA 300A rate calc. Per-employee hours live in HRIS (Workday / ADP / SAP) and integrate via flat-file or API. Per-employee in EHS only makes sense for **industrial hygiene exposure tracking** (chemical / noise / radiation dose), which is a separate dose-tracking schema and out of scope for OSHA recordkeeping. Don't relitigate this in next session; this is the industry-standard pattern and it's what we've built.
  - Estimated scope: ~1.5–2 hr in a fresh session. Yellow zone.
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
2. `git fetch origin && git status` — `backend` should be at `2e8daa7`, working tree clean. `origin/main` lags by today's commit (not yet PR'd).
3. Boot servers (BE :3001, FE :5173). Login as elena (multi-framework) for the broadest exercise, or one of the empty test orgs to see framework-gated UI.
4. For new work in any "re-read cold" file (above), read it top-to-bottom before editing.
5. Ask the user which P3 item to pick up. Don't guess.

---

## Recent session log

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
