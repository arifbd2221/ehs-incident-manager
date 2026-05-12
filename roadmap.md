# EHS Incident Management — Roadmap

Live status for what's open, what's done, and how to operate on this codebase. Done items collapse to commit SHAs — `git show <sha>` recovers the full detail. Most recent session at the bottom.

---

## Current state

- **Branch:** `backend` at this turn's WI-02 commit (OSHA 300A PDF + ITA CSV + 1904.41 designation + snapshot lock). Preceded by `1a02ed6` (WI-06), `89d0a27` (WI-07), `2d765af` (WI-03), `b7e3507` (WI-01), `753ec42` (OSHA sources). Working tree clean (only `PRD.md` + the NSW + ITA spec PDFs untracked — owner reference docs).
- **`origin/main`** at `b3dbb08` (last known). Backend is many commits ahead: WI-A + WI-04 + WI-B + WI-08 + WI-D + OSHA sources. Check `gh pr list` for current PR state.
- **PR #11** ✅ merged 2026-05-11.
- **Phase 2:** code complete; F6.2 manual walkthrough open.
- **Phase 3 done:** N1, N2, N3, L1, L2, A1, O1, O2, OB2, OB3, OP1, OP2, OP3.
- **Phase 3 open:** AI1, AI2, AI3, OP4, OP5, OB1. (RG1 superseded by PRD-remediation WI-06 SafeWork NSW.)
- **PRD-remediation done:** Chunks 1–7a + 8 (WI-01) + 9 (WI-03) + 10 (WI-07) + 11 (WI-06 engine) + **12 (WI-02 OSHA 300A + ITA CSV + designation)**. Next: WI-09 Generic PDF + WI-06 PDF renderer (follow-up) + WI-05 (gated).
- **Migrations applied:** 001–029 + letter fixups `014a`, `017a`, `023a/b/c`. Next available: **030**. 029 = WI-02 `osha_300a_certified_summaries` snapshot table + partial UNIQUE on `regulatory_certifications`.
- (Migration row consolidated above.)
- **Demo accounts** (all `password123`): `priya@sdsmanager.com` (admin, SDS Manager Inc., org=1), `elena@sdsmanager.com` (ehs_manager, org=1, multi-framework — owns Sheffield UK site), `marcus`, `james`, `mehta`, `wendy`; plus empty test orgs `acme@sdsmanager.com` (admin, Acme Manufacturing org=2, OSHA US — used for cross-tenant tests), `riddor-test@example.com` (RIDDOR UK), `sydney-test@example.com` (SafeWork NSW AU).
- **Dev servers:** `cd server && node --watch index.js` (BE :3001) + `cd client && npm run dev` (FE :5173).
- **Test suites:** `wia-regression.sh` 77/78, `wi04-e2e.sh` 49/49, `wib-e2e.sh` 42/42, `wi08-e2e.sh` 19/19, `wi07-e2e.sh` 46/46, `wi06-e2e.sh` 57/57, **`wi02-e2e.sh` 45/45**, `abn-validator.test.js` 12/12, **`osha-ita-csv.test.js` 36/36** (ITA template parity gate), `riddor-reg5-reg11.test.js` 23/23, `frameworks.test.js` 27/27.

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
| 7 | WI-08 Deadline countdown UI | ✅ `449539b` (single commit, BE+FE — pure presentation). `server/services/deadlines.js` aggregator; `GET /incidents/:id/deadlines`; `pending_deadlines` + `most_urgent_deadline` attached to list rows + detail payload; `DeadlineBadge` component rendered in IncidentDetail header (all) and IncidentsList rows (most-urgent compact). 19-assertion `server/scripts/wi08-e2e.sh`. |
| 7a | WI-D Jurisdiction-aware wizard + forms | ✅ `2e708d0` (single FE commit). `jurisdictionForContext({user, siteId, sites})` + `showField()` registry in `client/src/utils/frameworks.js`. Wizard threads jurisdiction to InjuryForm + AffectedPersonModal; "Show all regulatory fields" toggle defaults off. WI-04 "UK RIDDOR edge cases" card + WI-A address/phone/DOB/gender/date_hired rows now jurisdiction-gated. 25-test `node:test` suite at `client/src/utils/frameworks.test.js`. |
| 8 | WI-01 OSHA 300 PDF | ✅ `b7e3507` (single BE+FE commit). `server/services/pdf/osha_300.js` (Form 300 Rev. 04/2004 grid: A..F header cols + G..J classification X-marks + K..L day counts + M1..M6 type X-marks + page-totals strip on final page). `GET /reports/osha-300?format=pdf` branch — requires `site_id` per 29 CFR 1904.30(a) (400 with cite otherwise; 404 cross-tenant). Privacy-case substitution per 29 CFR 1904.29(b)(7). Audit verb `osha_300_pdf_downloaded`. FE: Download-PDF btn in `Osha300Report` panel header on ReportsPage. `pdfkit` ^0.18.0 added — WI-03/02/09 reuse. |
| 9 | WI-03 OSHA 301 PDF | ✅ `2d765af`. `server/services/pdf/osha_301.js` (Form 301 Rev. 04/2004 portrait — three sections + Completed by; fields 1–18 with verbatim OSHA numbering; manual word-wrap utility for fields 14–17). `GET /reports/osha-301/:incidentId?format=pdf` reads primary `affected_persons` row + first `injuries` (WI-A) with legacy fallback. FE: Download-PDF button in IncidentDetail OSHA-recordable section. |
| 10 | WI-07 OSHA 1904.39 severe-injury flow | ✅ `89d0a27`. Migration 027 + `services/osha_severe.js` + POST/PATCH hooks + deadlines plug-in + FE phone-notif UI + 46-assertion `wi07-e2e.sh`. |
| 11 | WI-06 SafeWork NSW (engine + tables + routes + FE; PDF deferred) | ✅ this turn (single BE+FE commit). Owner approved verbatim s.35–s.39 extraction before any code. Migration 028 `safework_nsw_notifications` + two seeded lookup tables (10+1 s.36 + 11+1 s.37, each row carries verbatim Act `label` + `section_ref`). `services/safework_nsw.js` classification engine — auto-derive s.36(a) from `hospitalized`, explicit s.36(b)(i)–(viii)+(c) and s.37 sub-categories via `type_data.safework_nsw.*`, Mines & Petroleum carve-out per s.38(8)/s.39(4). `services/abn_validator.js` (ATO mod-89) + 12-test suite. 7 new routes (lookups, list, GET, phone-notified, regulator-requested-written, written-submitted, site-preservation, PCBU). Deadlines aggregator emits `safework_nsw_phone` (without_delay→submitted) and `safework_nsw_written` (only after regulator request; deadline = +48h per s.38(4)(b)). FE: `SafeworkNswCardRows` + `SafeworkNswModal` on IncidentDetail behind `showNsw` framework gate. 57-assertion `wi06-e2e.sh`. 5 new audit verbs. |
| 12 | WI-02 OSHA 300A PDF + ITA CSV (29 CFR 1904.32 + 1904.41) | ✅ this turn. Migration 029 `osha_300a_certified_summaries` snapshot + `services/osha_300a.js` (atomic cert+snapshot + verbatim 4-key allowlist + verbatim 1904.32(b)(3) affirmation) + `services/osha_ita_designation.js` (Appendix A 65 entries + Appendix B 95 entries verbatim per 88 FR 47347/47348) + `services/pdf/osha_300a.js` + `services/csv/osha_ita.js` (28 cols, RFC 4180, leading-zero quoting) + `services/csv/osha_ita_validator.js` (per-field + 7 cross-field + 500..<8760 hours/employee bounds + non-contiguous size enum). 3 new routes (PDF, CSV, designation). FE: Download buttons + 1904.41 designation banner + cert dropdown. 36-test `osha-ita-csv.test.js` (byte-for-byte template parity gate) + 45-assertion `wi02-e2e.sh`. 3 new audit verbs. |
| 13 | WI-06 PDF renderer (follow-up) | After owner confirms layout. Adds `services/pdf/safework_nsw.js` + Download-PDF button on the NSW card. Per standing instruction: government-document styling, no logo impersonation, footer noting submission still happens via phone + online portal. |
| 13+ | WI-09 Generic PDF, WI-05 F2508 (gated) | reorder allowed by gate readiness |

**Hallucination-risk gates** (memory `feedback_regulatory_truth.md`) — do NOT start without owner-supplied source material in `docs/regulatory-sources/`:
- WI-01 — ✅ DONE. 29 CFR 1904.29 + Form 300 visual reference both cited in `server/services/pdf/osha_300.js`.
- WI-02 — ✅ partial: 29 CFR Part 1904 covers 1904.41 (ITA). The OSHA ITA CSV upload template itself (column headers) is not in the package PDF; check ITA portal or owner can supply.
- WI-03 — ✅ DONE. 29 CFR 1904.29 + Form 301 visual reference cited in `server/services/pdf/osha_301.js`.
- WI-04 — ✅ DONE. Owner-provided SI 2013/1471 + HSE INDG453 used; verbatim text cited in code comments.
- WI-05 — HSE F2508 visual reference — **still gated**.
- WI-06 — ✅ s.36 / s.37 enumerations verbatim from WHS Act 2011 (NSW) (verified by owner review). ANZSIC code list deferred to a future WI (v1 accepts 4-digit text input). Notify SafeWork NSW form layout deferred to PDF follow-up commit.
- WI-07 — ✅ DONE. 29 CFR 1904.39 verbatim text cited in `server/services/osha_severe.js`.

---

## Next session priority

WI-01 + WI-03 + WI-07 + WI-06 (engine) + WI-02 shipped. Deadlines aggregator covers US-OSHA + UK-RIDDOR + AU-NSW. PDF infrastructure proven across 4 different form layouts. Remaining chunks:

- **WI-09 Generic Incident PDF** — universal fallback per PRD §4.6. No hallucination gate; no regulator-mandated layout. Smallest remaining chunk; reuses the WI-01 pdfkit pattern.
- **WI-06 PDF renderer (follow-up)** — design from WHS Act requirements per the owner's standing instruction. Data shape ready in `safework_nsw_notifications`.

**Still gated** (owner needs to supply source material before starting):
- **WI-05 RIDDOR F2508 PDF** — HSE F2508 visual reference.

**WI-09 cold files for the next session:**
- `server/services/pdf/generic_incident.js` — new renderer. US-Letter portrait. Reads from the incident detail + (post-WI-A) affected_persons + injuries. Reuse the pdfkit pattern from `services/pdf/osha_301.js` (manual word-wrap for narrative fields).
- `server/routes/reports.js` — new `GET /reports/generic/:incidentId?format=pdf` route. Framework-gated on the `generic` framework, OR fall back to "always available" since it's the universal floor — owner decision.
- `client/src/api/reports.js` — add `getGenericIncidentPdf(incidentId)` blob helper.
- `client/src/pages/incidents/IncidentDetail.jsx` — Download-PDF button alongside the 301 button, but visible for non-recordable incidents too.
- No new tables. No regulatory text to cite verbatim; the renderer designs its own field set from the existing incident shape.

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

### 2026-05-12 (late night, ctd.) — WI-02 OSHA 300A PDF + ITA CSV + 1904.41 designation shipped; 45-assertion e2e + 36-test unit suite

Chunk 12 closed in a single BE+FE commit. Owner-gated verbatim extraction of 1904.32 + 1904.41 + Appendix A/B happened BEFORE any code; owner approved the 4-gap-decision design (snapshot table, certifier_title allowlist, verbatim 1904.32(b)(3) affirmation, hardcoded designation arrays) and supplied the ITA spec PDF + CSV template.

| Commit | Scope |
|---|---|
| (this) | Migration 029 `osha_300a_certified_summaries` (snapshot table) + partial UNIQUE index on `regulatory_certifications`. `services/osha_300a.js` (aggregate + atomic cert+snapshot writers + `CERTIFIER_TITLE_OPTIONS` with verbatim 1904.32(b)(4) labels + verbatim `OSHA_300A_AFFIRMATION_TEXT`). `services/osha_ita_designation.js` (Appendix A 65 entries + Appendix B 95 entries with `// Source: 88 FR 47347/47348` citations). `services/pdf/osha_300a.js` portrait renderer with verbatim affirmation under "By signing, you affirm the following statement, made under 29 CFR 1904.32(b)(3):". `services/csv/osha_ita.js` 28-column exporter — column headers VERBATIM from `osha_ita_summary_data_csv_template-revised.csv`, RFC 4180 encoding only (no apostrophe doubling — owner reconciled this was a misread of the spec), `zip` + `ein` quoted unconditionally for leading-zero preservation. `services/csv/osha_ita_validator.js` enforces every per-field rule (length, format, integer-only) + 7 cross-field rules from spec p.8 + 500..<8760 hours/employee bounds + non-contiguous size enum {1, 21, 22, 3} per 2023-10-17 changelog + establishment_type enum with verbatim spec wording. 3 new routes: `?format=pdf`, `?format=csv`, `/ita-designation`. Cert route now requires `certifier_title_key` (4-key allowlist); creates cert + snapshot atomically. 3 new audit verbs. FE: Download-PDF + Download-ITA-CSV buttons on `Osha300AReport` panel; 1904.41 designation banner above the cases grid; `CertifyOsha300AModal` becomes a dropdown of the 4 verbatim Act labels with the affirmation header. 36-test `osha-ita-csv.test.js` unit suite (column-header parity gate, all 7 cross-field rules, all designation branches, Appendix A/B spot-checks). 45-assertion `wi02-e2e.sh` covering cert workflow validation + atomic snapshot creation + PDF download + CSV download + wire-level header parity + ITA validator + framework gate + cross-tenant + activity_log + WI-C hash chain. roadmap.md + implementation-plan.md updates. |

**Hallucination-risk discipline:**
- Verbatim ss.1904.32 + 1904.41 + Appendix A + Appendix B owner-reviewed BEFORE any code.
- Caught + resolved 4 discrepancies between user-supplied summary + the spec PDF (EIN column name, apostrophe doubling, establishment_type wording, size codes). Owner reconciled all 4 before code was written.
- Every Appendix A/B entry traces to verbatim Act text in the source PDF.
- ITA CSV column headers parsed from the official OSHA template, not from data-model field names. The unit test makes this drift detectable.
- All 7 spec p.8 cross-field rules implemented + tested.

**Test results** (full sweep): wi02-e2e 45/45, wi06-e2e 57/57, wi07-e2e 46/46, wi08-e2e 19/19, wi04-e2e 49/49, wib-e2e 42/42, node:test 98/98 (12 ABN + 36 ITA-CSV + 23 RIDDOR + 27 frameworks), wia 77/78 (F1 unchanged), Vite build clean.

**Carry-forward TODOs documented in WI-02 spec:**
- EIN capture at cert time (v1 takes via query string at export).
- City/state/zip column split on `sites.address` (v1 takes via query string).
- WI-06 PDF follow-up still owed.
- 1904.41(b)(6) partial-exemption detection out of scope.

**Servers running.** Branch `backend` at this turn's commit.

### 2026-05-12 (late night, ctd.) — WI-06 SafeWork NSW engine + tables + routes + FE shipped (PDF deferred); 57-assertion e2e

Chunk 11 closed in a single BE+FE commit. Owner-gated verbatim extraction of WHS Act 2011 (NSW) ss.35–39 happened BEFORE any code; owner approved + supplied gap decisions, then implementation proceeded.

| Commit | Scope |
|---|---|
| (this) | Migration 028 `safework_nsw_notifications` + two seeded lookup tables: `safework_nsw_serious_injury_types` (10 s.36 + 1 "other prescribed" per s.36 tail) and `safework_nsw_dangerous_incident_types` (11 s.37 + 1 per s.37(l)). Each lookup row carries `key` (snake_case), verbatim Act `label`, and `section_ref` (e.g. `WHS Act 2011 (NSW) s.36(b)(i)`). `services/safework_nsw.js` classification engine — s.35 categories auto-detected from existing signals (`osha_date_of_death` / `hospitalized`) plus explicit `type_data.safework_nsw.*` arrays for s.36(b)/(c) + s.37 sub-categories (no fuzzy match on free text). Mines & Petroleum carve-out per s.38(8)/s.39(4) short-circuits the deadlines aggregator. `services/abn_validator.js` (ATO mod-89 weighted-sum per abr.business.gov.au/Help/AbnFormat) + 12-test `node:test` suite spot-checking 51 824 753 556 (ATO) + 48 123 123 124 (second checksum-valid ABN) + single-digit tweak property (≥ 89 of 99 tweaks must break checksum). 7 new routes: lookups, list, GET, phone-notified, regulator-requested-written (starts the s.38(4)(b) 48h clock), written-submitted, site-preservation (s.39 enum-constrained), PCBU (ABN checksum-gated + ANZSIC `/^\d{4}$/`). All routes 403 when caller lacks `safework_nsw` framework. POST + PATCH hooks on `/incidents` gated on `sites.country='AU'`. Deadlines aggregator (`services/deadlines.js`) gains `safework_nsw_phone` (without_delay → submitted) and `safework_nsw_written` (only emitted after regulator request; deadline = +48h). FE: `client/src/api/safework_nsw.js` (8 helpers). `frameworkVisibility()` extended with `showNsw`. `SafeworkNswCardRows` + `SafeworkNswModal` render on `IncidentDetail` behind the framework gate. 5 new audit verbs. 57-assertion `wi06-e2e.sh` covering lookups, auto-create from POST, explicit s.37, fatality via PATCH, minor-incident no-row, Mines & Petroleum carve-out, AU-only gate, PATCH re-classification + idempotency, phone-notified + aggregator status flip, regulator-requested → 48h clock + written-submitted flip, s.39 site preservation, ABN checksum validation (valid normalised, invalid rejected), 4-digit ANZSIC validation, framework gate (3× 403), cross-tenant 404, activity_log entries (6 verbs), WI-C hash chain still verifies. roadmap.md + implementation-plan.md updates. |

**PDF renderer deferred** to a follow-up commit per owner direction. No static Notify SafeWork form exists; design will follow standing instruction (government-document styling, no logo impersonation, footer noting submission still happens via phone + online portal). Data shape is ready.

**Test results** (full sweep): wi06-e2e 57/57, wi07-e2e 46/46, wi08-e2e 19/19, wi04-e2e 49/49, wib-e2e 42/42, node:test 62/62 (12 ABN + 23 RIDDOR + 27 frameworks), wia 77/78 (F1 unchanged baseline), Vite build clean.

**Hallucination-risk discipline:** Owner-gated verbatim extraction reviewed AND approved before any classification or seed code was written. Every s.36/s.37 row in the migration cites its Act paragraph; every comment in `services/safework_nsw.js` cites the section it implements. Zero fuzzy-matching on injury narrative — explicit reporter flags only for s.36(b)/(c) and s.37 sub-categories.

**Carry-forward TODOs:**
- s.36 tail / s.37(l) "prescribed by regulations" additions — deferred to a future WI when WHS Regulation 2017 (NSW) source lands. v1 captures via `*_other_prescribed_by_regulations` lookup rows + free text.
- ANZSIC code list seeding — deferred (v1 accepts 4-digit text). Source PDF stays in `docs/regulatory-sources/safework-nsw/` for a future WI.
- PCBU "address" / "trading name" / "worker count" — deferred (v1 captures name + ABN + ANZSIC). Expand when PDF renderer lands.
- PDF renderer — next chunk.

**Servers running.** Branch `backend` at this turn's commit.

### 2026-05-12 (late night, ctd.) — WI-07 OSHA 1904.39 severe-injury reporting shipped (BE + FE + 46-assertion e2e)

Chunk 10 closed in a single BE+FE commit. First non-PDF OSHA chunk; introduces the second jurisdiction-specific deadline source (after RIDDOR) that the WI-08 aggregator now folds in. Largest WI-07 contribution: a real `wi07-e2e.sh` regression suite that future PDF + NSW work can build on.

| Commit | Scope |
|---|---|
| (this) | Migration 027 `osha_severe_notifications` (+ idx). `server/services/osha_severe.js` with pure `evaluateSevereInjury` + writers (syncSevereNotifications / listSevereNotificationsForIncident / getSevereNotification / logPhoneNotification). POST `/incidents` hook + PATCH `/incidents/:id` hook (both gated on `sites.country='US'`) auto-create rows for fatality (8h, 1904.39(a)(1)) / hospitalization / amputation / loss_of_eye (24h, 1904.39(a)(2)). 1904.39(b)(6) 30-day fatality window enforced. 1904.39(b)(11) carve-outs honored (amputation requires explicit reporter flag — substring on injury_type is intentionally not enough). `osha_date_of_death` added to PATCH allowlist. `services/deadlines.js` aggregator extended with `loadOshaSevereForIncidents` bulk loader + per-incident merge; list + detail + `/deadlines` endpoints surface the rows. New routes `GET /reports/osha-severe/:incidentId` + `POST /reports/osha-severe/:notificationId/phone-notified` (elevated-only, idempotent, writes activity_log). 2 new audit verbs. FE: `getOshaSevere` + `logOshaSeverePhoneNotified` in `api/reports.js`; `IncidentDetail` loads severe rows alongside incident/AP data, renders "Log phone call" buttons per unsubmitted row + status badges for submitted ones (rendered alongside the OSHA recordable row, NOT nested inside it — 1904.39 reporting duty is independent of 1904.7 recordability). New `LogOshaSevereModal` captures area_office + reference + notes. 46-assertion `server/scripts/wi07-e2e.sh` covering hospitalization auto-create, amputation/loss_of_eye explicit flags, B3 negative case (no substring match), multi-category via PATCH, idempotent PATCH, US-only gate (UK + AU sites get zero rows), phone-notified write + idempotency + worker 403, cross-tenant 404 on GET + write, list-endpoint integration, activity_log entries for both POST + PATCH paths, WI-C hash chain still verifies. roadmap.md + implementation-plan.md updates. |

**Thoroughness notes (in response to "test thoroughly"):**
- Wrote a dedicated 46-assertion `wi07-e2e.sh` covering every spec branch + edge case + cross-jurisdiction gate.
- Pure-function smoke (`evaluateSevereInjury`) confirmed via synthetic node script covering: fatality 1-day, fatality outside 30-day window, hospitalization, amputation flag, loss-of-eye flag, multi-category, no-category, primaryInjury-only path.
- Full FE click-flow simulated end-to-end via curl (matching the exact sequence the React component runs: load → display → modal submit → reload). Revealed a real FE bug where the WI-07 UI was nested inside `osha_recordable === 1`, hiding the 1904.39 phone-notif buttons when recordability hadn't been verified yet. Fixed.
- Vite production build clean. All existing suites green: wi08 19/19, wi04 49/49, wib 42/42, node:test 48/48, wia 77/78 (F1 unchanged).

**Carry-forward TODOs documented in code:**
- 1904.39(b)(7) "employer learns later" clock — currently uses `incident_datetime` (or `osha_date_of_death` for fatality). Needs reporter signal to switch.
- 1904.39(b)(10) observation-only carve-out — trusted to reporter's `hospitalized` flag. No DB signal to distinguish "care/treatment" vs "observation/diagnostic".

**Servers running.** Branch `backend` at this turn's commit.

### 2026-05-12 (late night, ctd.) — WI-03 OSHA 301 PDF shipped (BE renderer + FE Download button on IncidentDetail)

Chunk 9 closed in a single BE+FE commit immediately after WI-01.

| Commit | Scope |
|---|---|
| (this) | `server/services/pdf/osha_301.js` — Form 301 (Rev. 04/2004) US-Letter portrait. Three sections (Employee 1–5, Physician 6–9, Case 10–18) + Completed by + 5-year retention notice (1904.33). OSHA field numbering verbatim so an inspector can map line-by-line. Yes/No checkboxes for 8/9; date-box visual for 3/4/11/18; manual word-wrap utility for fields 14–17 (sidesteps pdfkit's auto-pagination on wrap, see memory `feedback_pdfkit_autopagination`). `GET /reports/osha-301/:incidentId?format=pdf` reads primary `affected_persons` row + first `injuries` (WI-A) with `type_data.injured_person` fallback for pre-WI-A incidents. Audit verb `osha_301_pdf_downloaded` on `entity_type='incident'`. FE: Download-PDF button in `IncidentDetail` OSHA-recordable section — only renders when `osha_recordable === 1` per 29 CFR 1904.29(b)(2). roadmap.md + implementation-plan.md updates. |

**Smoke matrix verified end-to-end:**
- priya / INC-2026-0141 (recordable injury) → 1-page PDF with all 18 fields populated (DOB, dates, ER/hospitalized checks, narrative, injury summary, substance).
- priya / non-recordable incident id 1 → 1-page PDF (route doesn't block; FE hides the button for workers).
- acme requesting an org-1 incident → 404 (cross-tenant guard already in place).
- Unknown incident id → 404.
- JSON branch unchanged (`/api/reports/osha-301/2` still returns the same shape).

**Test results:** wi08 19/19, wi04 49/49, wib 42/42, node:test 48/48, Vite build clean.

**Servers running.** Branch `backend` at this turn's commit.

### 2026-05-12 (late night) — WI-01 OSHA 300 PDF shipped (BE renderer + FE Download button)

Chunk 8 closed in a single BE+FE commit. First PDF chunk on the project — `pdfkit` is now on `server/package.json` and the renderer pattern in `server/services/pdf/osha_300.js` is the template WI-02 / WI-03 / WI-09 will copy.

| Commit | Scope |
|---|---|
| (this) | `server/services/pdf/osha_300.js` — Form 300 (Rev. 04/2004) US-Letter landscape renderer: 13-column case grid (A case#, B name, C job_title, D date M/D, E location, F description+body-parts, G/H/I/J classification X-marks, K/L day counts, M1..M6 injury-type X-marks), header with Year + Establishment + Address + Org + OMB stamp, footer with "transfer to 300A" reminder + Page X of Y, page-totals strip on the final page. Privacy-case substitution per 29 CFR 1904.29(b)(7). Auto-pagination kept off via `margins.bottom: 0` + explicit absolute coords + `lineBreak: false` so page count = `Math.ceil(N / 12)`. `GET /reports/osha-300?format=pdf` branch — requires `site_id` (1904.30(a) cite in the 400), cross-tenant 404, cross-checks the existing JSON path. Audit verb `osha_300_pdf_downloaded` added to catalog. FE: Download-PDF button in `Osha300Report` panel header (`ReportsPage.jsx`) using the existing auth-fetch + blob-`<a>` pattern from the audit-log CSV export. `pdfkit` ^0.18.0 added to `server/package.json`. roadmap.md + implementation-plan.md updates. |

**Smoke matrix verified end-to-end:**
- `priya@sdsmanager.com` (admin, SDS Manager Inc. org=1) → Cleveland Plant 2026 → 35 cases, 3 pages, totals row reads `0 / 1 / 0 / 34 / 3 / 2 / 35 / 0 / 0 / 0 / 0 / 0` matching the JSON aggregate.
- `acme@sdsmanager.com` (admin, Acme Manufacturing org=2) → "kkk" site → 1 case, 1-page PDF, totals + remaining rows correctly blank.
- `acme@sdsmanager.com` requesting Cleveland (org=1) site_id=1 → 404 (cross-tenant guard).
- Missing `site_id` → 400 with the 29 CFR 1904.30(a) citation.
- Synthetic 2-row run with `is_privacy_case=1` on row 2 → column B prints "Privacy Case" and column C is blank, row 1 unchanged. Verified by `pdftotext -layout`.

**Test results:** wi08-e2e 19/19; wi04-e2e 49/49; wib-e2e 42/42; wia-regression 77/78 (F1 unchanged); node:test (riddor + frameworks) 48/48; Vite build clean.

**Servers running.** Branch `backend` at this turn's commit.

### 2026-05-12 (night) — WI-D jurisdiction-aware wizard shipped + OSHA source PDFs landed

Chunk 7a closed in one FE commit + docs follow-up. Owner also dropped OSHA source PDFs into `docs/regulatory-sources/osha/` which unblocks WI-01 / WI-02 / WI-03 / WI-07 for upcoming chunks.

| Commit | Scope |
|---|---|
| `2e708d0` | **WI-D**. `client/src/utils/frameworks.js` gains `jurisdictionForContext({user, siteId, sites})` + `FIELD_REQUIRED_BY` registry + `showField(key, jurisdictions, showAll)`. `ReportWizard.jsx` computes jurisdiction once site is picked (useMemo) and threads it to InjuryForm. `InjuryForm.jsx` gates the WI-A identity rows (address/phone, DOB/gender/date_hired) + WI-04 "UK RIDDOR edge cases" card; "Show all regulatory fields" override toggle in the Injured-person card header (default off). `AffectedPersonModal.jsx` accepts optional `jurisdiction` prop; falls back to showing every field when called from IncidentDetail post-creation. 25-test `node:test` suite at `client/src/utils/frameworks.test.js` covering jurisdictionForContext + showField + the four demo-account integration scenarios. |
| `753ec42` | **OSHA source materials**: `29 CFR Part 1904 (up to date as of 5-07-2026).pdf` (42pp regulation text, covers 1904.29 / 32 / 33 / 39 / 41) + `OSHA-RK-Forms-Package.pdf` (visual reference for Forms 300 / 300A / 301). Unblocks WI-01 / WI-02 / WI-03 / WI-07. |
| (this) | roadmap.md + docs/implementation-plan.md + memory updates. Chunk 7a marked done; next-session priority refreshed with OSHA chunk queue. |

**Test matrix:** frameworks.test.js 25/25; wi08 19/19; wib 42/42; wi04 49/49; riddor unit 23/23; wia 77/78 (F1 unchanged); Vite build clean.

**Servers running.** Branch `backend` at `753ec42` + this turn's docs commit.

### 2026-05-12 (evening) — WI-08 regulatory-deadline countdown UI shipped (BE aggregator + FE badge); 19-assertion E2E suite

Chunk 7 closed in a single BE+FE commit + a docs/memory follow-up. No schema changes; pure presentation over the existing `riddor_reports.written_deadline` / `phone_notified_at` / `written_submitted_at` fields.

| Commit | Scope |
|---|---|
| `449539b` | `server/services/deadlines.js` aggregator (`computePendingDeadlines` pure helper + `getPendingDeadlinesForIncident` for the route + `mostUrgent` ranker + `loadRiddorReportsForIncidents` bulk loader so the list handler stays N+1-free). New `GET /incidents/:id/deadlines` endpoint. Existing `GET /incidents` (list) and `GET /incidents/:id` (detail) now attach `pending_deadlines` + `most_urgent_deadline` so the FE renders without follow-up fetches. `DeadlineBadge.jsx` component (color via `--sds-*` tokens; compact prop for list rows; tooltip with reg paragraph + absolute dates). IncidentDetail header renders all pending deadlines; IncidentsList rows render the most-urgent only. `server/scripts/wi08-e2e.sh` — 19 assertions, all pass. |
| (this) | roadmap.md + implementation-plan.md + memory updates. Marks chunk 7 done; queues WI-D / WI-01 / WI-03 / WI-06 as next options. |

**Status enum surfaced:** `without_delay` (phone obligation outstanding) / `overdue` / `due_today` (< 24h) / `due_soon` (< 72h) / `upcoming` (> 72h) / `submitted`. Color tokens: error / warning / info / success.

**TODO carry-forward in `deadlines.js`:** SafeWork NSW (WI-06) and OSHA 1904.39 (WI-07) plug-in points are marked. The aggregator is the single integration point for both.

**Test results:** wi08 19/19; wib 42/42; wi04 49/49; node:test 23/23; wia-regression 77/78 (F1 unchanged); Vite build clean.

**Servers running.** Branch `backend` at `449539b` + this turn's docs commit.

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
