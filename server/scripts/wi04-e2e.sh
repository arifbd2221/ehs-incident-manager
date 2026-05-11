#!/usr/bin/env bash
# server/scripts/wi04-e2e.sh — full end-to-end coverage for the WI-04
# RIDDOR Reg 5 / Reg 11 / Reg 14 classification branches, plus the
# Reg 4/6/7/8 regressions that the reorder touches.
#
# Pattern mirrors wia-regression.sh: curl + sqlite3 assertions, colour
# pass/fail markers, exits non-zero on any failure.
#
# Prereqs (same as wia-regression.sh):
#   • BE listening on localhost:3001 (cd server && node --watch index.js)
#   • Demo accounts seeded with password123 — elena@sdsmanager.com (UK
#     access via Sheffield Site), priya@sdsmanager.com (US site).
#   • Sites table has one UK site under elena's org, one US site under
#     priya's org.

set -u

BASE="http://localhost:3001"
DB="db/incident_management.db"

# Move into the server dir so sqlite3 finds db/.
cd "$(dirname "$0")/.."

PASS=0; FAIL=0
declare -a FAILED

run() {
  local name="$1"; local expected="$2"; local actual="$3"
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS+1)); printf "  \033[32mPASS\033[0m  %-72s\n" "$name"
  else
    FAIL=$((FAIL+1)); FAILED+=("$name :: expected $expected got $actual")
    printf "  \033[31mFAIL\033[0m  %-72s expected=%s got=%s\n" "$name" "$expected" "$actual"
  fi
}

post_incident() {
  curl -s -X POST "$BASE/api/incidents" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $1" -d "$2" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))"
}

cat_for() {
  sqlite3 "$DB" "SELECT IFNULL(riddor_category,'') FROM incidents WHERE id=$1;"
}
reportable_for() {
  sqlite3 "$DB" "SELECT riddor_reportable FROM incidents WHERE id=$1;"
}
riddor_row_for() {
  sqlite3 "$DB" "SELECT COUNT(*) FROM riddor_reports WHERE incident_id=$1;"
}
deadline_days_for() {
  # Compare the date portion only, sidestepping local/UTC offsets that
  # would otherwise turn (event_date + N days) into N-1 via julianday()
  # truncation. The deadline timestamps in riddor_reports are stored as
  # ISO-8601 with a 'Z' suffix while event_date carries no zone — using
  # date() returns the calendar day for both regardless of TZ.
  sqlite3 "$DB" "
    SELECT CAST(julianday(date(written_deadline)) - julianday(date(event_date)) AS INTEGER)
    FROM riddor_reports WHERE incident_id=$1;"
}

echo "== Logins =="
# elena & priya are both in SDS Manager Inc. (org_id=1) — elena is ehs_manager,
# priya is admin. Used for the same-tenant POSTs and admin-gated endpoints.
# acme is in a different org (org_id=2) — used for the cross-tenant 404 check.
ELENA=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"elena@sdsmanager.com","password":"password123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
PRIYA=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"priya@sdsmanager.com","password":"password123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
ACME=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"acme@sdsmanager.com","password":"password123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
run "login elena" "non-empty" "$([ -n "$ELENA" ] && echo non-empty || echo empty)"
run "login priya" "non-empty" "$([ -n "$PRIYA" ] && echo non-empty || echo empty)"
run "login acme (cross-tenant)" "non-empty" "$([ -n "$ACME" ] && echo non-empty || echo empty)"

UK_SITE=$(sqlite3 "$DB" "SELECT id FROM sites WHERE country='UK' AND org_id=(SELECT org_id FROM users WHERE email='elena@sdsmanager.com') LIMIT 1;")
US_SITE=$(sqlite3 "$DB" "SELECT id FROM sites WHERE country='US' AND org_id=(SELECT org_id FROM users WHERE email='priya@sdsmanager.com') LIMIT 1;")
run "UK site discovered" "non-zero" "$([ "${UK_SITE:-0}" -gt 0 ] && echo non-zero || echo zero)"
run "US site discovered" "non-zero" "$([ "${US_SITE:-0}" -gt 0 ] && echo non-zero || echo zero)"

DT_BASE="2026-05-12T13:00:00"

echo ""
echo "== Section A — Reg 5 non-fatal injuries to non-workers =="

# A1: Reg 5(a) — visitor taken to hospital from a non-hospital site
A1=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E A1 Reg 5(a) visitor","type":"injury",
 "description":"Visitor slipped near reception, taken to A&E.",
 "incident_datetime":"$DT_BASE","area":"Reception","likelihood":2,"consequence":3,
 "body_parts_affected":["head"],
 "type_data":{"injury_type":"Laceration","hospitalized":true},
 "affected_persons":[{"name":"A1 Person","employment_status":"member_of_public","is_primary":true,"injuries":[{"body_part":"head","injury_type":"Laceration","hospitalized":1}]}]}
EOF
)")
run "A1: incident created"                       "non-zero" "$([ -n "$A1" ] && [ "$A1" -gt 0 ] && echo non-zero || echo zero)"
run "A1: reportable=1"                           "1" "$(reportable_for "$A1")"
run "A1: category=non_worker_hospitalization"    "non_worker_hospitalization" "$(cat_for "$A1")"
run "A1: riddor_reports row created"             "1" "$(riddor_row_for "$A1")"
run "A1: deadline = 10 days"                     "10" "$(deadline_days_for "$A1")"

# A2: Reg 5 negative — visitor sprained ankle, no hospital
A2=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E A2 visitor no hospital","type":"injury",
 "description":"Visitor twisted ankle, no hospital trip.",
 "incident_datetime":"$DT_BASE","area":"Stairwell","likelihood":2,"consequence":1,
 "body_parts_affected":["l_ankle"],
 "type_data":{"injury_type":"Sprain","hospitalized":false},
 "affected_persons":[{"name":"A2 Person","employment_status":"member_of_public","is_primary":true,"injuries":[{"body_part":"l_ankle","injury_type":"Sprain"}]}]}
EOF
)")
run "A2: reportable=0"                           "0" "$(reportable_for "$A2")"
run "A2: category empty"                         "" "$(cat_for "$A2")"
run "A2: no riddor_reports row"                  "0" "$(riddor_row_for "$A2")"

# A3: Reg 5(b) — specified injury on hospital premises (visitor)
A3=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E A3 Reg 5(b) hospital premises","type":"injury",
 "description":"Visitor broke wrist while on hospital grounds.",
 "incident_datetime":"$DT_BASE","area":"Hospital lobby","likelihood":1,"consequence":3,
 "body_parts_affected":["l_hand"],
 "type_data":{"injury_type":"Fracture","on_hospital_premises":true,"hospitalized":false},
 "affected_persons":[{"name":"A3 Person","employment_status":"visitor","is_primary":true,"injuries":[{"body_part":"l_hand","injury_type":"Fracture"}]}]}
EOF
)")
run "A3: reportable=1"                           "1" "$(reportable_for "$A3")"
run "A3: category=non_worker_specified_injury"   "non_worker_specified_injury" "$(cat_for "$A3")"
run "A3: deadline = 10 days"                     "10" "$(deadline_days_for "$A3")"

# A4: Reg 5(b) negative — non-specified injury on hospital premises
A4=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E A4 hospital premises bruise","type":"injury",
 "description":"Visitor bruised at hospital, no specified injury.",
 "incident_datetime":"$DT_BASE","area":"Hospital corridor","likelihood":1,"consequence":1,
 "body_parts_affected":["r_arm"],
 "type_data":{"injury_type":"Bruise","on_hospital_premises":true,"hospitalized":false},
 "affected_persons":[{"name":"A4 Person","employment_status":"visitor","is_primary":true,"injuries":[{"body_part":"r_arm","injury_type":"Bruise"}]}]}
EOF
)")
run "A4: reportable=0"                           "0" "$(reportable_for "$A4")"

# A5: Reorder behaviour — non-worker with specified injury, NOT on hospital, NOT hospitalized → NOT reportable
A5=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E A5 non-worker fracture not hospitalized","type":"injury",
 "description":"Member of public fractured wrist, refused hospital.",
 "incident_datetime":"$DT_BASE","area":"Reception","likelihood":2,"consequence":2,
 "body_parts_affected":["l_hand"],
 "type_data":{"injury_type":"Fracture","hospitalized":false,"on_hospital_premises":false},
 "affected_persons":[{"name":"A5 Person","employment_status":"member_of_public","is_primary":true,"injuries":[{"body_part":"l_hand","injury_type":"Fracture"}]}]}
EOF
)")
run "A5: reorder — non-worker fracture w/o hospital → reportable=0" "0" "$(reportable_for "$A5")"

echo ""
echo "== Section B — Reg 14 exceptions =="

# B1: Reg 14(1) — non-worker hospitalized from a medical procedure (should NOT report)
B1=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E B1 Reg 14(1) medical","type":"injury",
 "description":"Patient harmed during surgery — Reg 14(1) excludes.",
 "incident_datetime":"$DT_BASE","area":"Operating theatre","likelihood":1,"consequence":3,
 "body_parts_affected":["chest"],
 "type_data":{"injury_type":"Laceration","hospitalized":true,"reg14_medical_procedure_exception":true},
 "affected_persons":[{"name":"B1 Patient","employment_status":"member_of_public","is_primary":true,"injuries":[{"body_part":"chest","injury_type":"Laceration","hospitalized":1}]}]}
EOF
)")
run "B1: Reg 14(1) excluded → reportable=0"      "0" "$(reportable_for "$B1")"

# B2: Reg 14(3) — non-worker hospitalized from a road-vehicle accident, no carve-out (excluded)
B2=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E B2 Reg 14(3) road excluded","type":"injury",
 "description":"Pedestrian hit by reversing forklift on public road.",
 "incident_datetime":"$DT_BASE","area":"Loading bay","likelihood":2,"consequence":3,
 "body_parts_affected":["l_leg"],
 "type_data":{"injury_type":"Laceration","hospitalized":true,"reg14_3_road_vehicle":true,"reg14_3_road_vehicle_excluded":true},
 "affected_persons":[{"name":"B2 Pedestrian","employment_status":"member_of_public","is_primary":true,"injuries":[{"body_part":"l_leg","injury_type":"Laceration","hospitalized":1}]}]}
EOF
)")
run "B2: Reg 14(3) excluded → reportable=0"      "0" "$(reportable_for "$B2")"

# B3: Reg 14(3) carve-out applies (roadside work) — Reg 5 still fires
B3=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E B3 Reg 14(3) carve-out","type":"injury",
 "description":"Member of public hit at roadside work site — Reg 14(3)(d) carve-out applies.",
 "incident_datetime":"$DT_BASE","area":"A1 verge","likelihood":2,"consequence":3,
 "body_parts_affected":["r_leg"],
 "type_data":{"injury_type":"Fracture","hospitalized":true,"reg14_3_road_vehicle":true,"reg14_3_road_vehicle_excluded":false},
 "affected_persons":[{"name":"B3 Pedestrian","employment_status":"member_of_public","is_primary":true,"injuries":[{"body_part":"r_leg","injury_type":"Fracture","hospitalized":1}]}]}
EOF
)")
run "B3: carve-out → reportable=1"               "1" "$(reportable_for "$B3")"
run "B3: category=non_worker_hospitalization"    "non_worker_hospitalization" "$(cat_for "$B3")"

echo ""
echo "== Section C — Reg 11 gas-related =="

# C1: Reg 11(1) LPG supplier learns of hospitalization
C1=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E C1 Reg 11(1) LPG hospitalization","type":"injury",
 "description":"LPG cylinder explosion at customer site; victim hospitalized.",
 "incident_datetime":"$DT_BASE","area":"Customer site","likelihood":2,"consequence":3,
 "body_parts_affected":["chest"],
 "type_data":{"injury_type":"Burn","hospitalized":true,"gas_reporter_role":"lpg_supplier"},
 "affected_persons":[{"name":"C1 Victim","employment_status":"member_of_public","is_primary":true,"injuries":[{"body_part":"chest","injury_type":"Burn","hospitalized":1}]}]}
EOF
)")
# Note: with non-worker hospitalized, Reg 5(a) fires BEFORE Reg 11 reaches.
# This is correct per Reg 11(3)(a) — reportable elsewhere takes precedence.
run "C1: Reg 11(3)(a) precedence — Reg 5 wins"   "non_worker_hospitalization" "$(cat_for "$C1")"

# C2: Reg 11(1) LPG supplier — worker (employee) hospitalized, no Reg 4 trigger
C2=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E C2 Reg 11(1) worker no Reg 4","type":"injury",
 "description":"Worker hospitalized from LPG burn (no specified injury, < 7d away).",
 "incident_datetime":"$DT_BASE","area":"Customer site","likelihood":2,"consequence":3,
 "body_parts_affected":["chest"],
 "type_data":{"injury_type":"Burn","hospitalized":true,"gas_reporter_role":"lpg_supplier"},
 "affected_persons":[{"name":"C2 Worker","employment_status":"employee","is_primary":true,"injuries":[{"body_part":"chest","injury_type":"Burn","hospitalized":1}]}]}
EOF
)")
# Worker path: Reg 4(1) checks Fracture/Amputation/etc — "Burn" not in token list → no Reg 4 match.
# Falls through to Reg 11 → gas_incident.
run "C2: Reg 11(1) gas_incident — worker"        "gas_incident" "$(cat_for "$C2")"
run "C2: Reg 11 deadline = 14 days"              "14" "$(deadline_days_for "$C2")"

# C3: Reg 11(1) flammable_gas_conveyor + LOC via osha_recordability
C3=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E C3 Reg 11(1) conveyor LOC","type":"injury",
 "description":"Worker lost consciousness from natural-gas leak.",
 "incident_datetime":"$DT_BASE","area":"Boiler room","likelihood":2,"consequence":3,
 "body_parts_affected":["head"],
 "type_data":{"injury_type":"Inhalation","gas_reporter_role":"flammable_gas_conveyor","osha_recordability":["Loss of consciousness"]},
 "affected_persons":[{"name":"C3 Worker","employment_status":"employee","is_primary":true,"injuries":[{"body_part":"head","injury_type":"Inhalation"}]}]}
EOF
)")
run "C3: conveyor + LOC → gas_incident"          "gas_incident" "$(cat_for "$C3")"

# C4: Reg 11(2) approved person + dangerous gas fitting
C4=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E C4 Reg 11(2) dangerous fitting","type":"observation",
 "description":"Gas Safe engineer reports a faulty boiler install.",
 "incident_datetime":"$DT_BASE","area":"Utility room","likelihood":3,"consequence":3,
 "type_data":{"gas_reporter_role":"approved_person","gas_dangerous_fitting":true},
 "affected_persons":[{"name":"C4 Inspector","employment_status":"contractor","is_primary":true,"injuries":[]}]}
EOF
)")
run "C4: Reg 11(2) → gas_dangerous_fitting"      "gas_dangerous_fitting" "$(cat_for "$C4")"
run "C4: Reg 11(2) deadline = 14 days"           "14" "$(deadline_days_for "$C4")"

# C5: Reg 11(3)(b) — gas fitting under test → NOT reportable
C5=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E C5 Reg 11(3)(b) under test","type":"observation",
 "description":"Faulty fitting found during bench testing.",
 "incident_datetime":"$DT_BASE","area":"Lab","likelihood":3,"consequence":3,
 "type_data":{"gas_reporter_role":"approved_person","gas_dangerous_fitting":true,"gas_fitting_under_test":true},
 "affected_persons":[{"name":"C5 Inspector","employment_status":"contractor","is_primary":true,"injuries":[]}]}
EOF
)")
run "C5: Reg 11(3)(b) under_test → reportable=0" "0" "$(reportable_for "$C5")"

# C6: Reg 11(3)(c) — previously reported → NOT reportable
C6=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E C6 Reg 11(3)(c) previously reported","type":"observation",
 "description":"Already-reported faulty model; second sighting.",
 "incident_datetime":"$DT_BASE","area":"Customer site","likelihood":3,"consequence":3,
 "type_data":{"gas_reporter_role":"approved_person","gas_dangerous_fitting":true,"gas_previously_reported":true},
 "affected_persons":[{"name":"C6 Inspector","employment_status":"contractor","is_primary":true,"injuries":[]}]}
EOF
)")
run "C6: Reg 11(3)(c) previously_reported → reportable=0" "0" "$(reportable_for "$C6")"

# C7: Reg 11 + dangerous occurrence — Reg 7 wins (Reg 11(3)(a) precedence)
C7=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E C7 Reg 11(3)(a) — dangerous + gas","type":"dangerous",
 "description":"Gas main rupture — dangerous occurrence under Sch 2.",
 "incident_datetime":"$DT_BASE","area":"Yard","likelihood":2,"consequence":4,
 "type_data":{"gas_reporter_role":"lpg_supplier","hospitalized":true}}
EOF
)")
run "C7: dangerous + gas → dangerous_occurrence" "dangerous_occurrence" "$(cat_for "$C7")"

# C8: Gas escape without Reg 11 role → not Reg 11
C8=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E C8 gas escape no Reg 11","type":"nearmiss",
 "description":"Small gas leak detected, no Reg 11 role.",
 "incident_datetime":"$DT_BASE","area":"Workshop","likelihood":3,"consequence":2,
 "type_data":{"gas_incident":true}}
EOF
)")
run "C8: no Reg 11 role → reportable=0"          "0" "$(reportable_for "$C8")"

echo ""
echo "== Section D — Reg 4/6/7/8 regressions =="

# D1: Reg 4(1) specified injury (worker — Fracture)
D1=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E D1 Reg 4(1) fracture worker","type":"injury",
 "description":"Worker fractured ankle.",
 "incident_datetime":"$DT_BASE","area":"Shop floor","likelihood":2,"consequence":3,
 "body_parts_affected":["r_ankle"],
 "type_data":{"injury_type":"Fracture","hospitalized":true},
 "affected_persons":[{"name":"D1 Worker","employment_status":"employee","is_primary":true,"injuries":[{"body_part":"r_ankle","injury_type":"Fracture","hospitalized":1}]}]}
EOF
)")
run "D1: Reg 4(1) worker → specified_injury"    "specified_injury" "$(cat_for "$D1")"
run "D1: 10-day deadline"                        "10" "$(deadline_days_for "$D1")"

# D2: Reg 4(2) over-7-day (worker)
D2=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E D2 Reg 4(2) over-7-day","type":"injury",
 "description":"Worker off 12 days.",
 "incident_datetime":"$DT_BASE","area":"Shop floor","likelihood":2,"consequence":2,
 "body_parts_affected":["l_arm"],
 "type_data":{"injury_type":"Sprain","osha_days_away":12},
 "affected_persons":[{"name":"D2 Worker","employment_status":"employee","is_primary":true,"injuries":[{"body_part":"l_arm","injury_type":"Sprain","days_away":12}]}]}
EOF
)")
run "D2: Reg 4(2) over_7_day"                    "over_7_day" "$(cat_for "$D2")"
run "D2: 15-day deadline"                        "15" "$(deadline_days_for "$D2")"

# D3: Reg 6 — fatality (worker)
D3=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E D3 Reg 6 worker fatality","type":"injury",
 "description":"Worker fatally injured.",
 "incident_datetime":"$DT_BASE","area":"Shop floor","likelihood":1,"consequence":4,
 "body_parts_affected":["head"],
 "type_data":{"injury_type":"Crush Injury","treatment":["Fatality"]},
 "affected_persons":[{"name":"D3 Worker","employment_status":"employee","is_primary":true,"injuries":[{"body_part":"head","injury_type":"Crush Injury"}]}]}
EOF
)")
run "D3: Reg 6 fatality"                         "fatality" "$(cat_for "$D3")"

# D4: Reg 6 — non-worker fatality (Reg 6 still fires)
D4=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E D4 Reg 6 non-worker fatality","type":"injury",
 "description":"Member of public fatally injured.",
 "incident_datetime":"$DT_BASE","area":"Yard","likelihood":1,"consequence":4,
 "body_parts_affected":["chest"],
 "type_data":{"injury_type":"Crush Injury","treatment":["Fatality"]},
 "affected_persons":[{"name":"D4 Pub","employment_status":"member_of_public","is_primary":true,"injuries":[{"body_part":"chest","injury_type":"Crush Injury"}]}]}
EOF
)")
run "D4: Reg 6 fatality (non-worker)"            "fatality" "$(cat_for "$D4")"

# D5: Reg 7 — dangerous occurrence
D5=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E D5 Reg 7","type":"dangerous",
 "description":"Crane collapse.",
 "incident_datetime":"$DT_BASE","area":"Yard","likelihood":1,"consequence":3,"type_data":{}}
EOF
)")
run "D5: Reg 7 dangerous_occurrence"             "dangerous_occurrence" "$(cat_for "$D5")"

# D6: Reg 8 — occupational disease
D6=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E D6 Reg 8 disease","type":"illness",
 "description":"Diagnosed dermatitis from epoxy resin.",
 "incident_datetime":"$DT_BASE","area":"Lab","likelihood":2,"consequence":2,
 "type_data":{"illness_category":"Occupational dermatitis from epoxy resin"}}
EOF
)")
run "D6: Reg 8 disease"                          "disease" "$(cat_for "$D6")"

echo ""
echo "== Section E — Country gate, OSHA isolation, cross-tenant =="

# E1: Same Reg 5(a) payload on US site → not RIDDOR-reportable
E1=$(post_incident "$PRIYA" "$(cat <<EOF
{"site_id":$US_SITE,"title":"E2E E1 US site Reg 5(a)-shape","type":"injury",
 "description":"Visitor hospitalized at US site — RIDDOR does not apply.",
 "incident_datetime":"$DT_BASE","area":"Reception","likelihood":2,"consequence":3,
 "body_parts_affected":["head"],
 "type_data":{"injury_type":"Laceration","hospitalized":true},
 "affected_persons":[{"name":"E1 Visitor","employment_status":"member_of_public","is_primary":true,"injuries":[{"body_part":"head","injury_type":"Laceration","hospitalized":1}]}]}
EOF
)")
run "E1: US site → riddor_reportable=0"          "0" "$(reportable_for "$E1")"
run "E1: US site → category empty"               "" "$(cat_for "$E1")"

# E2: Cross-tenant — acme (org_id=2) tries to read elena's A1 (org_id=1) → 404
# (priya and elena are in the same org so they're NOT a cross-tenant case.)
E2_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $ACME" "$BASE/api/incidents/$A1")
run "E2: cross-tenant read blocked (404)"        "404" "$E2_CODE"

echo ""
echo "== Section F — Audit log + reports surface =="

# F1: riddor_opened activity_log row exists for A1
F1=$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_log WHERE entity_type='incident' AND entity_id=$A1 AND action='riddor_opened';")
run "F1: A1 riddor_opened audit row exists"      "1" "$F1"

# F2: hash chain still verifies (admin-only endpoint, hence priya not elena)
F2=$(curl -s -H "Authorization: Bearer $PRIYA" "$BASE/api/reports/audit-log/verify" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ok'))")
run "F2: WI-C hash chain verifies"               "True" "$F2"

# F3: RIDDOR reports endpoint includes the new categories
F3=$(curl -s -H "Authorization: Bearer $ELENA" "$BASE/api/reports/riddor?site_id=$UK_SITE&year=2026" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(any(r.get('category')=='non_worker_hospitalization' for r in d.get('reports',[])))")
run "F3: RIDDOR list contains non_worker_hospitalization" "True" "$F3"

F4=$(curl -s -H "Authorization: Bearer $ELENA" "$BASE/api/reports/riddor?site_id=$UK_SITE&year=2026" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(any(r.get('category')=='gas_dangerous_fitting' for r in d.get('reports',[])))")
run "F4: RIDDOR list contains gas_dangerous_fitting" "True" "$F4"

echo ""
echo "== Section G — PATCH path behaviour (known limitation) =="

# G1: Post a non-RIDDOR worker injury, then PATCH to add hospitalization.
# Expected (per current BE): RIDDOR classification does NOT re-fire — riddor_reportable stays 0.
G1=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"E2E G1 baseline","type":"injury",
 "description":"Worker minor injury, will edit later.",
 "incident_datetime":"$DT_BASE","area":"Shop","likelihood":3,"consequence":1,
 "body_parts_affected":["r_hand"],
 "type_data":{"injury_type":"Bruise"},
 "affected_persons":[{"name":"G1 Worker","employment_status":"employee","is_primary":true,"injuries":[{"body_part":"r_hand","injury_type":"Bruise"}]}]}
EOF
)")
run "G1: baseline reportable=0"                  "0" "$(reportable_for "$G1")"

curl -s -X PATCH "$BASE/api/incidents/$G1" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ELENA" \
  -d '{"type_data":{"injury_type":"Fracture"}}' > /dev/null
run "G1: PATCH does NOT re-classify (known limitation)" "0" "$(reportable_for "$G1")"

echo ""
echo "===================================================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "===================================================="
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "Failed tests:"
  for f in "${FAILED[@]}"; do echo "  - $f"; done
fi
echo ""
echo "Note: G1 documents a PRE-EXISTING limitation (RIDDOR not re-classified"
echo "on PATCH). Not a WI-04 regression — out of scope to fix here."

exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
