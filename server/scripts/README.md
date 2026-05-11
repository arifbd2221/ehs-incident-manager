# server/scripts

Helper scripts for development. Not run by the production server.

## `wia-regression.sh` — WI-A regression suite

Curl-driven regression test covering everything WI-A touched + adjacent surfaces. Written 2026-05-11. Runs 78 assertions across:

- **Section B** — `POST /incidents` (legacy single-person, array shape, nearmiss, UK dangerous occurrence)
- **Section A** — `PATCH /incidents/:id` matrix (title-only, severity override, nested + flat + mixed type_data, privacy flag, mirror columns, nearmiss-safe)
- **Section C** — affected-persons + injuries CRUD (create/patch/delete, primary rotation, worker role 403, cross-org 404, modal-edit-shape multi-field PATCH)
- **Section D** — WI-C hash chain verification + append-only trigger enforcement
- **Section E** — reports endpoints (OSHA 301, 300, 300A, RIDDOR, metrics, audit-log JSON + CSV)
- **Section F** — adjacent paths (dashboard, notifications, incidents list/detail, witnesses)

### How to run

1. Boot the BE: `cd server && node --watch index.js` (defaults to port 3001).
2. Run: `bash server/scripts/wia-regression.sh`
3. Expected: **77 PASS, 1 FAIL** (the F1 fail is a known test-script bug — witnesses POST returns 201 per REST, not 200).

### Assumptions

- Demo accounts seeded with `password123`: `priya@sdsmanager.com`, `wendy@sdsmanager.com`, `elena@sdsmanager.com`, `sydney-test@example.com`.
- Site id 1 exists in priya's org (US).
- At least one UK site exists in elena's org.
- BE listening on `localhost:3001`.

### Cleanup

The script soft-deletes its test affected_persons + injuries when done. Test incidents stay in the DB (no incident-delete endpoint by retention design). Activity-log rows from the tests stay too (WI-C append-only triggers block deletion — by design).

### When to re-run

Before merging anything that touches:
- `server/routes/incidents.js` POST or PATCH handler
- `server/routes/affected_persons.js`
- `server/services/affected_persons.js`
- `server/services/activity_log.js`
- `server/db/activity_log_chain.js`
- `server/routes/reports.js` OSHA 301 / audit-log paths
- Migrations 024 / 025 (or anything that touches `activity_log`, `affected_persons`, `injuries`)
