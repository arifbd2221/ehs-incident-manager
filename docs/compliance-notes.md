# Compliance Notes — Operational Posture

Companion to `docs/plan-2026-05-11.md` and `docs/implementation-plan.md`. This document records compliance positions the application does **not** enforce in code but that must hold true operationally, plus load-bearing conventions a future developer must respect.

If you change the underlying behavior referenced here, update this document in the same PR.

---

## 1. Regulatory record retention is satisfied by absence of deletion

**Position:** The application has no incident, investigation, CAPA, `osha_300_log`, `riddor_reports`, `regulatory_certifications`, `regulatory_submissions`, or `activity_log` deletion endpoints. Retention obligations are therefore satisfied by construction.

**Statutes covered:**
- **OSHA 29 CFR 1904.33** — 5 years following the end of the calendar year that the records cover.
- **RIDDOR 2013, Reg 12** — 3 years from the date of the report.
- **WHS Regulation 2017 (NSW), Reg 12** — 5 years after the incident is notified.

**Engineering rules that keep this true:**
1. Do not add a `DELETE` route for any of the entities listed above without first implementing a retention-period block.
2. If a "soft delete" pattern is introduced for any of these entities, the soft-delete flag must not hide the record from regulatory reports or `activity_log` exports.
3. The `osha_300_log` row UNIQUE constraint `(site_id, calendar_year, case_number)` (`schema.sql` line 266) implicitly anchors retention to the calendar year; do not weaken it.
4. If a future feature requires data removal (e.g. GDPR Art 17 erasure — see §3 below), it must hard-block while the record is within its longest-applicable retention window.

---

## 2. `incidents.type_data` JSON has load-bearing keys

**Position:** `incidents.type_data` is a free-form JSON column **for the wizard's per-type form fields**, but several specific keys inside it are read by regulatory reports. Removing or renaming these keys silently breaks compliance outputs. Treat them as schema even though SQLite does not.

**Load-bearing keys (do not remove or rename):**

| JSON path | Used by | PRD / regulation |
|---|---|---|
| `injured_person.name` | OSHA 300 log render; OSHA 301 form; RIDDOR F2508 | 29 CFR 1904.29; RIDDOR Reg 4 |
| `injured_person.job_title` | OSHA 300 log column "Job title"; OSHA 301 employee info | 29 CFR 1904.29 |
| `injured_person.dob` | OSHA 301 "date of birth" field | 29 CFR 1904.29 |
| `injured_person.date_hired` | OSHA 301 "date hired" field | 29 CFR 1904.29 |
| `injured_person.gender` | OSHA 301 "gender" field | 29 CFR 1904.29 |
| `injured_person.address` | OSHA 301 employee info; RIDDOR F2508 injured-person section | 29 CFR 1904.29; RIDDOR Reg 4 |
| `injured_person.phone` | RIDDOR F2508 | RIDDOR Reg 4 |
| `injured_person.age` | RIDDOR F2508 | RIDDOR Reg 4 |
| `injured_person.employment_status` | RIDDOR F2508 (employee/self-employed/public); SafeWork NSW notification | RIDDOR Reg 4; WHS Act s.36 |
| `physician.name` | OSHA 301 "physician or other health care professional" | 29 CFR 1904.29 |
| `physician.phone` | OSHA 301 | 29 CFR 1904.29 |
| `physician.facility` | OSHA 301 "treatment facility" | 29 CFR 1904.29 |
| `physician.facility_address` | OSHA 301 | 29 CFR 1904.29 |
| `activity_before_incident` | OSHA 301 "what the employee was doing just before the incident" | 29 CFR 1904.29 |
| `time_began_work` | OSHA 301 "time employee began work" | 29 CFR 1904.29 |
| `time_of_event` | OSHA 301 "time of event" | 29 CFR 1904.29 |
| `mechanism` | OSHA 300 "object/substance that directly injured" | 29 CFR 1904.29 |
| `object_substance` | OSHA 300 / OSHA 301 | 29 CFR 1904.29 |

**Rules:**
1. The wizard must always write these keys when capturing an injury where the relevant report could apply.
2. Adding new keys to `injured_person` is allowed; removing or renaming is not.
3. When WI-A (multi-person incidents) lands, the new `affected_persons.is_primary = 1` row mirrors `injured_person`, and writers must dual-write both representations. The JSON keys remain load-bearing because legacy readers may still consult them.

---

## 3. GDPR Art 17 right-to-erasure — descoped with rationale

**Position:** No erasure endpoint or workflow is built. UK/EU users who request erasure of incident data are governed by **GDPR Art 17(3)(b)**, which carves out processing required by legal obligation. OSHA, RIDDOR, and WHS retention obligations constitute such legal obligation for the duration of their respective retention windows.

**When erasure is eventually built** (out of scope for current chunks):
- Add an `erasure_requests` table (admin-only workflow).
- Hard-block erasure while any referenced record is inside its retention window (per §1 above).
- Erasure means **in-place PII nullification**, not row deletion: `UPDATE affected_persons SET name=NULL, dob=NULL, address=NULL, phone=NULL, email=NULL WHERE …` and equivalents. The incident facts (date, location, classification, narrative) remain.
- Every erasure produces its own `activity_log` entry (the act of erasure is itself auditable).
- Erasure must traverse `affected_persons`, `injuries`, `witnesses` (statement may contain PII), `attachments` (file content review), and `activity_log` metadata.

**Engineering rule:** until that workflow exists, the platform's position to UK/EU customers is "your data is retained for the regulatory retention window; we cannot erase it within that window."

---

## 4. Encryption at rest is a deployment requirement

**Position:** The application code does not encrypt the SQLite database file or uploaded attachments. **The deployment must place the data directory (the SQLite file plus `server/uploads/`) on an encrypted filesystem.**

**Acceptable implementations:**
- **AWS EBS / GCP PD / Azure managed disk** with provider-managed encryption at rest.
- **LUKS / dm-crypt** on a self-hosted Linux deployment.
- **SQLCipher** as an alternative if the underlying filesystem cannot be guaranteed encrypted. Requires swapping `better-sqlite3` for `@journeyapps/sqlcipher` or equivalent and is a non-trivial change.

**Statutes informing the requirement:**
- **GDPR Art 32** — "appropriate technical and organisational measures."
- **AU Privacy Act 1988, APP 11** — reasonable steps to protect personal information.
- Customer contracts may impose stricter requirements (FedRAMP, ISO 27001, SOC 2); those are out of scope for this document.

**Operations contract:** the runbook for any production deployment must document which encryption mechanism is in use and how the keys are managed.

---

## 5. TLS in transit is a deployment requirement

**Position:** The Express server does not terminate TLS. Deployments must front the application with a reverse proxy or load balancer providing **TLS 1.2 minimum, TLS 1.3 preferred** (matching PRD §6.1).

**Engineering rule:** do not add HTTP-only fallback paths to the application that would survive a proxy misconfiguration.

---

## 6. Tenant isolation is enforced in every route

**Position:** Every API route filters by `org_id` derived from the JWT (`req.user.org_id`). This was spot-checked in `docs/gap-analysis.md` §6 and held across `incidents`, `investigations`, `capas`, `reports`, `sites`, `notifications`, and `attachments` (via parent-entity scope).

**Engineering rule:** new routes must filter by `org_id` in the WHERE clause of every query that touches a tenant-scoped table. Tests added with new routes must include a cross-tenant 404 case.

---

## 7. Audit trail completeness — `activity_log` conventions

**Position:** The `activity_log` table captures who did what, when, on which entity, with optional metadata JSON. Per WI-C (planned), it will gain `prev_hash` + `entry_hash` + `ip_address` + `user_agent` + `field_diffs` columns and append-only triggers. Until WI-C ships:

- `writeActivity()` is the single writer. Do not insert directly.
- Every mutating route (POST, PATCH, DELETE) must call `writeActivity()` with a meaningful `action` value and human-readable `description`.
- `metadata` is the conventional place for ancillary detail (e.g. `{ site_id, hours_worked }` on a work-hours import). When WI-C lands, `ip_address` and `user_agent` move to first-class columns; `metadata` remains for everything else.
- The action vocabulary lives in `server/services/audit_actions_catalog.js`. New action verbs go there.

**Tamper evidence** is not currently provided by code. It will be after WI-C. Until then, database-level access control + backup integrity carry that obligation.

---

## 8. CAPA owner ≠ verifier is enforced at the database

**Position:** The `capa_owner_verifier_distinct_insert` and `_update` triggers (re-attached in migration 003 lines 84–96) enforce separation of duties on CAPA verification. Do not disable, drop, or weaken these triggers.

**PRD basis:** §3.4 "Verification step — separate user confirms completion."

**Engineering rule:** if a future migration rebuilds the `capas` table, the triggers must be re-attached identically. The migration-003 pattern is the reference.

---

## 9. SafeWork NSW `site_preservation_status` lives on the NSW table only

**Position** (per `plan-2026-05-11.md` Part 1 #1): `site_preservation_status` is captured on `safework_nsw_notifications` (planned in WI-06), not denormalized onto `incidents`. UI surfaces that need to display it for AU incidents must JOIN at query time.

**Statute:** WHS Act 2011 (NSW), s.39 (site preservation duty).

**Engineering rule:** do not add a `site_preservation_status` column to `incidents`. If a future product decision changes this, treat it as a structural-change request and surface it for owner approval.

---

## 10. Hallucination-risk gates

**Position** (per memory `feedback_regulatory_truth.md` and reiterated in `docs/implementation-plan.md`): regulatory specifics — deadline values, category enumerations, schedule lists, portal URLs, prescribed CSV layouts — **must not be invented from model memory**. They must come from a user-supplied authoritative source.

**Affected planned work items:**
- WI-02 (OSHA ITA CSV) — requires the OSHA ITA upload template before coding.
- WI-04, WI-05 (RIDDOR) — Reg 7 Schedule 2 (dangerous occurrences) + Reg 8 Schedule 1 (diseases) + HSE F2508 visual reference required before extending the engine or the PDF.
- WI-06 (SafeWork NSW) — WHS Act s.36/s.37 enumerations + the official Notify SafeWork NSW form + ANZSIC code list required before coding.

**Engineering rule:** when source material is not available, scaffold the code with `// TODO: confirm against <authoritative source>` comments and refuse to ship the affected branch.

---

## 11. Multi-tenant data export (descoped, but flagged)

**Position:** GDPR Art 20 (portability) and AU Privacy Act APP 12 (access) imply customers should be able to export their data. Currently only `GET /reports/audit-log/export.csv` exists. A full bulk-export endpoint is not yet planned.

**Engineering rule:** if a customer requests their data under Art 20 / APP 12, fulfill manually via SQL export. When the bulk-export work item is scheduled, this document must be updated to remove this position.

---

## Maintenance

When this document changes, update the section table-of-contents below and link the relevant PR.

Sections in this document:
1. Retention satisfied by absence of deletion
2. `incidents.type_data` load-bearing keys
3. GDPR Art 17 erasure — descoped with rationale
4. Encryption at rest — deployment requirement
5. TLS in transit — deployment requirement
6. Tenant isolation enforced in every route
7. `activity_log` conventions
8. CAPA owner ≠ verifier enforced at DB
9. SafeWork NSW `site_preservation_status` placement
10. Hallucination-risk gates
11. Multi-tenant data export (descoped)
