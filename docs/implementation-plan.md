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
| 1 | Setup (this doc + plan + compliance-notes + memory + roadmap) | Current chunk. |
| 2 | WI-04 RIDDOR Reg 5 + 11 | Gated on `docs/regulatory-sources/riddor/` being populated. |
| 3 | WI-10 Activity-log audit consistency | No new columns; sweep call sites. |
| 4 | WI-C Activity log integrity (hash chain) | First and only owner-authorized `ALTER TABLE` on an existing table. |
| 5 | WI-A Multi-person incidents (no wizard) | Backfill + dual-write + detail page. |
| 6 | WI-B Override approval workflow | New table + new routes + UI. |
| 7 | WI-08 Deadline countdown UI | Reads existing + WI-06/WI-07 fields. |
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

### WI-04: RIDDOR Regulations 5 + 11 classification logic (RIDDOR 2013, Regs 5, 11)

`server/services/riddor.js` is missing Reg 5 (non-workers — accidents to members of the public taken to hospital) and Reg 11 (gas incidents).

- Add Reg 5 branch keyed on the existing affected-person type field and outcome = hospitalization.
- Add Reg 11 branch keyed on incident type / dangerous-occurrence subtype = gas.
- Output value goes into existing `incidents.riddor_category` / `riddor_ref` columns.

**Hallucination-risk gate:** owner-supplied HSE Schedule 1 (diseases) + Schedule 2 (dangerous occurrences) reference required. Annotate gaps in `riddor.js` lines 23 / 45–50 but do not extend without source.

**Complexity:** S. **New tables:** none.

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

### WI-08: Regulatory deadline countdown UI (29 CFR 1904.39, RIDDOR Reg 4, WHS Act s.38)

Pure presentation layer. Reads existing fields plus the new ones from WI-06 / WI-07.

- `client/src/components/incidents/DeadlineBadge.jsx` — countdown pill.
- `server/services/regulatory.js` — extend to return an aggregated `pending_deadlines: [{kind, deadline_at, status}]` for an incident, sourced from:
  - OSHA 1904.39 → from WI-07's `osha_severe_notifications.deadline_at`.
  - RIDDOR 10-day / 15-day → existing `riddor_reports.written_deadline`.
  - WHS 48-hour → from WI-06's `safework_nsw_notifications.written_deadline`.
- New endpoint `GET /incidents/:id/deadlines`.
- Surfaced in IncidentsList rows and IncidentDetail header.

**Complexity:** S. **New tables:** none. **Depends on:** WI-06, WI-07.

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

### WI-B: Recordability override approval workflow

New `classification_override_requests` table. Approve/reject/withdraw routes. Self-approval forbidden. Existing direct-edit path stays but emits `console.warn`. `RecordabilityVerifyCard` rewrite + global pending-queue panel.

**Complexity:** M. **New tables:** 1. **Existing schema touched:** none. **Chunk:** 6.

### WI-C: Activity log integrity (hash chain)

`ALTER TABLE activity_log ADD COLUMN` for `prev_hash`, `entry_hash`, `ip_address`, `user_agent`, `field_diffs`. Per-org chain. Append-only triggers. Verify endpoint. **This is the only authorized `ALTER TABLE` on an existing table in the current plan; per-WI authorization rule (memory `feedback_no_structural_changes.md`) applies.**

**Complexity:** L. **New tables:** none. **Existing schema touched:** `activity_log` (additive columns + triggers). **Chunk:** 4.

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
