-- 025_affected_persons_injuries.sql — WI-A multi-person incidents (purely additive).
--
-- Adds two new tables that SUPPLEMENT, not replace, the existing
-- incidents.type_data.injured_person JSON. After WI-A both shapes coexist:
--   - Legacy single-person reads/writes against type_data.injured_person
--     (load-bearing per docs/compliance-notes.md §2) keep working.
--   - New multi-person reads/writes go against affected_persons + injuries.
--   - Dual-write in POST /incidents + PATCH /incidents/:id keeps both in
--     sync (the routes do this; the migration only seeds the tables).
--
-- Backfill: every existing incident with type_data.injured_person populated
-- gets one affected_persons row (is_primary=1) and one injuries row
-- reflecting available JSON + column data. Sparse legacy rows leave most
-- columns NULL — that's expected; OSHA 301 still reads from type_data.
--
-- Scope discipline (memory feedback_no_structural_changes.md): pure ADD —
-- no ALTER on incidents / type_data / any existing enum. Two new tables.

PRAGMA defer_foreign_keys = ON;

-- ============================================================
-- affected_persons — one row per person affected by an incident
-- ============================================================
-- is_primary=1 is the row that mirrors the legacy type_data.injured_person
-- sub-record. Exactly one primary per incident is enforced by a partial
-- UNIQUE index (active, non-deleted rows only).

CREATE TABLE IF NOT EXISTS affected_persons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id),
  org_id INTEGER NOT NULL REFERENCES organizations(id),

  name TEXT,
  dob TEXT,                  -- ISO date 'YYYY-MM-DD'
  gender TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,

  job_title TEXT,
  employment_status TEXT CHECK(employment_status IN (
    'employee','contractor','labour_hire','volunteer',
    'visitor','member_of_public','self_employed'
  )),
  employer_name TEXT,
  date_hired TEXT,           -- ISO date
  experience_years REAL,
  hours_into_shift REAL,

  is_privacy_case INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0,

  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_affected_persons_incident_live
  ON affected_persons(incident_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_affected_persons_org_incident
  ON affected_persons(org_id, incident_id);

-- Exactly one active primary per incident. Updates that flip is_primary
-- must clear the old primary in the same transaction.
CREATE UNIQUE INDEX IF NOT EXISTS uq_affected_persons_one_primary_per_incident
  ON affected_persons(incident_id)
  WHERE is_primary = 1 AND deleted_at IS NULL;

-- ============================================================
-- injuries — one row per discrete injury on an affected person
-- ============================================================
-- N injuries per person. Most legacy rows produce one injury at backfill;
-- multi-injury support is unlocked for new writes only.

CREATE TABLE IF NOT EXISTS injuries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  affected_person_id INTEGER NOT NULL REFERENCES affected_persons(id),
  org_id INTEGER NOT NULL REFERENCES organizations(id),

  body_part TEXT,            -- comma-joined for legacy multi-body-part rows
  injury_type TEXT,
  mechanism TEXT,
  object_substance TEXT,

  treatment TEXT,            -- semicolon-joined for legacy multi-treatment rows
  physician_name TEXT,
  physician_phone TEXT,
  physician_facility TEXT,

  er_treated INTEGER NOT NULL DEFAULT 0,
  hospitalized INTEGER NOT NULL DEFAULT 0,
  hospitalization_date TEXT,

  days_away INTEGER NOT NULL DEFAULT 0,
  days_restricted INTEGER NOT NULL DEFAULT 0,
  date_of_death TEXT,        -- ISO date

  narrative TEXT,

  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_injuries_person_live
  ON injuries(affected_person_id) WHERE deleted_at IS NULL;

-- ============================================================
-- Backfill: one (affected_person, injury) per legacy injured_person
-- ============================================================
-- Pulls fields from both incidents.type_data.injured_person JSON and the
-- typed columns added in earlier migrations (er_treated, hospitalized,
-- osha_days_away, osha_days_restricted, osha_date_of_death,
-- osha_privacy_case, body_parts_affected, description).
--
-- json_extract returns NULL when a key is absent — propagates cleanly.
-- json_each on body_parts_affected is used in a subquery to join the
-- array into a comma-separated string for the body_part scalar column.

INSERT INTO affected_persons (
  incident_id, org_id,
  name, dob, gender, address, phone, email,
  job_title, employment_status, employer_name, date_hired,
  experience_years, hours_into_shift,
  is_privacy_case, is_primary,
  created_at, created_by, updated_at
)
SELECT
  i.id,
  i.org_id,
  json_extract(i.type_data, '$.injured_person.name'),
  json_extract(i.type_data, '$.injured_person.dob'),
  json_extract(i.type_data, '$.injured_person.gender'),
  json_extract(i.type_data, '$.injured_person.address'),
  json_extract(i.type_data, '$.injured_person.phone'),
  json_extract(i.type_data, '$.injured_person.email'),
  COALESCE(
    json_extract(i.type_data, '$.injured_person.job_title'),
    json_extract(i.type_data, '$.injured_person.department')
  ),
  json_extract(i.type_data, '$.injured_person.employment_status'),
  json_extract(i.type_data, '$.injured_person.employer_name'),
  COALESCE(
    json_extract(i.type_data, '$.injured_person.date_hired'),
    json_extract(i.type_data, '$.injured_person.hire_date')
  ),
  json_extract(i.type_data, '$.injured_person.experience_years'),
  json_extract(i.type_data, '$.injured_person.hours_into_shift'),
  COALESCE(i.osha_privacy_case, 0),
  1,
  i.created_at,
  i.reported_by,
  i.updated_at
FROM incidents i
WHERE json_extract(i.type_data, '$.injured_person') IS NOT NULL
  -- Idempotency: skip incidents that already have a primary affected_person.
  AND NOT EXISTS (
    SELECT 1 FROM affected_persons ap
    WHERE ap.incident_id = i.id AND ap.is_primary = 1 AND ap.deleted_at IS NULL
  );

-- One injury row per just-created primary affected_person. Pulls
-- type_data fields plus the typed columns on incidents that were added
-- in migration 002 (body_parts_affected) and 016 (er_treated etc.).
--
-- body_part is joined from the JSON array. SQLite has group_concat but it
-- needs json_each as a subquery; we keep it inline for migration
-- portability. NULL array → NULL body_part.

INSERT INTO injuries (
  affected_person_id, org_id,
  body_part, injury_type, mechanism, object_substance,
  treatment, physician_name, physician_phone, physician_facility,
  er_treated, hospitalized, hospitalization_date,
  days_away, days_restricted, date_of_death,
  narrative,
  created_at, created_by, updated_at
)
SELECT
  ap.id,
  ap.org_id,
  (SELECT group_concat(value, ', ')
     FROM json_each(i.body_parts_affected)
     WHERE i.body_parts_affected IS NOT NULL
       AND i.body_parts_affected != '[]'),
  json_extract(i.type_data, '$.injury_type'),
  json_extract(i.type_data, '$.mechanism'),
  COALESCE(
    json_extract(i.type_data, '$.object_substance'),
    json_extract(i.type_data, '$.substance.name')
  ),
  COALESCE(
    -- treatment may be a JSON array (treatments[]) or a string. Join arrays
    -- with '; '; leave strings as-is via json_extract returning the value.
    (SELECT group_concat(value, '; ')
       FROM json_each(json_extract(i.type_data, '$.treatments'))
       WHERE json_extract(i.type_data, '$.treatments') IS NOT NULL),
    (SELECT group_concat(value, '; ')
       FROM json_each(json_extract(i.type_data, '$.treatment'))
       WHERE json_type(i.type_data, '$.treatment') = 'array'),
    json_extract(i.type_data, '$.treatment')
  ),
  json_extract(i.type_data, '$.physician_name'),
  json_extract(i.type_data, '$.physician_phone'),
  COALESCE(
    json_extract(i.type_data, '$.facility_name'),
    json_extract(i.type_data, '$.physician_facility')
  ),
  COALESCE(i.er_treated, 0),
  COALESCE(i.hospitalized, 0),
  i.hospitalization_date,
  COALESCE(i.osha_days_away, 0),
  COALESCE(i.osha_days_restricted, 0),
  i.osha_date_of_death,
  i.description,
  i.created_at,
  i.reported_by,
  i.updated_at
FROM affected_persons ap
JOIN incidents i ON i.id = ap.incident_id
WHERE ap.is_primary = 1
  AND ap.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM injuries inj
    WHERE inj.affected_person_id = ap.id AND inj.deleted_at IS NULL
  );
