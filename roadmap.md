# EHS Incident Management — Roadmap

Live status for what's open, what's done, and how to operate on this codebase. Done items collapse to commit SHAs — `git show <sha>` recovers the full detail. Most recent session at the bottom.

---

## Current state

- **Branch:** `backend` at `e660b16` (WI-B chunk 6 FE) plus the docs/memory/roadmap commit landing this turn. Working tree clean (only `PRD.md` left untracked — owner reference doc).
- **`origin/main`** at `b3dbb08` (last known). Backend is many commits ahead: WI-A end-to-end + WI-04 series + WI-B series. Check `gh pr list` for current PR state.
- **PR #11** ✅ merged 2026-05-11.
- **Phase 2:** code complete; F6.2 manual walkthrough open.
- **Phase 3 done:** N1, N2, N3, L1, L2, A1, O1, O2, OB2, OB3, OP1, OP2, OP3.
- **Phase 3 open:** AI1, AI2, AI3, OP4, OP5, OB1. (RG1 superseded by PRD-remediation WI-06 SafeWork NSW.)
- **PRD-remediation done:** Chunk 1 (setup), Chunk 2 (WI-04), Chunk 3 (WI-10), Chunk 4 (WI-C), Chunk 5 (WI-A), Chunk 6 (WI-B).
- **Migrations applied:** 001–026 + letter fixups `014a`, `017a`, `023a`, `023b`, `023c`. Next available: **027**. (024 = WI-C hash chain; 025 = WI-A `affected_persons` + `injuries`; 026 = WI-B `classification_override_requests` + self-approval triggers.)
- **Demo accounts** (all `password123`): `priya@sdsmanager.com` (admin, SDS Manager Inc., org=1), `elena@sdsmanager.com` (ehs_manager, org=1, multi-framework — owns Sheffield UK site), `marcus`, `james`, `mehta`, `wendy`; plus empty test orgs `acme@sdsmanager.com` (admin, Acme Manufacturing org=2, OSHA US — used for cross-tenant tests), `riddor-test@example.com` (RIDDOR UK), `sydney-test@example.com` (SafeWork NSW AU).
- **Dev servers:** `cd server && node --watch index.js` (BE :3001) + `cd client && npm run dev` (FE :5173).
- **Test suites:** `server/scripts/wia-regression.sh` (78, 77 pass + 1 known F1 script bug), `server/scripts/wi04-e2e.sh` (49, all pass), `server/scripts/wib-e2e.sh` (42, all pass), `server/scripts/riddor-reg5-reg11.test.js` (23 `node:test`, all pass).

---

## PRD compliance remediation plan (active)

PRD-driven gap remediation is the active workstream. Owner directive 2026-05-11: additive features only; no structural changes to existing tables / columns / enums unless a specific regulation requires it (memory `feedback_no_structural_changes.md`).

**Docs in `docs/`:**
- `plan-2026-05-11.md` — authoritative scope + chunk order (verbatim owner directive).
- `gap-analysis.md` — PRD-vs-codebase audit with file/line cites.
- `implementation-plan.md` — work-item specs (WI-01 … WI-11, WI-A, WI-B, WI-C).
- `compliance-notes.md` — operational compliance posture (retention, GDPR, encryption-at-rest, `type_data` load-bearing keys, NSW site preservation, hallucination gates).

**Chunk order** (stop at every ✋ for owner review):

| Chunk | WI | Status |
|---|---|---|
| 1 | Setup (docs + memory + roadmap) | ✅ `8cd3093` |
| 2 | WI-04 RIDDOR Reg 5 + 11 + Reg 14(3) flag | ✅ `b0f8c53` (engine + 20 unit tests), `df44eb3` (Reg 5 reorder ahead of Reg 4 + Reg 14(3) flag), `3ac058e` (FE: wizard fields + `riddorCategoryLabel` map). 49-assertion E2E suite at `server/scripts/wi04-e2e.sh` — all pass. 23-test unit suite at `server/scripts/riddor-reg5-reg11.test.js`. |
| 3 | WI-10 Activity-log audit consistency | ✅ `67b8c9a` |
| 4 | WI-C Activity-log integrity (hash chain) | ✅ `2301521`, `b3343a0` |
| 5 | WI-A Multi-person incidents (full: routes + dual-write + wizard + modal + 7 reg fields + edit/delete + expander) | ✅ `12fbd8d` … `ace8816`. 78-assertion regression suite at `server/scripts/wia-regression.sh` — 77 pass / 1 known test-script bug (witnesses 201). |
| 6 | WI-B Override approval workflow | ✅ `7ee1983` (BE: migration 026 + service + routes + console.warn on direct PATCH + 42-assertion `server/scripts/wib-e2e.sh`), `e660b16` (FE: API client + OverrideRequestModal + RecordabilityVerifyCard pending-state banner + `/approvals` page + sidebar nav for elevated roles). |
| **7** | **WI-08 Deadline countdown UI** | **NEXT.** Pure presentation; reads existing `riddor_reports.written_deadline` + future WI-06/07 fields. No schema. |
| 7a | WI-D Jurisdiction-aware wizard + forms | Owner directive 2026-05-11 evening — gate fields by org's compliance_frameworks + site.country. Spec in `docs/implementation-plan.md`. WI-04 added a "UK RIDDOR edge cases" wizard card that WI-D should hide for non-UK orgs. |
| 8+ | WI-01 OSHA 300 PDF → WI-05 F2508 → WI-06 SafeWork NSW → WI-07 1904.39 → WI-02 300A+ITA → WI-09 Generic PDF | reorder allowed by gate readiness |

**Hallucination-risk gates** (memory `feedback_regulatory_truth.md`) — do NOT start without owner-supplied source material in `docs/regulatory-sources/`:
- WI-02 — OSHA ITA CSV upload template.
- WI-04 — ✅ DONE. Owner-provided SI 2013/1471 + HSE INDG453 used; verbatim text cited in code comments.
- WI-05 — HSE F2508 visual reference.
- WI-06 — WHS Act 2011 (NSW) s.36 / s.37 enumerations, official Notify SafeWork NSW form, ANZSIC code list.

---

## Next session priority

**CHUNK 7 — WI-08 Deadline countdown UI.** Pure presentation. Reads existing `riddor_reports.written_deadline` + future WI-06/WI-07 deadlines once those ship. Spec in `docs/implementation-plan.md` WI-08 section.

- New `client/src/components/incidents/DeadlineBadge.jsx` — countdown pill (red < 24h, amber < 72h, green > 72h, gray when past).
- `server/services/regulatory.js` extended to return aggregated `pending_deadlines: [{kind, deadline_at, status}]`. Sources: OSHA 1904.39 (after WI-07), RIDDOR 10-day/15-day (existing on `riddor_reports.written_deadline`), WHS 48-hour (after WI-06).
- New endpoint `GET /incidents/:id/deadlines`.
- Surfaced in `IncidentsList` rows and `IncidentDetail` header.

**Alternatives if WI-08 not desired next:**
- **WI-D jurisdiction-aware wizard** — FE-heavy, extends `client/src/utils/frameworks.js` with `jurisdictionForContext()` to gate the WI-04 "UK RIDDOR edge cases" card (currently visible to all orgs) plus the WI-A multi-person fields by org's `compliance_frameworks` + `site.country`.
- **WI-01 OSHA 300 PDF rendering** — first hallucination-gated PDF chunk; needs `pdfkit` dependency added.

**Smoke-test matrix** for any chunk: empty-org demo accounts `acme@sdsmanager.com` (OSHA-only US), `riddor-test@example.com` (RIDDOR-only UK), `sydney-test@example.com` (SafeWork-NSW-only AU), `priya@sdsmanager.com` (multi-framework SDS Manager Inc.).

---

## Phase 3 still open (non-PRD)

Items below pre-date the PRD-remediation plan. P3-RG1 has been superseded by **WI-06 SafeWork NSW** (functionally equivalent; just relabeled and tied to the PRD's NSW notification spec).

- **P3-OB1** — first-login walkthrough + sample-data toggle for empty tenants.
- **P3-AI1** — AI auto-fill investigation (five-Why suggestions, root-cause prompts).
- **P3-AI2** — prompt-driven autofill (system asks targeted questions, AI normalizes free-text).
- **P3-AI3** — video → incident report (extend voice intake to accept video).
- **P3-OP4** — recurring inspections / training / walkthroughs (reuses OP1 schedule + event pattern).
- **P3-OP5** — risk register / proactive risk assessment (needs its own scoping pass).
- **F6.2** — manual end-to-end demo walkthrough.

### Smaller open follow-ups
- **work_hours** — parent-site rollup; period-overlap warning; rolling-12-month + sparkline on SiteDetail; multi-denominator (200K / 100K / 1M).
- Body-parts editor for UX-C — BodyMap3D outside the wizard.
- Real invitation/email flow (slice 2 of P3-O1) — `invitations` table + token + email.
- Org rename / archive UI.
- Per-answer inspection-item logging (P3-A1 deferred #9).
- Verb normalization across `activity_log` actions (P3-A1 deferred #10).

---

## Done — high-level summary

Full commit history via `git log`. Tables below are kept for quick lookup of where a feature landed.

### Phase 2 (waves 1–7) — code complete

Foundation (migrations + multer + Anthropic SDK), Site/Asset/Document/EntityLink CRUD, Incident extensions (body parts, anonymous toggle, stop-work, recordability verification), CAPA polymorphic, Voice intake (Anthropic tool-use), Polish + seed, Custom asset fields per category.

### Phase 3

| Item | Commit(s) |
|---|---|
| P3-N1 site detail + parent_id hierarchy (mig `015`) | `25ad9af` |
| P3-N2 document folders + DnD | `12862f8` |
| P3-N3 document inline preview | `1873bb2` (main) |
| P3-L1 back-tracking — `referencesFor()` + `<ReferencedByCard>` + `<AddLinkModal>` | initial + `8b3359d` |
| P3-L2 media on investigations | `e75e8ce` + `77a2eab` |
| P3-A1 activity-log widening (`013`+`014`) + `services/activity_log.js` + audit CSV + Reports tab | 4 chunks |
| P3-O1 org sign-up + onboarding (mig `018`+`019`); `compliance_frameworks` multi-select | `b72bd6c` `650a2e8` `8f3b01c` `37e6826` |
| P3-O2 members management | `7aafa99` `8f3b01c` |
| P3-OP2 inspection module (mig `008`+`009`) | `918279a` (main) |
| P3-OP3 templates with versioning | `918279a` (main) |
| OSHA/RIDDOR gating | `2e8daa7` |
| P3-OB2 users / sites / assets / work_hours CSV import | `e30954d` `57db454` `7388574` `fb8fc8f` |
| P3-OB2 work_hours surfaces (mig `021` contractor split; TRIR/DART/LTIR/Severity; CSV export) | `db5c483` `4d15011` `9849e60` `a47615b` `3848029` |
| Priya admin demo seed | `dd94fe4` |
| P3-OB3 document versioning (mig `022`) — BE | `7af629b` |
| P3-OB3 preview-modal version timeline — FE | `897ac78` |
| P3-OB3 followups (block supersede on archived + reset file input) | `2d5262a` |
| P3-OP1 asset maintenance (mig `023` + `023a/b/c`) — BE | `d51f540` |
| P3-OP1 maintenance tab + `/maintenance` + KPI + detail modal — FE | `f2ff262` |

### UX backlog A–H

| Item | Commit |
|---|---|
| UX-A post-report attachments | `ba14826` |
| UX-B inline notes on activity timeline | `31f8be7` |
| UX-C inline-edit description/area/department + PATCH log (body-parts deferred) | `ff465d8` |
| UX-D witness CRUD post-creation | `d87ea04` |
| UX-E severity override modal | `dffaf1f` |
| UX-F global search jump-to in TopBar | (earlier) |
| UX-G CAPA due-date color coding | `48ca9b2` |
| UX-H cross-page stop-work banner | `48ca9b2` |

---

## Architectural decisions worth knowing

- **Single-org-per-user.** `users.email` is globally UNIQUE. No `org_memberships` table. JWT carries one `org_id`.
- **No real invitation flow.** Admin creates users directly; credentials handed off out-of-band.
- **`primary_regulator` is dead schema.** Replaced by `compliance_frameworks` JSON array. Never read or write `primary_regulator`.
- **6 framework codes** whitelisted in `server/routes/auth.js` `VALID_FRAMEWORKS`: `osha_300 / osha_300a / osha_301 / riddor_f2508 / safework_nsw / generic`. Adding a new framework touches `VALID_FRAMEWORKS`, `SignupOrg.jsx FRAMEWORKS`, `Settings.jsx FRAMEWORK_LABELS`, `ReportsPage requiresFramework`, `client/src/utils/frameworks.js`.
- **Admin-mutation guardrails on users** (`server/routes/users.js`): admin-only allowlist; self-edit block on role + `is_active`; last-admin lockout. `authMiddleware` re-checks `users.is_active` per request — deactivation revokes JWT instantly.
- **Shared validators** in `server/services/validators.js`: `validEmail()`, `checkLen()`, `checkPassword()` + caps.
- **Activity logging:** `server/services/activity_log.js` exposes `writeActivity()` + `diffFields()`. Use for any audit-relevant mutation. WI-C will extend the table with hash chain + IP/UA.
- **List endpoints disagree on search param:** `incidents/investigations/capas/inspections` use `search`; `assets/documents` use `q`. Send both for cross-endpoint search.
- **Migration collisions:** when both branches ship the same-numbered migration, renumber yours up + add a letter-suffixed fixup (`017a`, `014a` patterns) that aliases the legacy filename in `_schema_migrations`.
- **`incidents.type_data` JSON has load-bearing keys** for OSHA / RIDDOR / SafeWork NSW reports. See `docs/compliance-notes.md` §2 for the full list. Treat as schema.
- **Retention compliance** is satisfied by absence of deletion endpoints. See `docs/compliance-notes.md` §1.

---

## Operating norms

- Treat as an actual app, not hackathon polish.
- Each task = one focused commit + push to `origin/backend`.
- Always leave dev servers running so the user can click-test.
- Don't claim FE success without exercising the UI; "Vite transforms cleanly" is not proof.
- **Never override or overdo UI/UX** — reuse existing classes/tokens; no new CSS or inline styles unless the feature genuinely needs them; ask first.
- **After every multi-step Edit on JSX/JS**, verify the file actually parses — run `cd client && npx vite build` or grep the Vite log for SyntaxError lines, not just timestamp markers.
- **For merges from main** with both backend + UI/UX changes: prefer default merge with manual resolution over `-X theirs`.
- **Read schema before referencing columns.** Don't trust grep summaries for files in the "cold" list.
- **PRD-remediation chunks:** stop at every ✋ owner checkpoint. Do not silently expand scope across WIs. Propose schema/multi-file changes before writing them.

---

## Quick re-orientation for a fresh session

1. Read this file. Most recent session at the bottom.
2. Read `docs/plan-2026-05-11.md` (authoritative for current workstream).
3. `git fetch origin && git status` — `backend` should be at the latest commit, working tree clean.
4. Boot servers (`cd server && node --watch index.js`; `cd client && npm run dev`).
5. Auto-memory files (`MEMORY.md` index in `~/.claude/projects/.../memory/`) carry locked decisions. Read them — specifically `feedback_no_structural_changes.md`, `project_prd_chunks_2026_05_11.md`, `feedback_regulatory_truth.md`.
6. Ask the user which chunk to pick up if unclear. Don't guess.

---

## Recent session log

### 2026-05-12 (later) — WI-B override approval workflow shipped BE+FE; 42-assertion E2E suite

Chunk 6 closed in two BE/FE commits + a docs/memory follow-up:

| Commit | Scope |
|---|---|
| `7ee1983` | BE: migration 026 (`classification_override_requests` table + indexes incl. partial-UNIQUE on pending + two BEFORE INSERT/UPDATE triggers blocking `requested_by = decided_by`). Service module `server/services/classification_overrides.js` owns all state transitions with activity_log writes. Routes split into two routers (`incidentScopedRouter` + `globalRouter`) keeping URL space unambiguous. `console.warn` added to `PATCH /incidents/:id` when `osha_recordable`/`riddor_reportable` flipped directly. 4 audit verbs added to catalog. 42-assertion `server/scripts/wib-e2e.sh` — all pass. |
| `e660b16` | FE: `client/src/api/override_requests.js` (6 client wrappers). `OverrideRequestModal.jsx` (generic — works for both `osha_recordable` and `riddor_reportable`). `RecordabilityVerifyCard.jsx` rewritten to show pending-state banner inline with Approve/Reject (for elevated non-requester) or Withdraw (for requester); "Request override" button alongside "Re-verify". `/approvals` page with `apr-` prefixed CSS for the global pending queue. Sidebar nav item added with `elevatedOnly: true` flag — hidden for workers. |
| (this) | roadmap.md + memory updates; Chunk 7 (WI-08) queued as next. |

**Live end-to-end verified** (backend via wib-e2e.sh; frontend Vite-built + page-loads checked):
- Create request flow + 5 failure modes (missing reason, unknown field, duplicate pending, no-op proposed value, cross-tenant 404).
- Self-approval blocked at route AND DB trigger level (verified by raw SQLite UPDATE attempt failing with the trigger's RAISE message).
- Approve flips boolean + writes audit row with field_diffs.
- Reject leaves boolean unchanged + writes audit row.
- Withdraw blocks non-requester; allows requester.
- WI-C hash chain still verifies after all mutations.
- Worker → global queue 403; elevated → pending queue with new row.

**Test results:** wib-e2e 42/42; wi04-e2e 49/49; node:test 23/23; wia-regression 77/78 (F1 unchanged known script bug); Vite build clean.

**Servers running.** Branch `backend` at `e660b16` + this turn's docs commit.

### 2026-05-12 — WI-04 RIDDOR Reg 5 + 11 + 14(3) shipped BE+FE; 49-assertion E2E suite

Chunk 2 closed in three commits + a test-script follow-up:

| Commit | Scope |
|---|---|
| `b0f8c53` | Reg 5 + Reg 11 classification branches added to `services/riddor.js` (additive, after the existing Reg 4/6/7/8 logic). Reg paragraph numbers cited verbatim. 20-test `node:test` unit suite at `server/scripts/riddor-reg5-reg11.test.js`. |
| `df44eb3` | Owner-authorized branch reorder: inside `type === 'injury'`, Reg 6(1) fatality is checked first (applies to both workers and non-workers), then employment_status branches into Reg 5 (non-workers) or Reg 4 (workers). Adds `td.reg14_3_road_vehicle_excluded` flag parallel to the existing Reg 14(1) flag. 23 unit tests, all pass. |
| `3ac058e` | FE: `client/src/utils/riddor.js` (new) — `RIDDOR_CATEGORY_LABELS` map for the 9 categories. `ReportsPage` RIDDOR table + `IncidentDetail` header now render `riddorCategoryLabel(category)` with the reg paragraph in the tooltip. New "UK RIDDOR edge cases" card on `InjuryForm` capturing `on_hospital_premises`, the two Reg 14 exception flags, and the `gas_reporter_role` + `gas_dangerous_fitting` + Reg 11(3)(b)/(c) carve-out fields. |
| (this) | E2E test script `server/scripts/wi04-e2e.sh` (49 assertions covering every Reg 5/11/14 branch + Reg 4/6/7/8 regressions + country gate + cross-tenant 404 + WI-C hash-chain still verifying + the new categories surfacing in `/api/reports/riddor`). Wizard inline-style nits cleaned up. roadmap.md + memory updates. |

**Live end-to-end verified** against `elena@sdsmanager.com` + Sheffield Site (UK):
- Reg 5(a) — visitor + hospitalized → `non_worker_hospitalization`, RIDDOR row, 10-day deadline.
- Reg 5 negative — visitor, no hospital → not reportable, no row.
- Reg 11(2) — approved_person + dangerous_fitting → `gas_dangerous_fitting`, RIDDOR row, 14-day deadline.

**Test results:** node:test 23/23; wi04-e2e 49/49; wia-regression 77/78 (F1 unchanged known script bug); Vite build clean.

**Known limitations (TODO comments in code):**
- Volunteer classification under Reg 5 — treated as worker (conservative); per-incident wizard flag would be ideal.
- Reg 14(1)/(3) gating currently scoped to the Reg 5 path only; Reg 4 (worker) retains existing behaviour. Extending requires owner approval.
- PATCH /incidents/:id does NOT re-run RIDDOR classification (pre-existing). Adding hospitalization post-creation won't auto-fire Reg 5(a).
- The "UK RIDDOR edge cases" wizard card renders for ALL orgs; WI-D should gate by framework.

**Servers running.** Branch `backend` at `3ac058e` + this turn's commit (test-script + tidy-up).

### 2026-05-11 (late evening) — WI-A end-to-end + WI-D queued + regression suite

Long session closing out WI-A in full (chunks A1 → polish → retro fixes) plus
queuing WI-D as the next FE workstream. 14 commits on backend:

| Commit | Scope |
|---|---|
| `8cd3093` | Chunk 1 — docs (gap-analysis, plan, compliance-notes, regulatory-sources scaffold), roadmap trim |
| `67b8c9a` | WI-10 regulatory-submission audit consistency |
| `2301521` | WI-C 4a — migration 024 + hash-chain helper + triggers |
| `b3343a0` | WI-C 4c — writeActivity column writes + audit-log verify endpoint |
| `db5c1d4` | RIDDOR 2013 SI 1471 source PDF |
| `12fbd8d` | WI-A A1 — migration 025 + backfill (4 incidents) |
| `035ec28` | WI-A A2 — affected_persons service module + audit verbs |
| `b565fdd` | WI-A A3+A4+A5 — CRUD routes + POST dual-write + FE read view |
| `640a7e1` | WI-A follow-up — PATCH /incidents/:id dual-write |
| `ed16914` | WI-A FE — add-person modal + employee picker + per-row numbering |
| `f844f2e` | WI-A wizard — multi-person intake + flat→nested lift |
| `6afc25d` | WI-A UX fixes — modal scroll + z-index + employee picker on primary |
| `33c5424` | WI-A — DOB / gender / date_hired on wizard primary |
| `caab857` | WI-A — address + phone on wizard primary |
| `1f1f1fa` | WI-D queued (jurisdiction-aware wizard) + INDG453 RIDDOR guidance |
| `ace8816` | WI-A polish — edit/delete UI + fuller card + PATCH flat→nested |

**Regression suite landed:** `server/scripts/wia-regression.sh` — 78 curl
assertions covering POST shapes, PATCH matrix, AP/injury CRUD, WI-C hash
chain integrity, append-only trigger enforcement, reports endpoints,
adjacent paths. Run before any future change to incidents/affected_persons/
activity_log code paths.

**Servers stopped at session end.** Last commit `ace8816`. Working tree
clean (only untracked file is owner-supplied `PRD.md`).

### 2026-05-11 (later) — PRD compliance plan locked, Chunk 1 docs landed

User commissioned a PRD-vs-codebase gap analysis. After two scope revisions, locked plan is:

- **Owner directive 1** (no structural changes): only additive work; no refactor of existing tables / columns / enums unless a specific regulation cites it. Memory `feedback_no_structural_changes.md`.
- **Owner directive 2** (three new additive WIs): WI-A multi-person incidents (new `affected_persons` + `injuries` tables; backfill + dual-write; no wizard), WI-B override approval workflow (new `classification_override_requests`), WI-C activity-log hash chain (explicit per-WI authorization to `ALTER TABLE activity_log ADD COLUMN`).
- **Chunk execution order** with ✋ checkpoints: 1 docs (this session) → 2 WI-04 RIDDOR Reg 5+11 → 3 WI-10 audit consistency → 4 WI-C hash chain → 5 WI-A multi-person → 6 WI-B override approval → 7 WI-08 deadline countdown → 8+ OSHA/RIDDOR/NSW/generic PDFs.

**Chunk 1 deliverables (this session):**

| Path | Purpose |
|---|---|
| `docs/plan-2026-05-11.md` | Verbatim owner directive; authoritative scope |
| `docs/gap-analysis.md` | PRD-vs-codebase audit (written earlier this session) |
| `docs/implementation-plan.md` | WI-01…WI-11 + WI-A/B/C specs + chunk order |
| `docs/compliance-notes.md` | Retention, GDPR Art 17, encryption-at-rest, `type_data` load-bearing keys, NSW site-preservation placement, hallucination gates |
| Memory `feedback_no_structural_changes.md` | Owner directive 1 |
| Memory `project_prd_chunks_2026_05_11.md` | Chunk order + open-Q answers + WI-A/B/C summary |
| `roadmap.md` | Trimmed older session logs; added PRD-remediation section |

**Hallucination flags:** Chunk 1 is documentation only. No code written. Chunk 2 (WI-04 RIDDOR Reg 5/11) is gated on owner populating `docs/regulatory-sources/riddor/` with authoritative material.

**No commits yet** — Chunk 1 awaits ✋ owner review before committing.

### 2026-05-11 (evening) — P3-OP1 asset maintenance shipped (BE + FE)

Closed in one sitting across two commits: `d51f540` (BE: mig 023+023a/b/c, schedules/events, atomic mark-complete, manual escalate-to-CAPA, Dashboard PM-compliance KPI) + `f2ff262` (FE: Maintenance tab, `/maintenance` global page, 4 modals incl. ScheduleDetailModal, generic `.has-tooltip` pattern, notification deep-link `?open=<id>`).

Locked design decisions: manual-only escalation in v1 (no auto-CAPA on fail); AssetDetail tab + global page (not global only); ship calibration + attachments, drop meter-based.

Honest flags: Detail modal + tooltips + notification deep-link landed AFTER mid-session click-test; build-clean but not browser-verified. Recent-events timeline in MaintenanceTab fires N requests per asset (1.5 follow-up to bulk). PM-due notifications need cron not yet present in codebase (deferred).

### 2026-05-11 (later afternoon) — P3-OB3 document versioning shipped (BE + FE)

`7af629b` (BE: mig 022, supersede route, audit catalog catch-up) + `897ac78` (FE: preview-modal version timeline + inline supersede) + `2d5262a` (followups: block supersede on archived + reset file input).

### 2026-05-11 — Activity timeline forensics, audit-log polish, main merge, PR #11

Six commits + main merge. Key fixes: UTC timestamp bug (`4825251` — `parseServerDate()` in `time.js`); audit-log filter composite-key bug (`974130b`); audit-actions catalog (`a90a9ed`); merge from main brought voice report + ReferencedByCard fix (`9d1faf8`).

### Earlier sessions (compressed — `git log` for detail)

- **2026-05-08 evening** — work_hours industry-standard surfaces (Sellable tier): mig 021 contractor split; manual CRUD + CSV; TRIR/DART/LTIR/Severity rate cards on SiteDetail + Dashboard. `db5c483` `4d15011` `9849e60` `a47615b` `3848029`.
- **2026-05-08 afternoon** — OSHA/RIDDOR gating + Priya admin demo + P3-OB2 users/sites/assets/work_hours + two main merges + PR #9 + PR #10. `2e8daa7` `dd94fe4` `e30954d` `d8d6803` `1849051` `57db454` `7388574` `7a8f72e` `6051395` `fb8fc8f`.
- **2026-05-08** — Reports framework filter + main merge + PR #8. `37e6826` `8c9ac40` `36a564f`.
- **2026-05-07 (later evening)** — P3-O1 org sign-up + P3-O2 members + audit-fix pass. `b72bd6c` `650a2e8` `7aafa99` `8f3b01c`.
- **2026-05-07** — UX-C/D/E + P3-L1 closure. `f313722` `dffaf1f` `ff465d8` `d87ea04` `8b3359d`.
- **2026-05-06** — P3-N2 + P3-L2 + P3-N1 + P3-L1 prototype + P3-A1 four chunks. Roadmap items P3-AI3 / P3-OP5 / P3-RG1 added (RG1 now superseded by WI-06).
- **Earlier** — Phase 2 waves 1–7, UX-A/B/F/G/H. Full history via `git log`.
