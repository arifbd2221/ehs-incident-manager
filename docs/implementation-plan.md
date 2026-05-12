# Implementation Plan — PRD Gap Remediation (revised 2026-05-11)

Companion to `docs/gap-analysis.md`, `docs/plan-2026-05-11.md`, and `docs/compliance-notes.md`. Where this plan disagrees with `plan-2026-05-11.md`, that document wins — update this one to match.

**Scope constraints** (memory `feedback_no_structural_changes.md`):
- No structural changes to existing tables, columns, or enums **except** as explicitly authorized in `plan-2026-05-11.md` (WI-C is authorized).
- All other work is additive: new tables, new services, new endpoints, new UI.
- New columns on existing tables require a per-WI authorization in `plan-2026-05-11.md`.

**Hallucination-risk gates** (memory `feedback_regulatory_truth.md`):
- Do not start WI-02, WI-04, WI-05, or WI-06 without owner-supplied authoritative source material in `docs/regulatory-sources/`.

Complexity: **S** = ≤1 session, **M** = 1–2 sessions, **L** = ≥2 sessions.
Next available migration number: **024**. Renumber + alias dance applies on collisions with `main` (memory `feedback_migration_collision.md`).

---

## Execution order (chunks)

Defined in `plan-2026-05-11.md` Part 3. Each chunk ends with a ✋ owner checkpoint. **Do not silently expand scope across chunks** — if a chunk surfaces work that belongs in another WI, note it and defer.

| Chunk | Work item | Notes |
|---|---|---|
| 1 | Setup (this doc + plan + compliance-notes + memory + roadmap) | ✅ Done — `8cd3093` |
| 2 | WI-04 RIDDOR Reg 5 + 11 + Reg 14(3) flag | ✅ Done — `b0f8c53`, `df44eb3`, `3ac058e`. E2E at `server/scripts/wi04-e2e.sh` (49 assertions, all pass). |
| 3 | WI-10 Activity-log audit consistency | ✅ Done — `67b8c9a` |
| 4 | WI-C Activity log integrity (hash chain) | ✅ Done — `2301521`, `b3343a0` |
| 5 | WI-A Multi-person incidents | ✅ Done — `12fbd8d` … `caab857` (wizard, modal, dual-write, address/phone/DOB/gender/date_hired) |
| 6 | WI-B Override approval workflow | ✅ Done — `7ee1983` (BE: migration 026 + service + routes + 42-assertion `wib-e2e.sh`), `e660b16` (FE: modal + RecordabilityVerifyCard banner + `/approvals` page) |
| 7 | WI-08 Deadline countdown UI | ✅ Done — `449539b` (single BE+FE commit: `server/services/deadlines.js` aggregator + `GET /incidents/:id/deadlines` + list/detail attachment + `DeadlineBadge.jsx` rendered in IncidentDetail header & IncidentsList rows + 19-assertion `wi08-e2e.sh`). |
| 7a | WI-D Jurisdiction-aware wizard + forms | ✅ Done — `2e708d0` (single FE commit: `jurisdictionForContext()` + `showField()` registry in `client/src/utils/frameworks.js`; wizard threads jurisdiction to InjuryForm + AffectedPersonModal with "Show all" override toggle; 25-test `frameworks.test.js`). |
| 8 | WI-01 OSHA 300 PDF | ✅ Done — single BE+FE commit `b7e3507`. `server/services/pdf/osha_300.js` renderer + `?format=pdf` branch on `GET /reports/osha-300` + Download-PDF button on `Osha300Report` in `ReportsPage.jsx`. Privacy-case substitution per 29 CFR 1904.29(b)(7); per-establishment requirement per 1904.30(a). `pdfkit` landed on `server/package.json`. |
| 9 | WI-03 OSHA 301 PDF | ✅ Done — `2d765af`. `server/services/pdf/osha_301.js` renderer + `?format=pdf` branch + Download-PDF button. Pulls primary `affected_persons` + first `injuries` row (WI-A). Manual word-wrap utility (bypasses pdfkit pagination on wrapped text). |
| 10 | WI-07 OSHA 1904.39 severe-injury flow | ✅ `89d0a27`. Migration 027 + `services/osha_severe.js` + auto-create POST/PATCH hooks + deadlines plug-in + FE phone-notif UI + 46-assertion e2e. |
| 11 | WI-06 SafeWork NSW (engine + tables + routes + FE; no PDF) | ✅ `1a02ed6`. Migration 028 + `services/safework_nsw.js` + ABN validator + deadlines plug-in + FE NSW card + 57-assertion e2e. |
| 12 | WI-02 OSHA 300A PDF + ITA CSV (29 CFR 1904.32 + 1904.41) | ✅ Done — this turn. Migration 029 (`osha_300a_certified_summaries` snapshot table + partial UNIQUE). `services/osha_300a.js` (aggregate + atomic cert+snapshot writers + verbatim 1904.32(b)(4) allowlist + verbatim 1904.32(b)(3) affirmation). `services/osha_ita_designation.js` (Appendix A 65 entries + Appendix B 95 entries verbatim per 88 FR 47347/47348). `services/pdf/osha_300a.js` portrait renderer. `services/csv/osha_ita.js` 28-column ITA exporter (verbatim headers from OSHA template, RFC 4180, leading-zero quoting). `services/csv/osha_ita_validator.js` (per-field + 7 cross-field + reasonability bounds). 3 new routes (PDF, CSV, designation). 36-test `node:test` unit suite incl. byte-for-byte template parity. FE: Download buttons + designation banner on `Osha300AReport` + cert modal becomes 4-key dropdown. 3 new audit verbs. 45-assertion `wi02-e2e.sh`. |
| 13 | WI-09 Generic Incident PDF | ✅ Done — this turn. `services/pdf/generic_incident.js` 8-section renderer + `GET /reports/incidents/:incidentId/generic?format=pdf` + FE button on IncidentDetail. 20-test `generic-incident-pdf.test.js` + 30-assertion `wi09-e2e.sh`. Universal — no framework gate, no elevated-only, available for every incident. |
| **14** | **WI-06 PDF renderer (follow-up)** | **Next** — design from WHS Act per standing instruction. Adds `services/pdf/safework_nsw.js` + button on the NSW card. |
| 15+ | WI-05 RIDDOR F2508 (still gated) | needs HSE F2508 visual reference |

---

## In-scope work items

### WI-01: OSHA Form 300 PDF rendering (29 CFR 1904.29) — ✅ DONE

Shipped 2026-05-12 in a single BE+FE commit.

- **Renderer** `server/services/pdf/osha_300.js` — US-Letter landscape, 13-column case grid matching the official Form 300 (Rev. 04/2004): Step 1 (A case#, B name, C job_title), Step 2 (D date, E location, F description+body-parts), Step 3 (G/H/I/J classification X-marks — exactly one of death/days-away/job-transfer/other-recordable), Step 4 (K/L day counts), Step 5 (M1..M6 injury-type X-marks). Header carries Year + Establishment + Address + Org name + OMB stamp; footer carries the "transfer to 300A" reminder + Page X of Y. Final page renders the page-totals strip. pdfkit auto-pagination disabled via `margins.bottom: 0` (explicit absolute coordinates + `lineBreak: false` on every text call) so the page count matches `Math.ceil(N / 12)`.
- **Privacy-case substitution** per 29 CFR 1904.29(b)(7): rows with `is_privacy_case=1` render employee_name as "Privacy Case" and job_title blank. Verified against a synthetic 2-row PDF; substitution happens both in the route's existing JSON-shaping pass and defensively inside the renderer's `applyPrivacy()` helper.
- **Route** `GET /reports/osha-300?format=pdf` — reuses the same SQL + privacy substitution as the JSON branch. **Requires** `site_id` per 29 CFR 1904.30(a) (one Log per establishment) — returns 400 with the cite if missing. Cross-tenant `site_id` returns 404. Successful download writes an `osha_300_pdf_downloaded` activity_log entry (new audit verb in catalog) carrying `site_id`, `period_year`, `case_count`, and the request's IP / user-agent.
- **FE** — Download-PDF button in the `Osha300Report` panel header (`client/src/pages/reports/ReportsPage.jsx`) alongside the existing Manual-entry button. Authenticated-fetch + blob → `<a download>` pattern (matches the audit-log CSV download). Filename derived from `Content-Disposition` (e.g. `osha-300-12-3456-2026.pdf`). Button disabled while generating; alerts on failure.
- **Dependency** — `pdfkit` ^0.18.0 added to `server/package.json`. WI-02 / WI-03 / WI-09 will reuse this.

**Equivalent form** notice: 29 CFR 1904.29(b)(4) explicitly permits an "equivalent form" so long as it contains the same information, is as readable, and uses the same instructions. The exact-pixel match to the OSHA fillable PDF is not required; section identifiers (A..M6) and the regulatory citations are preserved verbatim.

**Complexity:** M. **New tables:** none. **Existing columns touched:** none.

---

### WI-02: OSHA Form 300A PDF + OSHA ITA CSV (29 CFR 1904.32, 29 CFR 1904.41) — ✅ DONE

Shipped 2026-05-12 in a single BE+FE commit. Owner-gated verbatim review of 1904.32 + 1904.41 + Appendix A/B happened BEFORE any code; owner approved the 4-gap-decision design (snapshot table, certifier_title allowlist, verbatim 1904.32(b)(3) affirmation, hardcoded designation arrays).

- **Migration 029** `osha_300a_certified_summaries` — new snapshot table that freezes column totals at certify time per 1904.32(b)(5). 1:1 to `regulatory_certifications` via FK + UNIQUE. `case_ids_snapshot` JSON array gives inspectors a chain-of-custody list of contributing 300 Log rows. Stores `certifier_title_key` (CHECK-constrained to 4 keys per 1904.32(b)(4)) + verbatim `certifier_title_label`. Partial UNIQUE on `regulatory_certifications(site_id, period_year) WHERE type='osha_300a'` belt-and-braces against concurrent-cert races. No ALTER on existing tables.
- **`services/osha_300a.js`** — `aggregate300A()` pure-function read against `osha_300_log` returns the 12 column totals + sorted case_ids. `createCertifiedSnapshot()` wraps the regulatory_certifications INSERT + the snapshot INSERT in one tx. `CERTIFIER_TITLE_OPTIONS` exports the 4-key allowlist with verbatim 1904.32(b)(4) labels. `OSHA_300A_AFFIRMATION_TEXT` is the verbatim 1904.32(b)(3) third-person Act wording.
- **`services/osha_ita_designation.js`** — pure `itaDesignation(naics, employees)` per 1904.41(a)(1)(i)/(ii) + (a)(2). Appendix A (10+ codes with the 31/32/33 Manufacturing prefix) + Appendix B (~95 codes) hardcoded with `// Source: 88 FR 47347/47348` citations at the top of each array.
- **`services/pdf/osha_300a.js`** — US-Letter portrait single-page renderer. Reuses the WI-01 pdfkit pattern (margins.bottom: 0, lineBreak: false, manual word-wrap). Reads from the snapshot when certified; live aggregate when draft (header stamped "DRAFT — Not Certified" in red). Sign-here block carries the verbatim 1904.32(b)(3) text under "By signing, you affirm the following statement, made under 29 CFR 1904.32(b)(3):". Footer cites 1904.33(a) 5-year retention.
- **`services/csv/osha_ita.js`** — 28-column ITA CSV exporter. Column headers VERBATIM from `osha_ita_summary_data_csv_template-revised.csv` (not derived from data-model field names — the template wins per owner direction; data dictionary uses `ein_number` while the template uses `ein`). RFC 4180 encoding (no apostrophe doubling). `zip` and `ein` quoted unconditionally for leading-zero preservation. CRLF line terminators for OSHA ingest compat.
- **`services/csv/osha_ita_validator.js`** — refuses to serve a CSV OSHA would reject. Enforces every per-field rule (length, format, integer-only, required-field gate), the 7 cross-field rules from spec p.8 (Σ(M1..M6) = Σ(G..J); H↔K co-occur; K ≥ H; I→L; L→(H+I); employees > cases), the reasonability bounds (hours/employee 500..<8760), the size enum {1, 21, 22, 3} (non-contiguous per 2023-10-17 changelog), and the establishment_type enum with verbatim spec wording. Returns structured errors with spec-page citations.
- **Routes** — `GET /reports/osha-300a?format=pdf` and `?format=csv` branches. New `GET /reports/osha-300a/ita-designation` surfaces the 1904.41 determination. Certify route updated to require `certifier_title_key`, atomic snapshot creation. 3 new audit verbs.
- **FE** — `Osha300AReport` panel gains Download-PDF + Download-ITA-CSV buttons (CSV disabled until certified). 1904.41 designation banner shows above the cases grid. `CertifyOsha300AModal` becomes a dropdown of the 4 keys with verbatim Act labels; affirmation header reads "By signing, you affirm the following statement, made under 29 CFR 1904.32(b)(3):" + verbatim text.
- **Unit tests** — `server/scripts/osha-ita-csv.test.js` (36 `node:test` cases). Test 1: generated CSV column headers match the OSHA template byte-for-byte (regression gate if OSHA updates the template). Test 2+: each validator rule + each `itaDesignation` branch + Appendix verbatim spot-checks.
- **E2E** — `server/scripts/wi02-e2e.sh` (45 assertions). Cert workflow (4 negative + 5 positive paths), snapshot freezing, PDF download, CSV download + template parity at wire level, validator rejects out-of-spec data, designation logic for Appendix A + B + 250+ + <20, framework gate, cross-tenant, activity_log (3 new verbs), WI-C hash chain still verifies.

**Carry-forward TODOs:**
- **EIN capture at cert time** — current cert route accepts `ein` in the body but defaults to NULL. The wizard / certify modal should capture EIN on the establishment record per 1904.41(a)(4); v1 takes it via query string at CSV export time. Future WI: add an `ein` column to `sites` + a wizard hook.
- **City/state/zip split** — current sites table has a single `address` text field. ITA CSV requires city / state / zip as separate columns. v1 takes them via query string at export time. Future WI: split the sites.address column or add structured columns.
- **Appendix A/B updates** — when OSHA revises the appendices (currently 88 FR 47347/47348 from July 2023), update the hardcoded arrays in `services/osha_ita_designation.js`. The citation comments make the migration obvious.
- **1904.41(b)(6) partial-exemption detection** — out of scope for v1.
- **Reporting-deadline scheduler** — the designation endpoint computes the March 2 next-year deadline. WI-08 deadlines aggregator could surface it as a pending deadline; deferred until owner asks for it.

**Complexity:** L. **New tables:** 1. **Existing schema touched:** none (partial UNIQUE index added to `regulatory_certifications` doesn't change column definitions).

---

### WI-03: OSHA Form 301 PDF + DOB/hire-date/gender capture (29 CFR 1904.29) — ✅ DONE

Shipped 2026-05-12 in a single BE+FE commit.

- **Renderer** `server/services/pdf/osha_301.js` — US-Letter portrait. Three info sections (Employee 1–5, Physician 6–9, Case 10–18) + Completed by + 5-year retention notice in the footer (per 1904.33). Fields rendered with OSHA's original numbering verbatim so an inspector can map line-by-line. Yes/No checkboxes for 8/9; date-box visual for 3/4/11/18; manual word-wrap for 14–17 (sidesteps pdfkit's auto-pagination on wrapped text; see [[feedback_pdfkit_autopagination]]).
- **Data wiring** — pulls the primary `affected_persons` row + their first `injuries` row when present (post-WI-A), falling back to `type_data.injured_person` for pre-WI-A incidents. DOB / gender / date_hired captured by the WI-04 FE pass + WI-A wizard primary card.
- **Route** `GET /reports/osha-301/:incidentId?format=pdf` — reuses the same `org_id` WHERE clause as the JSON branch (cross-tenant 404 free). Audit verb `osha_301_pdf_downloaded` on `entity_type='incident'` so the download lands on the incident timeline.
- **FE** — Download-PDF button in `IncidentDetail` OSHA-recordable section (`client/src/pages/incidents/IncidentDetail.jsx`). Only renders when `osha_recordable === 1` per 29 CFR 1904.29(b)(2). Reuses the auth-fetch + blob-`<a>` pattern from WI-01.

**Smoke matrix verified end-to-end:**
- priya / INC-2026-0141 (recordable injury) → 1-page PDF with employee name, DOB, dates, ER/hospitalized checks, narrative (15), injury summary (16), substance (17) all populated.
- priya / non-recordable incident → 1-page PDF (route doesn't block; FE button hides the path for workers).
- acme requesting an org-1 incident → 404.
- Unknown incident id → 404.
- JSON branch unchanged.

**Complexity:** M. **New tables:** none. **Existing schema touched:** none.

---

### WI-04: RIDDOR Regulations 5 + 11 classification logic (RIDDOR 2013, Regs 5, 11) — ✅ DONE

Shipped 2026-05-12 across three commits + a test/cleanup follow-up. `server/services/riddor.js` now covers Reg 4(1)/(2), Reg 5(a)/(b), Reg 6, Reg 7, Reg 8, Reg 11(1)/(2), Reg 11(3)(a)/(b)/(c) carve-outs, plus the Reg 14(1) medical-procedure exception and the Reg 14(3) road-vehicle exception (both currently gating the Reg 5 path only — the Reg 4 path retains its existing behaviour pending owner approval to extend). Reg paragraph numbers cited verbatim in code comments. Output continues to write to the existing `incidents.riddor_category` / `riddor_ref` columns + `riddor_reports.written_deadline`. No schema changes.

**FE shipped** in the same WI: new `client/src/utils/riddor.js` with `RIDDOR_CATEGORY_LABELS` for the 9 categories, surfaced on `IncidentDetail` header badge + `ReportsPage` RIDDOR table. New "UK RIDDOR edge cases" card on `InjuryForm` captures `on_hospital_premises`, `reg14_medical_procedure_exception`, `reg14_3_road_vehicle_excluded` (computed from a 3-state select with the four Reg 14(3) carve-outs explained), `gas_reporter_role`, `gas_dangerous_fitting`, and the Reg 11(3)(b)/(c) carve-out flags. WI-D will hide this card for non-UK orgs.

**Tests:**
- `server/scripts/riddor-reg5-reg11.test.js` — 23 `node:test` cases (pure functional, no DB) — all pass.
- `server/scripts/wi04-e2e.sh` — 49 curl + sqlite3 assertions covering every Reg 5/11/14 branch + Reg 4/6/7/8 regressions + country gate + cross-tenant 404 + WI-C hash-chain still verifying + new categories surfacing in `/api/reports/riddor` — all pass.

**Hallucination-risk gate satisfied:** verbatim regulation text extracted from `docs/regulatory-sources/riddor/uksi_20131471_en.pdf` and cross-referenced against `indg453.pdf`. Reg paragraphs cited inline in `services/riddor.js` so future readers can verify against source.

**Carry-forward TODOs (in code):**
- Volunteer classification — treated as worker (conservative). Per-incident wizard flag would be ideal; needs owner approval.
- Reg 14(1)/(3) gating not yet applied to the Reg 4 (worker) path. Extending requires owner approval (changes existing behaviour).
- PATCH /incidents/:id does not re-run RIDDOR classification — pre-existing limitation, not introduced by WI-04. Adding hospitalization post-creation via affected_persons CRUD won't auto-fire Reg 5(a).

**Complexity:** S. **New tables:** none. **Commits:** `b0f8c53`, `df44eb3`, `3ac058e`.

---

### WI-05: RIDDOR F2508 PDF rendering (RIDDOR 2013, Regs 4–6)

HSE form layout. Existing `riddor_reports.f2508_data` JSON column already holds the data envelope (`schema.sql` line 284) — extend the JSON to carry every PRD §4.4 field.

- Wizard / IncidentDetail collects F2508 fields into `f2508_data` JSON (the column exists; we're widening the JSON shape, not the schema).
- `server/services/pdf/riddor_f2508.js` — layout matching HSE online form.
- `GET /reports/riddor/:id?format=pdf`.

**Hallucination-risk gate:** owner-supplied HSE F2508 visual reference required before pixel-level layout.

**Complexity:** L. **New tables:** none. **Depends on:** WI-04.

---

### WI-06: SafeWork NSW notification — engine + tables + routes + FE (WHS Act 2011 (NSW) ss.35–39) — ✅ DONE (engine), PDF deferred

Shipped 2026-05-12 in a single BE+FE commit. Verbatim s.35–s.39 text extracted from `docs/regulatory-sources/safework-nsw/whs-act-2011-nsw.pdf` (current version for 1 March 2026 to date) and owner-approved before any code was written. PDF renderer deferred to a follow-up commit per owner direction (no static Notify SafeWork form to mirror; design will follow standing instruction on government styling + no logo impersonation + submission footer).

- **Migration 028** — three additive tables, no `ALTER` on existing schema:
  - `safework_nsw_notifications` — one row per notifiable incident (UNIQUE(incident_id)). Top-level booleans `is_fatality` (s.35(a)), `is_serious_injury` (s.35(b)), `is_dangerous_incident` (s.35(c)). Sub-categories carried as JSON arrays of lookup keys (`serious_injury_sub_categories`, `dangerous_incident_sub_categories`). s.38(8)/s.39(4) carve-out via `excluded_mines_petroleum`. s.39 site-preservation captured as a CHECK-constrained enum + free-text notes + `inspector_arrived_at`. s.38(1)/(4) phone notification fields. s.38(4)(b) written-clock fields (`regulator_requested_written_at` + computed `written_deadline = +48h` + `written_submitted_at`). PCBU identity (`pcbu_name`, `pcbu_abn`, `pcbu_anzsic_code`). Numbering: `NSW-{YYYY}-{NNNN}` via `nextNswNumber()`.
  - `safework_nsw_serious_injury_types` — 11 rows seeded (10 enumerated s.36 + 1 "other prescribed by regulations" per the s.36 tail). Each row: `key`, `label` (verbatim Act wording), `section_ref` (e.g. `WHS Act 2011 (NSW) s.36(b)(i)`), `display_order`.
  - `safework_nsw_dangerous_incident_types` — 12 rows (11 enumerated s.37 + 1 "other prescribed" per s.37(l)).
- **Service** `server/services/safework_nsw.js` — pure `evaluateSafeworkNsw(incident, primaryAp, primaryInjury)` returns the intent object or null. Detection signals:
  - **Fatality (s.35(a)):** `incidents.osha_date_of_death` OR `primaryInjury.date_of_death` set, OR explicit `type_data.safework_nsw.is_fatality`.
  - **Serious injury (s.35(b)):** auto-derive `s36_a_inpatient_hospital` from `hospitalized=1`; all other s.36 sub-categories require explicit `type_data.safework_nsw.serious_injury_sub: string[]` (no fuzzy-match on free text, same discipline as 1904.39(b)(11)).
  - **Dangerous incident (s.35(c)):** explicit `type_data.safework_nsw.dangerous_incident_sub: string[]` only — these describe workplace events, not injury phenotypes.
  - **Mines & Petroleum carve-out (s.38(8)/s.39(4)):** `type_data.safework_nsw.excluded_mines_petroleum=true` short-circuits — row exists with `excluded_mines_petroleum=1`, deadlines aggregator emits nothing.
  - Plus writers: `syncSafeworkNswNotification` (idempotent), `logPhoneNotification`, `logRegulatorRequestedWritten` (computes the 48h written_deadline), `logWrittenSubmitted`, `setSitePreservation`, `setPcbu`.
- **POST + PATCH hooks** on `/incidents` (gated on `sites.country='AU'`) auto-create or re-classify. Idempotent.
- **ABN validator** `server/services/abn_validator.js` — ATO mod-89 weighted-sum (algorithm per [abr.business.gov.au/Help/AbnFormat](https://abr.business.gov.au/Help/AbnFormat)). 12-test `node:test` suite at `server/scripts/abn-validator.test.js` covering `51 824 753 556` (ATO canonical example), `48 123 123 124` (second valid-checksum ABN), single-digit tweak property test (≥ 89 of 99 tweaks must break the checksum), wrong length / empty / structured-return cases.
- **ANZSIC code** — 4-digit text format only in v1 per owner direction. ANZSIC source PDF kept in `docs/regulatory-sources/safework-nsw/` for a future code-list-seed WI.
- **Routes** in `server/routes/reports.js`:
  - `GET /reports/safework-nsw/lookups` (s.36 + s.37 enums)
  - `GET /reports/safework-nsw` (list, optional `site_id` / `year` params)
  - `GET /reports/safework-nsw/:incidentId` (per-incident)
  - `POST /reports/safework-nsw/:id/phone-notified` (elevated-only, idempotent)
  - `POST /reports/safework-nsw/:id/regulator-requested-written` (elevated-only — starts the 48h clock)
  - `POST /reports/safework-nsw/:id/written-submitted` (elevated-only, idempotent)
  - `POST /reports/safework-nsw/:id/site-preservation` (elevated-only; enum-constrained)
  - `POST /reports/safework-nsw/:id/pcbu` (elevated-only; ABN checksum-gated; ANZSIC `/^\d{4}$/`)
  - All routes 403 when caller's org `compliance_frameworks` lacks `safework_nsw`. Cross-tenant 404 via existing org-scoped WHERE clauses.
- **Deadlines aggregator** — new `loadNswNotificationsForIncidents` bulk helper + per-incident loader. Emits `safework_nsw_phone` (status `without_delay` → `submitted`, reg_ref `WHS Act s.38(1)`) and `safework_nsw_written` (only when `regulator_requested_written_at` set; deadline from `written_deadline`, reg_ref `WHS Act s.38(4)(b)`). Surfaces automatically on `GET /incidents` (list), `GET /incidents/:id` (detail), and `GET /incidents/:id/deadlines`. Mines & Petroleum carve-out short-circuits to no deadlines.
- **FE** — `client/src/api/safework_nsw.js`. `frameworkVisibility()` extended with `showNsw`. `SafeworkNswCardRows` renders s.35 categories + sub-categories (verbatim Act labels resolved from the lookup tables) + phone/written/site-preservation rows on `IncidentDetail`. `SafeworkNswModal` dispatch covers the four lifecycle actions. All gated on the `showNsw` framework flag.
- **5 new audit verbs:** `safework_nsw_opened` (POST + PATCH), `safework_nsw_phone_notified`, `safework_nsw_regulator_requested_written`, `safework_nsw_written_submitted`, `safework_nsw_site_preservation_updated`.
- **E2E coverage** — `server/scripts/wi06-e2e.sh` (57 assertions, all pass). Covers: lookups shape + verbatim labels, hospitalization auto-derive, explicit s.37 sub-categories, fatality via PATCH, minor incident → no row, Mines & Petroleum carve-out, AU-only gate, PATCH re-classification + idempotency, phone-notified + aggregator status flip, regulator-requested → 48h clock + written-submitted flip, s.39 site preservation, ABN checksum validation (valid normalised, invalid rejected), 4-digit ANZSIC validation, framework gate (3× 403 from non-NSW org), cross-tenant 404, activity_log entries (6 verbs), WI-C hash chain still verifies.

**Carry-forward TODOs:**
- WHS Regulation 2017 (NSW) additions to the s.36 / s.37 "prescribed by regulations" tail (s.36 tail clause + s.37(l)) — deferred to a future WI when regulation source is supplied. v1 captures via the `s36_other_prescribed_by_regulations` / `s37_other_prescribed_by_regulations` lookup rows + free text.
- s.38(7) 5-year retention obligation — satisfied implicitly by absence of deletion endpoints (per `docs/compliance-notes.md` §1).
- s.38(8) Mines & Petroleum Sites Act 2013 path — out of scope.
- PCBU "address" + "trading name" + "worker count" fields per original WI-06 spec — deferred (current PCBU capture is name + ABN + ANZSIC; expand when the PDF renderer lands).
- PDF renderer (`services/pdf/safework_nsw.js`) — deferred to a follow-up commit. The data shape is ready.

**Complexity:** L. **New tables:** 3. **Existing schema touched:** none.

---

### WI-07: OSHA 1904.39 severe-injury notification flow (29 CFR 1904.39) — ✅ DONE

Shipped 2026-05-12 in a single BE+FE commit. Per 1904.39(a)(1) fatalities are reportable within 8 hours; per 1904.39(a)(2) in-patient hospitalization, amputation, or loss of an eye within 24 hours.

- **Migration 027** `osha_severe_notifications` — additive. Columns: id, incident_id (FK), org_id (denormalized), category CHECK (`'fatality'|'hospitalization'|'amputation'|'loss_of_eye'`), deadline_at, phone_notified_at, phone_notified_by (FK users), osha_area_office, osha_reference, notes, created_at, created_by. UNIQUE(incident_id, category) so re-triggering the same category is idempotent. Two indexes on (org_id, incident_id) + (org_id, phone_notified_at, deadline_at) for the deadlines aggregator.
- **Service** `server/services/osha_severe.js` — pure `evaluateSevereInjury(incident, primaryAp, primaryInjury)` returning `{category, deadline_at}[]`. Detection signals:
  - **fatality**: `incidents.osha_date_of_death` OR `injuries.date_of_death` set, plus the 1904.39(b)(6) 30-day window gate. 8h clock from the death event.
  - **hospitalization**: `incidents.hospitalized = 1` OR `injuries.hospitalized = 1`. 24h clock from incident_datetime.
  - **amputation / loss_of_eye**: explicit reporter-set flag at `type_data.osha_severe.{amputation,loss_of_eye}`. Substring matching on `injury_type` is intentionally NOT used — 1904.39(b)(11) excludes avulsions, deglovings, scalpings, severed ears, chipped teeth, so a fuzzy match would over-report.
  - Plus writers `syncSevereNotifications`, `listSevereNotificationsForIncident`, `getSevereNotification`, `logPhoneNotification`. All org-scoped.
- **POST `/incidents` hook** — auto-creates osha_severe_notifications rows when the classifier matches. Gated on `sites.country = 'US'` so RIDDOR / SafeWork NSW incidents don't pick up phantom OSHA deadlines. Writes an `osha_severe_opened` activity_log entry per row.
- **Deadlines plug-in** — `server/services/deadlines.js` `computePendingDeadlines(incident, riddorReport, oshaSevereRows)` now folds OSHA severe rows into the same `pending_deadlines` array (status enum: `without_delay` / `overdue` / `due_today` / `due_soon` / `upcoming` / `submitted`). New `loadOshaSevereForIncidents` bulk helper for the incidents-list handler. Picks up automatically on `GET /incidents`, `GET /incidents/:id`, `GET /incidents/:id/deadlines`.
- **Routes** — `GET /reports/osha-severe/:incidentId` (list) + `POST /reports/osha-severe/:notificationId/phone-notified` (write). Phone-notified is elevated-only, idempotent, captures `area_office` + `osha_reference` + free-text notes per 1904.39(a)(3)(i)/(ii). Audit verb `osha_severe_phone_notified` on `entity_type='incident'`.
- **FE** — `client/src/api/reports.js` gains `getOshaSevere` + `logOshaSeverePhoneNotified`. `IncidentDetail.jsx` loads severe rows alongside incident + affected_persons, renders one row per category in the OSHA-recordable section (with category-specific labels like "Fatality (8h)"), shows a "Log phone call" button for elevated users on each unsubmitted row, and renders the `LogOshaSevereModal` capturing area office + reference + notes. The existing `DeadlineBadge` automatically picks up `osha_severe_*` kinds since the BE attaches them to `pending_deadlines`.
- **PATCH /incidents/:id hook** — `osha_date_of_death`, `hospitalized`, or `type_data.osha_severe.*` change → re-runs `syncSevereNotifications` (idempotent via UNIQUE(incident_id, category)). Fixes the "fatality realized later" / "hospitalized next day" cases that don't surface at POST time. Writes the same `osha_severe_opened` audit verb, with `metadata.triggered_by: 'patch'`. `osha_date_of_death` was also added to the PATCH updatable allowlist.
- **FE deadline-block placement fix** — initially the WI-07 phone-notif rows were rendered inside `r.osha_recordable === 1`, which hid them when the wizard's recordability auto-detect hadn't flipped the flag yet. 1904.39 (reporting) and 1904.7 (recordability) are independent duties, so the WI-07 rows now render alongside the OSHA recordable row, gated only on `showOsha` and the presence of severe rows. Caught during click-flow testing.
- **E2E coverage** — `server/scripts/wi07-e2e.sh` (46 assertions, all pass). Covers hospitalization auto-create, amputation/loss-of-eye explicit flags, no-amputation-from-substring (1904.39(b)(11) carve-outs), multi-category via PATCH, idempotent PATCH, US-only gate (UK + AU sites get zero rows), phone-notified write + idempotency + worker 403, cross-tenant 404 on GET + write, list-endpoint integration, activity_log entries for both POST + PATCH paths, WI-C hash chain still verifies.
- **Carry-forward TODOs:**
  - 1904.39(b)(7) "employer learns later" clock — currently computes from `incident_datetime` (or `osha_date_of_death` for fatality). Requires reporter signal about when they learned; deferred owner approval.
  - 1904.39(b)(10) observation-only carve-out — trusted to the reporter's `hospitalized` flag. No DB signal exists to distinguish "care/treatment" vs "observation/diagnostic".

**Complexity:** M. **New tables:** 1.

---

### WI-08: Regulatory deadline countdown UI (29 CFR 1904.39, RIDDOR Reg 4, WHS Act s.38) — ✅ DONE

Shipped 2026-05-12 (evening) in `449539b` — single BE+FE commit, no schema. Today RIDDOR is the only source the aggregator sees; WI-06 (SafeWork NSW) and WI-07 (OSHA 1904.39) plug into the same `server/services/deadlines.js` helper when they land. TODO markers in code mark the plug-in points.

Shape returned by `GET /incidents/:id/deadlines` and attached to list + detail payloads:

```
[{ kind, jurisdiction, label, reg_ref, deadline_at, submitted_at, status }]
```

`status` is one of: `without_delay`, `overdue`, `due_today`, `due_soon`, `upcoming`, `submitted`. `mostUrgent(deadlines)` ranks in that order (with absolute `deadline_at` as a tie-breaker) and is used by the list rows so each card shows one pill, while the detail header renders all of them.

`DeadlineBadge.jsx` derives color from status (`--sds-error` / `--sds-warning` / `--sds-info` / `--sds-success` tokens), takes a `compact` prop for list-row use, and exposes the full reg paragraph + dates via tooltip.

19-assertion E2E suite at `server/scripts/wi08-e2e.sh` covers: specified-injury phone+written, status flips after `phone_notified_at` / `written_submitted_at`, over-7-day single-entry, disease zero-entry, US non-RIDDOR zero-entry, cross-tenant 404, list-row attachment + ranking.

**Complexity:** S. **New tables:** none. **Depends on:** WI-06, WI-07 — but currently usable without them via the RIDDOR source.

---

### WI-09: Generic Incident Report PDF (no specific regulation; product floor) — ✅ DONE

Shipped 2026-05-12. Universal fallback per PRD §4.6 — internal record artifact for any incident regardless of jurisdiction, classification, or completeness. NOT a regulatory submission; the footer makes that explicit.

- **`server/services/pdf/generic_incident.js`** — multi-page portrait renderer, 8 sections (overview, affected_persons, investigation, causes, capas, classifications, attachments, audit). Manual word-wrap + manual page management via `nextPageIfNeeded()` (same pdfkit pattern as WI-01/03 with `margins.bottom: 0`). Each section gracefully no-ops when its source data is absent — empty sections render "No X recorded" placeholder so an inspector sees the field was checked and is empty, not just missing. Customer-brandable: `organizations.name` in the header (no new branding columns added — owner direction). Footer carries `Generated by EHS Incident Management on YYYY-MM-DD` + the internal-record disclaimer naming OSHA ITA, HSE RIDDOR, SafeWork NSW Notify as the correct submission channels.
- **Route** `GET /reports/incidents/:incidentId/generic?format=pdf` — `org_id` scoped (404 cross-tenant), audit verb `generic_incident_pdf_downloaded`, `?sections=` query param filters which sections render (defaults to all 8; bogus filter falls back to all defaults), `?audit_limit=N` caps the audit-trail slice (default 25, max 100). No framework gate — this is the universal floor, available to every org. No elevated-role check — workers can download a report of their own incident.
- **FE** — "Download PDF" button in the IncidentDetail Details card, second row (right after Status). Always visible regardless of incident state / type / classification. Reuses the auth-fetch + blob-`<a>` pattern from the OSHA 301 download.
- **Unit tests** — `server/scripts/generic-incident-pdf.test.js` (20 `node:test` cases). Streams the renderer output to a buffer, parses text via the local poppler `pdftotext`. Each section gets a populated case and an empty case. Section filter behaviour + customer branding + footer disclaimer + all-8-renderable sanity test.
- **E2E** — `server/scripts/wi09-e2e.sh` (30 assertions). Renders for Investigating / New / Closed incidents and every type (injury / nearmiss / env / dangerous). Cross-tenant 404, unknown id 404, non-PDF format 400. Section filter respected including bogus-filter fallback. Worker role download allowed. Framework-less org (SafeWork-NSW-only) renders fine. Customer org name + platform-name in footer. activity_log metadata carries the sections list. WI-C hash chain still verifies.

**Complexity:** M. **New tables:** none. **Existing schema touched:** none.

---

### WI-10: Activity-log capture of regulatory submissions (29 CFR 1904.33 inspection support, RIDDOR Reg 12, WHS Reg 12 (NSW))

Inspectors must be able to see when and how a regulatory submission was made. Currently `regulatory_submissions` (migration 001 line 161) records this, but `activity_log` is not consistently updated when these rows are created.

- Audit existing route handlers in `reports.js` (300A certify, RIDDOR creation) and the new ones from WI-06/WI-07 — confirm each writes a corresponding `activity_log` row via `writeActivity()`.
- Add IP + user-agent to those specific `writeActivity()` calls (passing through `req.ip`, `req.headers['user-agent']` in the `metadata` JSON for now — WI-C will promote them to first-class columns).
- Sweep all current `writeActivity()` callers for consistency: do all UPDATE-equivalent actions pass a `diffFields()` result in `metadata`?

**Complexity:** S. **New tables:** none. **Depends on:** none.

---

### WI-11: Documentation pass — `docs/compliance-notes.md`

Captured operational compliance posture in this PR. ✅ landed in Chunk 1.

**Complexity:** S. Pure documentation.

---

## New work items (authorized 2026-05-11)

Full specs in `docs/plan-2026-05-11.md` Part 2. Short pointers below.

### WI-A: Multi-person incident support

New `affected_persons` + `injuries` tables that supplement (not replace) the legacy `type_data.injured_person` JSON. Backfill from JSON; dual-write going forward. New CRUD endpoints + IncidentDetail rendering. **No wizard changes in this WI.**

**Complexity:** L. **New tables:** 2. **Existing schema touched:** none. **Chunk:** 5.

### WI-B: Recordability override approval workflow — ✅ DONE

Shipped 2026-05-12 in two commits + a docs/memory follow-up.

**BE (`7ee1983`):**
- Migration 026 — `classification_override_requests` table per spec (id, incident_id, org_id, jurisdiction, field, current_value, proposed_value, reason, status, requested_by, requested_at, decided_by, decided_at, decision_note). Three indexes including the partial UNIQUE on `(incident_id, field) WHERE status='pending'`. Two BEFORE triggers (INSERT + UPDATE) raising `ABORT` when `requested_by = decided_by`.
- Service module `server/services/classification_overrides.js` with `OVERRIDABLE_FIELDS` allowlist (currently `osha_recordable`, `riddor_reportable`) plus state-transition helpers (`createRequest`, `approveRequest`, `rejectRequest`, `withdrawRequest`). All transitions wrap the boolean flip + activity_log write in a single transaction.
- Route file `server/routes/override_requests.js` exports two Routers — `incidentScopedRouter` (`POST/GET /:id/override-requests` mounted at `/api/incidents`) and `globalRouter` (`GET /?status=pending`, `GET /:rid`, `POST /:rid/{approve,reject,withdraw}` mounted at `/api/override-requests`). Splitting avoids path collisions from mounting one router at two prefixes.
- `console.warn` added to `routes/incidents.js` PATCH handler when `osha_recordable` / `riddor_reportable` are flipped directly — measures usage without forbidding the path (per spec).
- 4 audit verbs added to `audit_actions_catalog.js`.
- 42-assertion E2E suite at `server/scripts/wib-e2e.sh` covering create paths + global queue + self-approval guard (route + DB trigger) + approve/reject/withdraw + WI-C hash chain still verifying.

**FE (`e660b16`):**
- `client/src/api/override_requests.js` — 6 client wrappers.
- `OverrideRequestModal.jsx` — generic across overridable fields; auto-derives proposed_value as NOT current.
- `RecordabilityVerifyCard.jsx` rewritten to show inline pending-state banner with Approve/Reject (elevated non-requester) or Withdraw (requester) buttons alongside the existing Re-verify flow.
- `/approvals` page at `client/src/pages/approvals/ApprovalsPage.jsx` with `apr-` prefixed CSS — global pending queue for elevated roles; non-elevated users see a permission notice.
- Sidebar nav item with `elevatedOnly: true` flag hides Approvals for workers.

**Complexity:** M. **New tables:** 1. **Existing schema touched:** none. **Chunk:** 6.

### WI-C: Activity log integrity (hash chain)

`ALTER TABLE activity_log ADD COLUMN` for `prev_hash`, `entry_hash`, `ip_address`, `user_agent`, `field_diffs`. Per-org chain. Append-only triggers. Verify endpoint. **This is the only authorized `ALTER TABLE` on an existing table in the current plan; per-WI authorization rule (memory `feedback_no_structural_changes.md`) applies.**

**Complexity:** L. **New tables:** none. **Existing schema touched:** `activity_log` (additive columns + triggers). **Chunk:** 4.

### WI-D: Jurisdiction-aware wizard + forms — ✅ DONE 2026-05-12 (night) — `2e708d0`

Shipped in a single FE commit (no schema). The spec below is preserved for reference / future framework additions.

**Problem.** The wizard currently asks every reporter for the union of OSHA + RIDDOR + SafeWork NSW identity fields, regardless of which jurisdictions the org operates under. A US-only org sees RIDDOR-specific labels they don't need; a UK-only org sees OSHA fields. Reports surface already gates by `org.compliance_frameworks` (`client/src/utils/frameworks.js` → `frameworkVisibility(user)`), but the wizard does not. The user wants intake to mirror the org's regulatory posture.

**Approach.** Drive form-section visibility from a `jurisdictionForContext({user, siteId, sites})` helper that combines the org's `compliance_frameworks` array (already on the JWT-loaded `user` object) with the selected site's `country`. Each field block is tagged with the jurisdiction(s) it serves; the helper decides what to render.

**Rules:**
- Org `compliance_frameworks` is the master switch. Whitelist (from `server/routes/auth.js` line 15–18): `osha_300`, `osha_300a`, `osha_301`, `riddor_f2508`, `safework_nsw`, `generic`.
- Site `country` resolves multi-framework orgs: a UK site under a US+UK org gets RIDDOR; a US site gets OSHA.
- Mapping:
  - Any `osha_*` framework + site.country = 'US' → OSHA section shown.
  - `riddor_f2508` framework + site.country = 'UK' → RIDDOR section shown.
  - `safework_nsw` framework + site.country = 'AU' → NSW section shown.
  - `generic` only OR no match → show only the minimum field set (name, job_title, description, body part).
- A "Show all fields" toggle stays available so a reporter can override for unusual cases (e.g. multi-jurisdiction incident, exchange visitor).
- Reports surface already does the right thing via `frameworkVisibility`; this WI extends the pattern into intake.

**Files to touch:**

Client (FE):
- `client/src/utils/frameworks.js` — extend with `jurisdictionForContext()` and a registry mapping field-keys → required-by-jurisdiction. Pattern matches the existing `frameworkVisibility(user)` helper.
- `client/src/pages/wizard/ReportWizard.jsx` — pass `jurisdiction` down to type-form steps. Compute once site is picked.
- `client/src/pages/wizard/types/InjuryForm.jsx` — gate the field rows added in the WI-A pass:
  - **Always-shown** (minimum set): name, job_title, body part, injury type.
  - **OSHA-gated**: DOB, gender, date_hired, address, ER-treated/hospitalized/hosp-date, days_away/restricted.
  - **RIDDOR-gated**: DOB (for age derivation), gender, address, phone, employment status, days away >7 trigger note.
  - **NSW-gated**: DOB, gender, address, phone, employment status, PCBU question, site preservation question.
- `client/src/pages/wizard/types/IllnessForm.jsx` — same gating pattern for the illness type.
- `client/src/pages/incidents/modals/AffectedPersonModal.jsx` — accept an optional `jurisdiction` prop to gate fields the same way; default to "show all" when used from IncidentDetail (after-the-fact edits often need the full set).
- "Show all fields" toggle: one checkbox at the top of the Injured-person card; defaults to off; persists in component state, not in `type_data` (operator hint, not data).

Server (BE):
- No schema changes. `compliance_frameworks` is already on `organizations`; `sites.country` exists.
- `server/routes/auth.js` — confirm `compliance_frameworks` flows to the user object on every /me + /login response. Verified during WI-A; no change expected.
- (Optional, low priority) reject incident POSTs with fields outside the active jurisdiction set — out of scope for v1 since the BE already accepts the union; FE gating is the source of truth.

**Acceptance:**
- A US-only org (e.g. `acme@sdsmanager.com`) reporting an injury sees OSHA fields only — no phone/address blocks unless "Show all fields" is on.
- A UK-only org (e.g. `riddor-test@example.com`) reporting an injury sees RIDDOR fields only.
- An AU-only org (e.g. `sydney-test@example.com`) sees NSW fields only.
- A multi-framework org (e.g. `priya@sdsmanager.com` — OSHA+RIDDOR) reporting at a US site sees OSHA fields; reporting at a UK site sees RIDDOR fields.
- A `generic`-only org sees the minimum field set.
- IncidentDetail card display logic does NOT gate by jurisdiction (it shows whatever was captured at intake — auditors see what they see).
- "Show all fields" toggle reveals every section regardless of jurisdiction.
- Existing single-framework demo accounts (acme, riddor-test, sydney-test) become the smoke-test matrix.

**Hallucination-risk gate:** None. The mapping is locked here; the rules are intra-app logic, not new regulatory enumerations. (Reg-specific lookups like NSW serious-injury categories still live in their own WIs.)

**Complexity:** M. **New tables:** none. **Existing schema touched:** none. **Chunk:** 7a (slots between WI-08 deadline UI and WI-01 OSHA 300 PDF — see updated chunk order below).

**Dependencies:**
- Useful after WI-A (multi-person) — the gating extends to the Add-person modal.
- Independent of WI-04 / WI-05 / WI-06 — those build the engines/PDFs; this WI just decides what to capture.
- Should land before any PDF rendering (WI-01/02/03/05/06/09) so the renderers don't read fields the intake never captured.

---

## Descoped (per owner directive 2026-05-11, with rationale)

| Item | Rationale |
|---|---|
| Classification entity / per-jurisdiction rows | Owner directive: keep boolean+verification model. WI-B addresses the override-control gap without a new entity. |
| Hash-chained audit beyond WI-C | WI-C is sufficient. No further structural change to `activity_log`. |
| CAPA enum widening (types, status, hierarchy of controls, effectiveness review) | Owner directive: keep enums as-is. |
| Role enum widening | Owner directive: keep enums as-is. |
| `incidents.status` adds `Draft` | Owner directive: keep enums as-is. If needed later, build `incident_drafts` table. |
| Investigation peer-review state | Owner directive: keep enums as-is. |
| Fishbone / ICAM tables + UI | Methodology choice, not regulation. |
| Investigation report PDF | Not regulatory. Reconsider as part of WI-09 if owner wants investigation findings included there. |
| Notification ack + escalation + cron + email/SMS | Not regulatory. Deadlines surfaced via WI-08 in-app. |
| Webhooks | Not regulatory. |
| SAML / OIDC SSO | Not regulatory. |
| MFA | Not regulatory at OSHA/RIDDOR/WHS level. |
| Many-to-many user↔site | Not regulatory. |
| GDPR Art 17 erasure code | Descoped with rationale in `compliance-notes.md` §3. |
| GDPR Art 20 bulk export | Manual SQL export until owner schedules. |
| WCAG 2.1 AA audit + remediation | Not directly imposed by EHS regulations. |
| i18n scaffold | Not regulatory. |
| Offline mobile capture | Not regulatory. |
| TRIR / LTIFR formula re-verification | Internal metric, not regulatory. |
| Customer branding for Generic report | Not regulatory. |
| Encryption-at-rest application code | Deployment concern; `compliance-notes.md` §4. |
| Retention enforcement code | Satisfied by absence of deletion endpoints; `compliance-notes.md` §1. |
| Amendment workflow | OSHA 1904.33 update obligation satisfied by direct edits + `activity_log` history. |

---

## Hallucination-risk gates summary

Do not start these without owner-supplied authoritative source material:

- **WI-02** — OSHA ITA CSV upload template.
- **WI-04** — HSE Schedule 1 (diseases) + Schedule 2 (dangerous occurrences).
- **WI-05** — HSE F2508 visual reference.
- **WI-06** — WHS Act 2011 (NSW) s.36 / s.37 enumerations, official Notify SafeWork NSW form, ANZSIC code list.

For everything else, code with PRD as the spec and surface for owner review.
