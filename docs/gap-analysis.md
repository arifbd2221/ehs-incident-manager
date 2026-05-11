# Gap Analysis — Incident Management Platform vs. PRD

Audit pass: 2026-05-11
Branch: `backend` (3 commits ahead of `main`; PR #13 open)
Scope: full repo — `server/`, `client/`, `server/db/migrations/`, PRD.md, CLAUDE.md

Status legend: **Done** · **Partial** · **Missing** · **Conflicts-with-PRD**

A note on terminology: existing tables predate the PRD vocabulary. Where the PRD says **Classification**, **AffectedPerson**, **RegulatoryReport**, **AuditEvent**, the schema uses ad-hoc columns on `incidents`, single-injury `type_data` JSON, the `osha_300_log` / `riddor_reports` tables, and `activity_log` respectively. Mismatches are flagged but renaming is left as a product decision (see §6 of the implementation plan).

---

## Section 1 — PRD §2 Regulatory Compliance Coverage

### 2.1 United States — OSHA (29 CFR 1904)

| PRD §2.1 obligation | Status | Evidence | Gap |
|---|---|---|---|
| Recordability per 29 CFR 1904.7 (all 6 criteria) | **Done** | `server/services/recordability.js` lines 44–127 covers death, days-away, restricted/transfer, medical-treatment-beyond-first-aid, loss of consciousness, significant diagnosis. Full 5-gate flow lines 150–237. | Verification UI exists (`client/src/components/incidents/RecordabilityVerifyCard.jsx`). |
| Recordable vs non-recordable distinction | **Done** | `incidents.osha_recordable` boolean (migration 002 line 52) + `osha_recordability_type` text. | — |
| Days-away / restricted-duty tracking | **Done** | `incidents.osha_days_away`, `osha_days_restricted` (schema lines 76–77). | No daily-clock UI to log day counts over time — currently a single field. |
| Privacy-concern case handling (1904.29(b)(7)) | **Partial** | `incidents.osha_privacy_case` column (migration 016 line 18); `osha_300_log.is_privacy_case` (migration 016 line 44). | No UI to set the flag at classification time; report code path needs to substitute "privacy case" for the name in the 300 log render — verify in `server/routes/reports.js` lines 43–75. |
| 5-year retention (1904.33) | **Missing** | No retention policy enforced in code; no deletion guard tied to recordable cases. | No `retention_locked_until` column or background sweep. |
| 8-hour fatality / 24-hour hospitalization/amputation/loss-of-eye notification (1904.39) | **Missing** | Schema has `regulatory_certifications.type IN ('osha_300a','riddor_f2508','osha_fatality_report','osha_24hr_report')` (migration 001 line 145) so types are enumerated, but **no endpoint or UI** to file/track these notifications, and no deadline clock. | Build §1904.39 notification flow + countdown. |

### 2.2 United Kingdom — RIDDOR 2013

| PRD §2.2 obligation | Status | Evidence | Gap |
|---|---|---|---|
| Regulation 6 (work-related deaths) | **Done** | `server/services/riddor.js` line 30. | — |
| Regulation 4 (specified injuries) | **Done** | `riddor.js` line 35 covers fracture, amputation, crush, concussion, vision loss. | List is shorter than the PRD's full enumeration (scalpings, serious burns, asphyxia, loss-of-consciousness-from-head-injury). Re-verify against HSE schedule; flagged as **hallucination-risk** per memory `feedback_regulatory_truth.md` — confirm against user-supplied source. |
| Regulation 4 (over-7-day incapacitation) | **Done** | `riddor.js` deadline calc lines 56–61. | — |
| Regulation 5 (accidents to non-workers) | **Missing** | Not implemented in `riddor.js`. | Add non-worker branch (e.g. members of public to hospital). |
| Regulation 7 + Schedule 2 (dangerous occurrences) | **Partial** | `riddor.js` line 23 references dangerous occurrences; `incidents.type = 'dangerous'` exists. | Schedule 2 enumeration not present; treat as **hallucination-risk** — needs user-supplied list. |
| Regulation 8 (occupational diseases) | **Partial** | `riddor.js` lines 45–50 covers carpal tunnel, dermatitis, asthma, tendonitis/tenosynovitis, hearing loss, cancer. | Schedule 1 disease list incomplete; treat as **hallucination-risk** — needs user-supplied authoritative list. |
| Regulation 11 (gas incidents) | **Missing** | Not implemented. | Add gas-incident category and routing. |
| Reporting timeframes (10-day, 15-day, without-delay) | **Partial** | `incidents.riddor_phone_notified_at`, `riddor_written_submitted_at` (schema lines 82–83); `riddor_reports.written_deadline` (schema line 282); `riddor.js` `calculateDeadline()` lines 56–61. | No countdown UI; no escalation if deadline missed. |
| 3-year record retention | **Missing** | Not enforced. | Same retention gap as OSHA. |

### 2.3 Australia — SafeWork NSW (WHS Act 2011)

| PRD §2.3 obligation | Status | Evidence | Gap |
|---|---|---|---|
| s.36 death | **Missing** | No classification engine. | Build AU rule engine. |
| s.36 serious injury/illness | **Missing** | No classification engine. | Build AU rule engine. |
| s.37 dangerous incident | **Missing** | No classification engine. | Build AU rule engine. |
| s.38(2) immediate telephone notification | **Missing** | No phone-log capture for AU (parallel to RIDDOR's `phone_notified_at`). | Add columns + workflow. |
| s.38(4) 48-hour written notification | **Missing** | No deadline capture. | Add deadline clock. |
| s.39 site preservation | **Missing** | No `site_preservation_status` column on `incidents`. | Add column; surface prominently in wizard per PRD §4.5. |
| 5-year retention | **Missing** | Same retention gap. | — |
| `safework_nsw` framework opt-in | **Partial** | `VALID_FRAMEWORKS` whitelist in `server/routes/auth.js` line 17 accepts `'safework_nsw'`. | Whitelist only — no downstream behavior tied to it. |

---

## Section 2 — PRD §3 Functional Requirements Coverage

| PRD Ref | Requirement | Status | Existing Code | Gap |
|---|---|---|---|---|
| 3.1 | Multi-person incidents (multiple AffectedPersons per Incident, each with own Injuries) | **Missing** | Single `injured_person` stored as JSON in `incidents.type_data` (`server/routes/incidents.js` line 290 references `td.injured_person`). One `body_parts_affected` array per incident (`migration 002` line 71). | No `affected_persons` table; no `injuries` table per AffectedPerson. PRD §5.1 requires both. |
| 3.1 | Photo/video attachments with server-side size limits | **Done** | `server/middleware/upload.js` (multer); `attachments` table polymorphic (`schema.sql` line 110). | — |
| 3.1 | GPS location capture (mobile) with manual override | **Missing** | No `gps_lat` / `gps_lon` columns on `incidents`; no FE capture. | Add columns + wizard step. |
| 3.1 | Witness multi-capture | **Done** | `witnesses` table (`schema.sql` line 101) is N-per-incident. | — |
| 3.1 | Draft state before submission | **Missing** | `incidents.status` enum does not include `'Draft'` (`schema.sql` line 63 — `'New','Triage','Investigating','Awaiting CAPA','Closed'`). | Add `'Draft'` status + wizard save-as-draft. |
| 3.1 | Anonymous submission for near-miss/hazard | **Done** | `incidents.is_anonymous` (migration 002 line 68); `reported_by` is nullable (migration 002 line 43); wizard supports it. | OK. |
| 3.1 | Offline mobile capture with sync | **Missing** | No PWA, no service worker, no client-side sync queue. | New work. |
| 3.2.1 | OSHA recordability rule engine | **Done** | `server/services/recordability.js`. | — |
| 3.2.2 | RIDDOR reportability rule engine | **Partial** | `server/services/riddor.js`. | Regs 5 + 11 missing; Reg 7 / Reg 8 lists need authoritative source. |
| 3.2.3 | AU notifiability rule engine | **Missing** | No file. | Build from scratch — needs authoritative source. |
| 3.2.4 | Classification audit trail with rule version, inputs, output, user, timestamp, manual-override w/ reason & approver | **Partial** | `auto_classify.js` logs reasoning text; `activity_log` captures user + timestamp. No rule-engine version. No structured input/output JSON. No approver capture on overrides. `osha_recordable_verified_by` + `osha_recordable_verified_at` exist (migration 002 lines 74–75) but no `override_reason` column, no two-step approve. | Add structured Classification entity (PRD §5.3) — see §4 below. |
| 3.3 | Investigation — 5 Whys | **Done** | `five_whys` table (`schema.sql` line 156); `InvestigationDetail.jsx` line 247 invokes `addFiveWhy`. | — |
| 3.3 | Investigation — Fishbone (Ishikawa) | **Missing** | No table, no UI. `investigations.root_cause_categories` is a free-text JSON array (`schema.sql` line 137) — could host fishbone categories but no enforcement / UI. | Build fishbone tool + storage. |
| 3.3 | Investigation — ICAM | **Missing** | No table, no UI. | Build ICAM tool + storage. |
| 3.3 | Causal-factor categorization (immediate / underlying / root) | **Partial** | `five_whys.is_root_cause` boolean (`schema.sql` line 162); `investigations.root_cause_summary` text. | No three-level categorization entity. |
| 3.3 | Investigation status workflow (not started / in progress / peer review / complete) | **Partial** | `investigations.status` = `'pending','progress','capa','closed'` (`schema.sql` line 131). | No "peer review" gate. |
| 3.3 | Investigation report PDF | **Missing** | No PDF export endpoint or button. | New work. |
| 3.4 | CAPA — multiple per incident | **Done** | Polymorphic source via `capas.source_type` (`migration 003` line 17) — `investigation`, `incident`, or `proactive`. | — |
| 3.4 | CAPA — type classification (corrective, preventive, **immediate, interim, long-term**) | **Conflicts-with-PRD** | `capas.type` CHECK constrains to `('corrective','preventive')` only (`migration 003` line 23). | Widen enum; add three new types. |
| 3.4 | CAPA — owner assignment with email notifications | **Partial** | `owner_id` set; in-app notification fired. | No email/SMS layer — see 3.5. |
| 3.4 | CAPA — due-date tracking with overdue escalation | **Partial** | `capas.due_date` stored. | No auto-escalation when overdue (no cron). |
| 3.4 | CAPA — **hierarchy of controls** category (elimination/substitution/engineering/administrative/PPE) | **Missing** | `capas.category` is free-text (`migration 003` line 25). | Add `controls_level` column with enum; surface in `NewCapaModal.jsx`. |
| 3.4 | CAPA — verification by separate user | **Done** | `capa_owner_verifier_distinct_insert` + `_update` triggers (`schema.sql` lines 198–210; re-attached in migration 003 lines 84–96). | — |
| 3.4 | CAPA — effectiveness review with scheduled follow-up | **Missing** | No `effectiveness_review_date`, no `effectiveness_review_result`. | Add columns + scheduling. |
| 3.4 | CAPA status (open / in_progress / complete / verified / closed / cancelled) | **Conflicts-with-PRD** | `capas.status` = `('pending','progress','verify','closed')` (`migration 003` line 29). | Missing `cancelled` + explicit `verified`. Decide on rename or PRD-alignment. |
| 3.4 | CAPA — bidirectional navigation to incident | **Done** | `source_type='incident'` polymorphic linkage. | — |
| 3.5 | Configurable notification rules | **Partial** | `server/services/notifications.js` fires hardcoded rules. | No config table; no per-org overrides. |
| 3.5 | Multi-channel delivery (email, SMS, in-app) | **Missing** | In-app only — no nodemailer/twilio. | Add provider integration. |
| 3.5 | Role-based routing | **Partial** | Hardcoded recipient logic. | Configurable role matrix not present. |
| 3.5 | Escalation chains (next role on unack) | **Missing** | No `acknowledged_at` on `notifications`; no escalation cron; `server/index.js` has no scheduler. | New work. |
| 3.5 | Regulatory deadline tracking with countdown timers (OSHA 8h/24h, RIDDOR 10d/15d, AU 48h) | **Partial** | `riddor_reports.written_deadline` stored. No FE countdown UI. No OSHA 1904.39 deadlines. No AU deadlines. | New work. |
| 3.5 | Notification audit log incl. delivery status | **Partial** | `notifications` row exists per send; no `delivered_at`, `failed_reason`. | Extend. |
| 3.6 | Immutable change log w/ what/who/when/prior value | **Partial** | `activity_log` exists (`schema.sql` line 212). `activity_log.js` `diffFields()` helper produces per-field diffs **but routes only sometimes call it** — e.g. `incidents.js` POST line 288–297 logs creation without a structured diff. | Backfill diff capture across routes. |
| 3.6 | Append-only event log architecture | **Partial** | No DB-level UPDATE/DELETE guard on `activity_log` (could be enforced with trigger). | Add trigger. |
| 3.6 | Configurable retention defaults (5y / 3y / 5y) | **Missing** | No retention metadata, no purge guard. | Add config + sweep. |
| 3.6 | Amendment workflow post-regulator-submission | **Missing** | No `amendments` table, no `amendment_reason`. | New work. |
| 3.6 | Audit-trail export human-readable + machine-readable | **Partial** | `GET /reports/audit-log/export.csv` exists (`reports.js` line 571). No JSON export. | Add JSON variant. |
| 3.6 | Tamper-evident hash chain across audit entries | **Missing** | `activity_log` has no `prev_hash` / `entry_hash`. | New work — see §4. |
| 3.7 | RBAC roles (worker / supervisor / **investigator** / EHS manager / **compliance officer** / **executive** / **auditor** / administrator) | **Conflicts-with-PRD** | Schema CHECK = `('worker','supervisor','ehs_officer','ehs_manager','admin')` (`schema.sql` line 33). Missing `investigator`, `compliance_officer`, `executive`, `auditor`. | Widen enum; map existing routes' `ELEVATED_ROLES` set. |
| 3.7 | Multi-site hierarchy (org → division → site → area) | **Partial** | `sites.parent_id` self-reference (migration 015 line 21). No explicit `division`; `area` was *dropped* in migration 007 (`007_drop_area_add_display_id.sql`). | Confirm `parent_id` tree is the canonical hierarchy. PRD's named tiers are missing but expressible via depth. |
| 3.7 | Site-based data visibility | **Partial** | All routes filter `org_id` (verified — see §6). User→Site assignment is single `users.site_id` only (`schema.sql` line 28). | Need many-to-many user↔site for cross-site supervisors. |
| 3.7 | OSHA establishment mapping (site → one OSHA establishment) | **Done** | `sites.establishment_id`, `sites.naics_code` (`schema.sql` lines 16–18); `sites.annual_avg_employees`, `total_hours_worked`. | — |
| 3.7 | SAML 2.0 / OIDC | **Missing** | JWT-only (`server/routes/auth.js`); no passport/samlify/openid-client. | New work. |
| 3.7 | User invitation/provisioning | **Partial** | Memory note `project_org_model.md` records "no real invites" decision. | Per product. |
| 3.7 | Deactivation preserves history | **Done** | `users.is_active` (`schema.sql` line 37); FKs not cascaded. | — |
| 3.8 | TRIR / LTIFR / near-miss ratio / CAPA closure rate | **Partial** | `server/services/metrics.js` + `GET /reports/metrics` (`reports.js` line 361). `work_hours` table provides denominator (migration 001 line 67) + contractor split (migration 021). | Need to verify formulas vs PRD glossary. LTIFR specifically may not be present — confirm. Near-miss ratio + CAPA closure not confirmed. |
| 3.8 | Export to PDF/Excel/CSV | **Partial** | CSV export for audit log; no PDF export anywhere; no Excel. | Add PDF generator (puppeteer or pdfkit) + Excel writer. |

---

## Section 3 — PRD §4 Reports Coverage

### 4.1 OSHA Form 300 (29 CFR 1904.29)

- **Endpoint:** `GET /reports/osha-300` (`server/routes/reports.js` line 43); `POST /reports/osha-300` for manual entries (line 220).
- **Storage:** `osha_300_log` table (`schema.sql` line 245) with case_number, employee_name, job_title, injury_date, location, description, classification flags (death/days-away/job-transfer/other), days counts, `injury_type`, `is_privacy_case` (added migration 016).
- **Fields present:** case number, employee name, job title, date, location, description, classification, days away, days restricted, type. All PRD-§4.1 fields covered at storage level.
- **Format audit:** PDF output **not implemented**. CSV export not implemented for OSHA 300 (only for audit log).
- **System behavior:**
  - "One Form 300 per establishment per calendar year" — `UNIQUE(site_id, calendar_year, case_number)` (`schema.sql` line 266). **Done.**
  - "Privacy concern cases must omit name and substitute 'privacy case'" — `is_privacy_case` column **stored**; PDF substitution **not implemented** (no PDF).
  - "Updateable for five years" — no retention guard. **Partial.**

### 4.2 OSHA Form 300A (Annual Summary)

- **Endpoint:** `GET /reports/osha-300a` (line 76); `POST /reports/osha-300a/certify` (line 153).
- **Storage:** `regulatory_certifications` table (migration 001 line 143) captures signer, title, affirmation text, signed_at, IP, user agent. **Done for the cert audit.**
- **Aggregation:** Computed from `osha_300_log` plus `sites.annual_avg_employees` + `total_hours_worked`. UI: `CertifyOsha300AModal.jsx`.
- **Format audit:** PDF for posting **missing**. CSV in OSHA-ITA upload format **missing**.
- **System behavior:**
  - "Auto-calculated from Form 300 entries" — **Done.**
  - "Locked once certified, with amendment workflow" — certification is recorded; **no amendment workflow.**
  - "CSV export must match OSHA ITA upload spec" — **missing.**

### 4.3 OSHA Form 301 (Per Recordable Incident)

- **Endpoint:** `GET /reports/osha-301/:incidentId` (line 271).
- **Field coverage:**
  - Stored: employee name (in `type_data.injured_person.name`), case_number (`osha_case_number`), date, location, description, body part affected, object/substance, physician + facility (in `type_data` per migration 016 comment), ER treated, hospitalized, hospitalization date.
  - **Missing:** employee DOB, date hired, gender (PRD §4.3 explicitly requires these). Also missing: physician licensure, time employee began work + time of event, "what the employee was doing just before the incident" as a structured field (may be in narrative only).
- **Format:** PDF **missing**. JSON only.

### 4.4 RIDDOR F2508

- **Endpoint:** `GET /reports/riddor` (line 330) — list view only.
- **Storage:** `riddor_reports` table (`schema.sql` line 269) with `f2508_data` JSON blob.
- **Format audit:** PDF **missing**. HSE online-form layout **missing**.
- **Field coverage:** PRD §4.4 lists ~20 fields (notifier details, organization, incident, injured person, injury nature, accident kind, narrative). Current storage captures incident, event_date, category, description, deadlines, status — much smaller than the F2508 field set. Notifier and organization fields are not captured separately.
- **System behavior:**
  - "Must include the classification reasoning" — reasoning is unstructured text in `activity_log`; not attached to the F2508 record.
  - "Generated automatically when classified RIDDOR-reportable" — record is created on classification, but only as a stub; no PDF.

### 4.5 SafeWork NSW Notification Form

- **Endpoint:** **Missing entirely.** No code in `server/routes/reports.js` or anywhere else.
- **Storage:** **No table.** No PCBU/ABN/ANZSIC fields anywhere.
- **System behavior:**
  - "ABN validation with checksum" — **missing.**
  - "ANZSIC code lookup table" — **missing.**
  - "Section 39 site preservation surfaced prominently" — `site_preservation_status` column does not exist on `incidents` (also called out in PRD §5.2 required attribute list).
  - "Conditional sections (affected-person details only for death/serious; dangerous-incident details only for that type)" — N/A without form.
- **This is the single largest report gap.** Treat the SafeWork NSW notification + supporting schema as new work. **High hallucination risk** per memory `feedback_regulatory_truth.md` — field list, ANZSIC codes, and ABN algorithm must come from user-supplied authoritative sources.

### 4.6 Generic Incident Report (Universal Fallback)

- **Endpoint:** **Missing.**
- **Storage:** N/A — would render from `incidents`, `investigations`, `capas`, attachments at runtime.
- **System behavior:**
  - "Customer-brandable (logo/color/org name/footer)" — `organizations` table has no logo column; no brand fields.
  - "Configurable section visibility" — **missing.**
  - **All capabilities under 4.6 are missing.** New work.

---

## Section 4 — PRD §5 Data Model Coverage

| PRD §5.1 Entity | Current Table | Mapping / Notes |
|---|---|---|
| Organization | `organizations` | **Done.** Includes country, industry_sector, NAICS, compliance_frameworks (migrations 018, 019). |
| Site / Establishment | `sites` | **Done.** Hierarchical via `parent_id` (migration 015). OSHA establishment fields present. |
| User | `users` | **Done** but role enum incomplete (see §3.7 above). Site relationship is single FK; PRD implies multi-site scoping → add many-to-many. |
| Worker | **Missing** | No `workers` table. Affected-person data is single JSON field on `incidents.type_data`. Workers may or may not be Users per PRD; needs a dedicated table. |
| Incident | `incidents` | **Partial.** Most §5.2 attributes present. **Missing:** `gps_lat`/`gps_lon`, `site_preservation_status`, `awareness_datetime` (when org became aware — separate from `incident_datetime`), explicit `Draft` status. |
| AffectedPerson | **Missing** | PRD §5.1 requires "multiple per incident, references Worker". Currently single JSON sub-record. |
| Injury | **Missing** | PRD §5.1 requires "multiple per AffectedPerson". Currently fold into `body_parts_affected` flat array + `type_data` JSON. |
| Classification | **Missing as entity** | Current model: boolean+text columns on `incidents` (`osha_recordable`, `osha_recordability_type`, `riddor_reportable`, `riddor_category`, `riddor_ref`). PRD §5.3 wants per-jurisdiction rows with: jurisdiction, outcome, category, reasoning trace, rule_engine_version, determined_at, manual_override flag/reason/user/approver, deadlines. **Build new `classifications` table.** |
| Investigation | `investigations` + `investigation_team` + `five_whys` | **Partial.** Missing peer-review state; no fishbone/ICAM tables. |
| CausalFactor | **Missing** | `five_whys.is_root_cause` is a single-flag approximation. PRD wants explicit `causal_factors` table linking findings to categories (immediate/underlying/root). |
| CAPA | `capas` | **Partial.** Schema mismatches on `type` and `status` enums (§3.4 conflicts). Missing hierarchy_of_controls. |
| Witness | `witnesses` | **Done.** |
| Attachment | `attachments` | **Done.** Polymorphic (`entity_type`, `entity_id`). |
| Notification | `notifications` | **Partial.** Missing delivery_status/acknowledged_at/escalation_level. |
| RegulatoryReport | `osha_300_log`, `riddor_reports`, `regulatory_certifications`, `regulatory_submissions` | **Partial.** Per-form tables exist. PRD §5.1 expects a single conceptual entity per generated report instance; current design splits across multiple tables (acceptable, but no SafeWork NSW report table and no Generic table). |
| AuditEvent | `activity_log` | **Partial.** Missing `prev_hash`/`entry_hash` (hash chain), `ip_address`/`user_agent` on every entry (currently only on `regulatory_certifications`), structured `field_diffs` column (currently in free-text metadata JSON when caller bothers to populate). |

**Critical missing columns called out in the PRD:**

- `incidents.site_preservation_status` — required by PRD §4.5 + §5.2. **Not present.**
- `incidents.gps_lat` + `incidents.gps_lon` — required by §3.1 + §5.2. **Not present.**
- `incidents.awareness_datetime` — required by §5.2 ("date/time organization became aware"). **Not present.**
- `incidents.equipment_involved` — required by §5.2. Currently in `type_data` JSON only.
- Classification reasoning trace — structured store. **Not present.**
- Hash chain on `activity_log`. **Not present.**

---

## Section 5 — PRD §6 Non-Functional Gaps

| §6 NFR | Severity | Status | Notes |
|---|---|---|---|
| TLS 1.2+ in transit | Low | Out-of-scope | Deployment concern. |
| AES-256 at rest | High | **Missing** | SQLite file unencrypted on disk; no SQLCipher; uploaded attachments stored unencrypted under multer's dir. Production cutover needs either SQLCipher or full-disk encryption + a documented control. |
| RBAC at API layer | Low | **Done** | All routes check `req.user.role` via middleware; UI is not the gate. |
| Tenant isolation (org_id) | Low | **Done** | Spot-checked 5+ routes — every query scopes by `org_id` (incidents.js:111, investigations.js:69, reports.js:48, sites GET, notifications.js:10). No cross-tenant leak found in reviewed routes. |
| MFA for admin/compliance officer | High | **Missing** | No TOTP, no SMS-OTP, no WebAuthn. |
| SAML / OIDC SSO | High | **Missing** | Not implemented. |
| Session timeout configurable | Med | **Missing** | JWT expiry hardcoded. |
| Password policy configurable | Med | **Missing** | Bcrypt only; no complexity rules per org. |
| Secrets management | Med | **Partial** | JWT secret in env var per memory; needs documented rotation. |
| GDPR right-to-erasure | High | **Missing** | No erasure endpoint; no PII-mask routine. |
| AU Privacy Act compliance | High | **Missing** | Same. |
| Data residency options | Med | Out-of-scope | Deployment concern. |
| PII protection for AffectedPerson | High | **Partial** | Privacy-concern flag exists for OSHA 300; broader PII tagging absent. |
| 99.9% uptime / p95 perf | — | Out-of-scope | Deployment concern. |
| Disaster recovery RPO/RTO | — | Out-of-scope | Deployment concern. |
| Audit retention = longest applicable (5y) | High | **Missing** | No retention enforcement. |
| Audit-trail export on demand | Med | **Partial** | CSV-only via `GET /reports/audit-log/export.csv`. JSON export missing per PRD §3.6 + §7.4. |
| Customer-initiated audit without eng support | Med | **Partial** | Audit log filterable; needs UI polish. |
| Config-change auditing (rule version, retention, override) | Med | **Missing** | Settings changes don't currently flow to `activity_log`. |
| WCAG 2.1 AA | High | **Missing** | Spot-check: forms in `InjuryForm.jsx` use `<label className="label">` without `htmlFor` (lines 96–98); icon-only buttons in `ReportsPage.jsx:243` lack `aria-label`. No WCAG audit on record. |
| Keyboard navigation | Med | Unknown | Not audited. |
| 320px mobile width | Low | **Missing** | App is desktop-first (1440px per legacy proto); React app responsive status not verified. |
| i18n (en-US, en-GB, en-AU) | Med | **Missing** | All strings hardcoded; no i18n framework. |
| Date formats locale-aware | Low | **Missing** | `client/src/utils/time.js` exists but not locale-aware. |
| Data export CSV + JSON (§7.4) | Med | **Partial** | Audit-log CSV only. No bulk export of incidents/investigations/CAPAs in CSV or JSON. |
| Webhooks (§7.3) | Low | **Missing** | No outbound webhook layer. |

---

## Section 6 — Convention Compliance Check (per CLAUDE.md)

| Convention | Status | Notes |
|---|---|---|
| Modals via `createPortal(jsx, document.body)` | **Done** | `IncidentDetail.jsx` lines 878, 920–922; `CAPADetail.jsx` 333, 342; `ReportsPage.jsx` 245, 681, 891, 907 all use portals. |
| Page CSS files scoped with prefix | **Mostly done** | `incidents.css` uses `idet-`; `reports.css` uses `rpt-`; `capas.css` uses `capd-`. |
| No `position: fixed` inside `.page` | **Verify needed** | Several page CSS files contain `position: fixed` (incidents.css, capas.css, reports.css). These appear to be modal-portal targets or sticky sidebars rendered outside `.page` via portal — confirm each instance is not actually descended from `.page` at render time. Flagged for a follow-up sweep, not blocking. |
| No hardcoded colors / always use tokens | **Mostly done** | One concrete violation: `IncidentDetail.jsx:443` uses inline `style={{ background: '#fef2f2', color: '#dc2626' }}` for a RIDDOR pill instead of `pill-err`. `IncidentDetail.jsx:642, 649` use a `fileTypeInfo` color map — likely a defined per-file palette, low priority. |
| All API routes scoped by `org_id` | **Done** | Verified across incidents, investigations, capas, reports, sites, notifications. |
| Use shared `Icon` component | **Done** | `client/src/components/shared/Icon.jsx`. |
| One CSS file per page | **Done** | Folder layout matches. |
| JSX one-line file header | **Mostly done** | Not enforced; spot-check shows most files comply. |

---

## Top-line summary of gaps (for the executive paragraph)

1. **SafeWork NSW is unbuilt end-to-end** — no rule engine, no notification report, no PCBU/ABN/ANZSIC schema, no s.39 site-preservation column. Largest single gap.
2. **Multi-person incidents** — single-injury JSON today; PRD requires N AffectedPersons × N Injuries. Affects every report and the wizard. Structural.
3. **Classification audit (PRD §3.2.4 + §5.3)** — current model is loose booleans on `incidents`; PRD requires a dedicated entity with reasoning trace, rule-engine version, override approver, and per-jurisdiction rows. Touches OSHA + RIDDOR + AU.
4. **Audit trail tamper evidence (PRD §3.6)** — no hash chain on `activity_log`; field-level diff capture is inconsistent; no IP/UA on every entry; no amendment workflow.
5. **Report PDFs do not exist** — OSHA 300 / 300A / 301 / RIDDOR F2508 / NSW / Generic all return JSON. PRD §4 prescribes specific paper-form layouts.
6. **RIDDOR Regulations 5 + 11 missing**, and Regs 7 + 8 lists need a user-supplied authoritative source per memory `feedback_regulatory_truth.md`.
7. **No notification escalation / no email/SMS delivery** — in-app only; no cron in `server/index.js`.
8. **CAPA conflicts** — schema `type` and `status` enums narrower than PRD. Hierarchy-of-controls and effectiveness-review fields missing.
9. **No SAML / OIDC / MFA** — JWT only. Required by PRD §3.7 + §6.1.
10. **NFR gaps** — no encryption-at-rest story, no GDPR erasure, no WCAG audit, no i18n, no offline capture.
