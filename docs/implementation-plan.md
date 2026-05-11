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
| **7a** | **WI-D Jurisdiction-aware wizard + forms** | **Next.** Owner directive 2026-05-11 evening — gate fields by org's compliance_frameworks + site.country. WI-04 added a "UK RIDDOR edge cases" card that WI-D should hide for non-UK orgs. Spec below. |
| 8+ | WI-01, WI-05, WI-06, WI-07, WI-02, WI-09 | OSHA 300 PDF → RIDDOR F2508 → SafeWork NSW → OSHA 1904.39 → OSHA 300A + ITA → Generic PDF. Order may shift on hallucination-risk gate readiness. |

---

## In-scope work items

### WI-01: OSHA Form 300 PDF rendering (29 CFR 1904.29)

OSHA prescribes the Form 300 layout. Today `GET /reports/osha-300` returns JSON only.

- New file `server/services/pdf/osha_300.js` — render the prescribed grid from `osha_300_log` rows using `pdfkit`.
- Privacy-case substitution (`is_privacy_case` → "privacy case" instead of name) per 29 CFR 1904.29(b)(7). Column already exists from migration 016.
- Extend `GET /reports/osha-300` to honor `?format=pdf`.
- Add download button in `client/src/pages/reports/ReportsPage.jsx`.
- Add `pdfkit` to `server/package.json` (first PDF WI to land carries the dependency).

**Complexity:** M. **New tables:** none. **Existing columns touched:** none.

---

### WI-02: OSHA Form 300A PDF + OSHA ITA CSV (29 CFR 1904.32, 29 CFR 1904.41)

The 300A annual summary has both a paper-posting form (1904.32) and an electronic ITA submission (1904.41). Both formats are prescribed.

- `server/services/pdf/osha_300a.js` — annual summary PDF for posting.
- `server/services/csv/osha_ita.js` — ITA upload CSV.
- Extend `GET /reports/osha-300a` for `?format=pdf` and `?format=csv` (ITA).

**Hallucination-risk gate:** owner-supplied OSHA ITA CSV template required before coding. Scaffold with `// TODO: confirm against OSHA ITA upload template` until provided.

**Complexity:** M. **New tables:** none. **Depends on:** WI-01 (for `pdfkit`).

---

### WI-03: OSHA Form 301 PDF + DOB/hire-date/gender capture (29 CFR 1904.29)

Form 301 is per-recordable-incident and prescribed. PRD §4.3 fields not currently captured: employee DOB, date hired, gender. Plan stores them in `incidents.type_data.injured_person` per `compliance-notes.md` §2.

- `client/src/pages/wizard/types/InjuryForm.jsx` — three new fields under the injured-person section, written to `type_data.injured_person.{dob,date_hired,gender}`.
- `server/services/pdf/osha_301.js` — render the prescribed form, reading from `type_data` (and, after WI-A, also from `affected_persons` / `injuries` where present).
- Extend `GET /reports/osha-301/:incidentId` for `?format=pdf`.

**Complexity:** M. **New tables:** none. **Existing schema touched:** none (JSON write only).

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

### WI-06: SafeWork NSW notification — engine + form + PDF (WHS Act 2011 (NSW) ss.36–39, WHS Reg 2017 (NSW))

Largest in-scope item. Fully additive — all new tables, no touches to existing schema. `site_preservation_status` lives on the new NSW table only per `compliance-notes.md` §9.

- **Migration `0XX_safework_nsw.sql`** — new tables only:
  - `safework_nsw_notifications` — one row per notifiable incident. Notifier details, PCBU details (legal name, trading name, ABN, address, ANZSIC code, worker count), workplace details, awareness_datetime, incident type (death/serious/dangerous), affected-person details (conditional), dangerous-incident details (conditional), `site_preservation_status` (s.39), plant/substances/equipment, witnesses summary, immediate actions, other-notifications-made, declaration, `phone_notified_at`, `written_submitted_at`, `written_deadline`. References `incidents.id`.
  - `anzsic_codes` lookup — seeded from a user-supplied CSV. **Do not invent codes.**
  - `safework_nsw_dangerous_incident_types` lookup — seeded from user-supplied list per s.37.
  - `safework_nsw_serious_injury_types` lookup — seeded from user-supplied list per s.36.
- **New services:**
  - `server/services/safework_nsw.js` — classification engine matching ss.35–37. Pattern matches `riddor.js` / `recordability.js`.
  - `server/services/abn_validator.js` — ATO ABN checksum (well-documented public algorithm).
  - `server/services/pdf/safework_nsw.js` — PDF matching the SafeWork NSW Notify form.
- **New routes:**
  - `GET /reports/safework-nsw`, `GET /reports/safework-nsw/:id`, `GET /reports/safework-nsw/:id?format=pdf`.
  - `POST /reports/safework-nsw/:id/phone-notified` — log s.38(2) phone notification.
  - `POST /reports/safework-nsw/:id/written-submitted` — log s.38(4) written submission.
- **New API client + UI:**
  - `client/src/api/safework_nsw.js`.
  - `client/src/pages/reports/ReportsPage.jsx` — AU section gated on `org.compliance_frameworks` including `safework_nsw`.
  - Wizard hook: when `safework_nsw` is active and the engine flags notifiability, prompt for s.39 site preservation status + the additional NSW fields. Wizard data flows into `safework_nsw_notifications` on save — does **not** require any `incidents` column changes.

**Hallucination-risk gate:** owner-supplied authoritative sources required for WHS Act 2011 (NSW) s.36 serious-injury enumeration, s.37 dangerous-incident enumeration, the official Notify SafeWork NSW form, and an ANZSIC code list.

**Complexity:** L (≥ 2 sessions). **New tables:** 4.

---

### WI-07: OSHA 1904.39 severe-injury notification flow (29 CFR 1904.39)

Death must be reported within 8 hours; in-patient hospitalization, amputation, or loss of an eye within 24 hours. The schema already enumerates these in `regulatory_certifications.type IN ('osha_fatality_report','osha_24hr_report')` (migration 001 line 145) but there is no routing or capture flow.

- **New migration** — new table only:
  - `osha_severe_notifications` (id, incident_id, category enum `'fatality'|'hospitalization'|'amputation'|'loss_of_eye'`, deadline_at, phone_notified_at, phone_notified_by, osha_area_office, osha_reference, notes, created_at).
- **Service** `server/services/osha_severe.js` — given an incident, decide whether s.1904.39 applies (using existing `incidents.osha_date_of_death`, `incidents.hospitalized`, body part flags) and compute the 8h or 24h deadline from `incidents.incident_datetime`.
- **Routes:** `POST /reports/osha-severe/:incidentId`, `POST /reports/osha-severe/:id/phone-notified`.
- **UI:** countdown badge in IncidentDetail when applicable; entry point to log the phone notification.

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

### WI-09: Generic Incident Report PDF (no specific regulation; product floor)

The universal fallback per PRD §4.6. Not regulatory but kept in scope per `plan-2026-05-11.md` Part 1 #7: it's the only PDF available for incidents outside the supported jurisdictions.

- `server/services/pdf/generic_incident.js`.
- `GET /reports/generic/:incidentId?format=pdf`.
- Fixed layout in this WI; org branding fields are a separate non-regulatory item, descoped.

**Complexity:** M. **New tables:** none.

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

### WI-D: Jurisdiction-aware wizard + forms (authorized 2026-05-11, evening)

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
