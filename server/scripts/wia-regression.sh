#!/bin/bash
# WI-A regression test matrix — exercises every code path touched tonight
# plus high-risk adjacent surfaces. Idempotent: each test cleans up its
# own data.

set +e
cd "/Users/rukaiyafahmida/Downloads/SDS Manager Incident Management System/project/ehs-incident-manager/server"

PASS=0
FAIL=0
FAILED_TESTS=()

run() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS+1))
    printf "  \033[32mPASS\033[0m  %-60s\n" "$name"
  else
    FAIL=$((FAIL+1))
    FAILED_TESTS+=("$name :: expected $expected got $actual")
    printf "  \033[31mFAIL\033[0m  %-60s  expected=$expected got=$actual\n" "$name"
  fi
}

# --- Auth ---
PRIYA=$(curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"email":"priya@sdsmanager.com","password":"password123"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
WENDY=$(curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"email":"wendy@sdsmanager.com","password":"password123"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
ELENA=$(curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"email":"elena@sdsmanager.com","password":"password123"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
SYD=$(curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"email":"sydney-test@example.com","password":"password123"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

run "auth: priya login"   200 "$(curl -sw '%{http_code}' -o /dev/null -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"email":"priya@sdsmanager.com","password":"password123"}')"
run "auth: bad creds → 401" 401 "$(curl -sw '%{http_code}' -o /dev/null -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"email":"x","password":"x"}')"
run "auth: tokens non-empty" "yyyy" "$([ ${#PRIYA} -gt 0 ] && echo -n y; [ ${#WENDY} -gt 0 ] && echo -n y; [ ${#ELENA} -gt 0 ] && echo -n y; [ ${#SYD} -gt 0 ] && echo -n y)"

# ========================================================================
# SECTION B: POST /incidents — regression on both shapes
# ========================================================================
echo
echo "== Section B: POST /incidents =="

# B1. Legacy single-person POST creates primary AP
cat > /tmp/wt-b1.json <<'EOF'
{"site_id":1,"title":"REGRESSION B1 legacy POST","type":"injury","description":"test","incident_datetime":"2026-05-12T10:00:00","area":"x","likelihood":2,"consequence":2,"body_parts_affected":["l_hand"],"type_data":{"injured_person":{"name":"B1 Person","job_title":"Tester"},"treatment":["Medical treatment"]}}
EOF
B1=$(curl -s -X POST -H "Authorization: Bearer $PRIYA" -H 'Content-Type: application/json' --data @/tmp/wt-b1.json http://localhost:3001/api/incidents)
B1_ID=$(echo "$B1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',0))")
run "B1: legacy POST returns id"       "non-zero" "$([ "$B1_ID" -gt 0 ] && echo non-zero || echo zero)"
run "B1: osha_recordable=1"            "1" "$(echo "$B1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('osha_recordable'))")"
run "B1: primary AP created"           "B1 Person" "$(sqlite3 db/incident_management.db "SELECT name FROM affected_persons WHERE incident_id=$B1_ID AND is_primary=1 AND deleted_at IS NULL;")"
run "B1: primary injury created"       "l_hand"    "$(sqlite3 db/incident_management.db "SELECT body_part FROM injuries WHERE org_id=1 AND deleted_at IS NULL AND affected_person_id IN (SELECT id FROM affected_persons WHERE incident_id=$B1_ID);")"
run "B1: osha_300_log row written"     "1" "$(sqlite3 db/incident_management.db "SELECT COUNT(*) FROM osha_300_log WHERE incident_id=$B1_ID;")"
run "B1: 'osha_300_auto_entry' audit"  "1" "$(sqlite3 db/incident_management.db "SELECT COUNT(*) FROM activity_log WHERE entity_type='incident' AND entity_id=$B1_ID AND action='osha_300_auto_entry';")"

# B2. Array-shape POST creates multiple APs
cat > /tmp/wt-b2.json <<'EOF'
{"site_id":1,"title":"REGRESSION B2 array POST","type":"injury","description":"test","incident_datetime":"2026-05-12T10:01:00","area":"x","likelihood":2,"consequence":2,"body_parts_affected":["head"],"type_data":{"treatment":["Medical treatment"]},"affected_persons":[{"name":"B2 Primary","job_title":"Operator","employment_status":"employee","is_primary":true,"injuries":[{"body_part":"head","injury_type":"Bruise"}]},{"name":"B2 Extra","employment_status":"contractor","injuries":[{"body_part":"l_foot"}]},{"name":"B2 Bystander","employment_status":"visitor","injuries":[]}]}
EOF
B2=$(curl -s -X POST -H "Authorization: Bearer $PRIYA" -H 'Content-Type: application/json' --data @/tmp/wt-b2.json http://localhost:3001/api/incidents)
B2_ID=$(echo "$B2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',0))")
run "B2: array POST returns id"        "non-zero" "$([ "$B2_ID" -gt 0 ] && echo non-zero || echo zero)"
run "B2: 3 APs created"                "3" "$(sqlite3 db/incident_management.db "SELECT COUNT(*) FROM affected_persons WHERE incident_id=$B2_ID AND deleted_at IS NULL;")"
run "B2: 1 primary"                    "1" "$(sqlite3 db/incident_management.db "SELECT COUNT(*) FROM affected_persons WHERE incident_id=$B2_ID AND is_primary=1 AND deleted_at IS NULL;")"
run "B2: primary is B2 Primary"        "B2 Primary" "$(sqlite3 db/incident_management.db "SELECT name FROM affected_persons WHERE incident_id=$B2_ID AND is_primary=1 AND deleted_at IS NULL;")"
run "B2: 2 injuries (primary+extra)"   "2" "$(sqlite3 db/incident_management.db "SELECT COUNT(*) FROM injuries WHERE org_id=1 AND deleted_at IS NULL AND affected_person_id IN (SELECT id FROM affected_persons WHERE incident_id=$B2_ID);")"
run "B2: type_data synthesized"        "B2 Primary" "$(sqlite3 db/incident_management.db "SELECT json_extract(type_data, '\$.injured_person.name') FROM incidents WHERE id=$B2_ID;")"

# B3. Nearmiss with no person data → no APs
cat > /tmp/wt-b3.json <<'EOF'
{"site_id":1,"title":"REGRESSION B3 nearmiss","type":"nearmiss","description":"test","incident_datetime":"2026-05-12T10:02:00","area":"x","likelihood":1,"consequence":1,"type_data":{}}
EOF
B3=$(curl -s -X POST -H "Authorization: Bearer $PRIYA" -H 'Content-Type: application/json' --data @/tmp/wt-b3.json http://localhost:3001/api/incidents)
B3_ID=$(echo "$B3" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',0))")
run "B3: nearmiss POST OK"             "non-zero" "$([ "$B3_ID" -gt 0 ] && echo non-zero || echo zero)"
run "B3: zero APs for nearmiss"        "0" "$(sqlite3 db/incident_management.db "SELECT COUNT(*) FROM affected_persons WHERE incident_id=$B3_ID;")"

# B4. UK dangerous occurrence triggers RIDDOR row (Elena's Sheffield UK site)
UK_SITE=$(sqlite3 db/incident_management.db "SELECT id FROM sites WHERE country='UK' LIMIT 1;")
cat > /tmp/wt-b4.json <<EOF
{"site_id":$UK_SITE,"title":"REGRESSION B4 UK dangerous","type":"dangerous","description":"crane collapse","incident_datetime":"2026-05-12T10:03:00","area":"x","likelihood":1,"consequence":3,"type_data":{}}
EOF
B4=$(curl -s -X POST -H "Authorization: Bearer $ELENA" -H 'Content-Type: application/json' --data @/tmp/wt-b4.json http://localhost:3001/api/incidents)
B4_ID=$(echo "$B4" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',0))")
run "B4: UK dangerous POST OK"         "non-zero" "$([ "$B4_ID" -gt 0 ] && echo non-zero || echo zero)"
run "B4: riddor_reports row created"   "1" "$(sqlite3 db/incident_management.db "SELECT COUNT(*) FROM riddor_reports WHERE incident_id=$B4_ID;")"
run "B4: 'riddor_opened' audit row"    "1" "$(sqlite3 db/incident_management.db "SELECT COUNT(*) FROM activity_log WHERE entity_type='incident' AND entity_id=$B4_ID AND action='riddor_opened';")"

# ========================================================================
# SECTION A: PATCH /incidents/:id matrix
# ========================================================================
echo
echo "== Section A: PATCH /incidents/:id (most-edited surface tonight) =="

# Use B1 for the matrix (has injured_person + osha_recordable). Get its AP.
B1_AP_ID=$(sqlite3 db/incident_management.db "SELECT id FROM affected_persons WHERE incident_id=$B1_ID AND is_primary=1 AND deleted_at IS NULL;")

# A1: title-only PATCH → no AP/injury audit rows fire
LOG_BEFORE_A1=$(sqlite3 db/incident_management.db "SELECT COUNT(*) FROM activity_log WHERE entity_type='incident' AND entity_id=$B1_ID AND action IN ('affected_person_updated','injury_updated');")
echo '{"title":"A1 title-only change"}' > /tmp/wt-a1.json
curl -s -X PATCH -H "Authorization: Bearer $PRIYA" -H 'Content-Type: application/json' --data @/tmp/wt-a1.json "http://localhost:3001/api/incidents/$B1_ID" > /dev/null
LOG_AFTER_A1=$(sqlite3 db/incident_management.db "SELECT COUNT(*) FROM activity_log WHERE entity_type='incident' AND entity_id=$B1_ID AND action IN ('affected_person_updated','injury_updated');")
run "A1: title-only PATCH (no AP side effect)" "0" "$((LOG_AFTER_A1 - LOG_BEFORE_A1))"

# A2: severity override
echo '{"severity":1,"severity_override_reason":"test escalation"}' > /tmp/wt-a2.json
A2_RESP=$(curl -sw 'HTTP %{http_code}' -X PATCH -H "Authorization: Bearer $PRIYA" -H 'Content-Type: application/json' --data @/tmp/wt-a2.json "http://localhost:3001/api/incidents/$B1_ID")
run "A2: severity override 200"        "200" "$(echo "$A2_RESP" | tail -c 4)"
run "A2: severity_overridden audit"    "1" "$(sqlite3 db/incident_management.db "SELECT COUNT(*) FROM activity_log WHERE entity_type='incident' AND entity_id=$B1_ID AND action='severity_overridden';")"
run "A2: severity is now 1"            "1" "$(sqlite3 db/incident_management.db "SELECT severity FROM incidents WHERE id=$B1_ID;")"

# A3: nested type_data.injured_person PATCH → AP synced
echo '{"type_data":{"injured_person":{"name":"A3 Renamed","job_title":"Tester","dob":"1992-06-30","email":"a3@example.com"}}}' > /tmp/wt-a3.json
curl -s -X PATCH -H "Authorization: Bearer $PRIYA" -H 'Content-Type: application/json' --data @/tmp/wt-a3.json "http://localhost:3001/api/incidents/$B1_ID" > /dev/null
run "A3: nested PATCH → ap.name synced"    "A3 Renamed" "$(sqlite3 db/incident_management.db "SELECT name FROM affected_persons WHERE id=$B1_AP_ID;")"
run "A3: ap.dob synced"                    "1992-06-30" "$(sqlite3 db/incident_management.db "SELECT dob FROM affected_persons WHERE id=$B1_AP_ID;")"
run "A3: ap.email synced"                  "a3@example.com" "$(sqlite3 db/incident_management.db "SELECT email FROM affected_persons WHERE id=$B1_AP_ID;")"

# A4: flat-key PATCH → liftFlatInjuredKeys triggers, AP synced
echo '{"type_data":{"injured_name":"A4 FlatName","injured_phone":"(555)888-7777","injured_address":"456 Flat St","injured_person":{"job_title":"Tester","dob":"1992-06-30"}}}' > /tmp/wt-a4.json
curl -s -X PATCH -H "Authorization: Bearer $PRIYA" -H 'Content-Type: application/json' --data @/tmp/wt-a4.json "http://localhost:3001/api/incidents/$B1_ID" > /dev/null
run "A4: flat PATCH → ap.name lifted"      "A4 FlatName" "$(sqlite3 db/incident_management.db "SELECT name FROM affected_persons WHERE id=$B1_AP_ID;")"
run "A4: ap.phone lifted"                  "(555)888-7777" "$(sqlite3 db/incident_management.db "SELECT phone FROM affected_persons WHERE id=$B1_AP_ID;")"
run "A4: ap.address lifted"                "456 Flat St"   "$(sqlite3 db/incident_management.db "SELECT address FROM affected_persons WHERE id=$B1_AP_ID;")"
run "A4: type_data nested has lifted name" "A4 FlatName"   "$(sqlite3 db/incident_management.db "SELECT json_extract(type_data, '\$.injured_person.name') FROM incidents WHERE id=$B1_ID;")"

# A5: osha_privacy_case → AP.is_privacy_case mirrored
echo '{"osha_privacy_case":1}' > /tmp/wt-a5.json
curl -s -X PATCH -H "Authorization: Bearer $PRIYA" -H 'Content-Type: application/json' --data @/tmp/wt-a5.json "http://localhost:3001/api/incidents/$B1_ID" > /dev/null
run "A5: privacy flag mirrors to AP"      "1" "$(sqlite3 db/incident_management.db "SELECT is_privacy_case FROM affected_persons WHERE id=$B1_AP_ID;")"

# A6: er_treated + hospitalized + days_away → primary injury patched
echo '{"er_treated":1,"hospitalized":1,"hospitalization_date":"2026-05-12","osha_days_away":5,"description":"updated narrative"}' > /tmp/wt-a6.json
curl -s -X PATCH -H "Authorization: Bearer $PRIYA" -H 'Content-Type: application/json' --data @/tmp/wt-a6.json "http://localhost:3001/api/incidents/$B1_ID" > /dev/null
run "A6: injury.er_treated synced"        "1" "$(sqlite3 db/incident_management.db "SELECT er_treated FROM injuries WHERE affected_person_id=$B1_AP_ID AND deleted_at IS NULL ORDER BY id LIMIT 1;")"
run "A6: injury.days_away synced"         "5" "$(sqlite3 db/incident_management.db "SELECT days_away FROM injuries WHERE affected_person_id=$B1_AP_ID AND deleted_at IS NULL ORDER BY id LIMIT 1;")"
run "A6: injury.narrative synced"         "updated narrative" "$(sqlite3 db/incident_management.db "SELECT narrative FROM injuries WHERE affected_person_id=$B1_AP_ID AND deleted_at IS NULL ORDER BY id LIMIT 1;")"

# A7: PATCH on nearmiss (no AP) → no error
echo '{"description":"updated nearmiss description"}' > /tmp/wt-a7.json
run "A7: nearmiss PATCH no AP error"      "200" "$(curl -sw '%{http_code}' -o /dev/null -X PATCH -H "Authorization: Bearer $PRIYA" -H 'Content-Type: application/json' --data @/tmp/wt-a7.json "http://localhost:3001/api/incidents/$B3_ID")"

# ========================================================================
# SECTION C: Affected persons CRUD
# ========================================================================
echo
echo "== Section C: Affected persons CRUD =="

# C1: GET list shape
C1=$(curl -s -H "Authorization: Bearer $PRIYA" "http://localhost:3001/api/incidents/$B2_ID/affected-persons")
run "C1: GET returns affected_persons key" "list" "$(echo "$C1" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print('list' if isinstance(d.get('affected_persons'),list) else 'no')")"
run "C1: each has injuries[]"             "yes" "$(echo "$C1" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print('yes' if all('injuries' in p for p in d['affected_persons']) else 'no')")"

# C2: Add a new person to B2 (with employee status)
cat > /tmp/wt-c2.json <<'EOF'
{"name":"C2 Added","job_title":"Inspector","employment_status":"employee","injuries":[{"body_part":"r_hand","injury_type":"Cut"}]}
EOF
C2=$(curl -s -X POST -H "Authorization: Bearer $PRIYA" -H 'Content-Type: application/json' --data @/tmp/wt-c2.json "http://localhost:3001/api/incidents/$B2_ID/affected-persons")
C2_AP_ID=$(echo "$C2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',0))")
run "C2: POST returns id"                 "non-zero" "$([ "$C2_AP_ID" -gt 0 ] && echo non-zero || echo zero)"
run "C2: B2 now has 4 APs"                "4" "$(sqlite3 db/incident_management.db "SELECT COUNT(*) FROM affected_persons WHERE incident_id=$B2_ID AND deleted_at IS NULL;")"

# C3: Primary rotation — POST another with is_primary=true; existing primary should be demoted
cat > /tmp/wt-c3.json <<'EOF'
{"name":"C3 New Primary","employment_status":"employee","is_primary":true,"injuries":[]}
EOF
C3=$(curl -s -X POST -H "Authorization: Bearer $PRIYA" -H 'Content-Type: application/json' --data @/tmp/wt-c3.json "http://localhost:3001/api/incidents/$B2_ID/affected-persons")
C3_AP_ID=$(echo "$C3" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',0))")
run "C3: still exactly 1 primary"         "1" "$(sqlite3 db/incident_management.db "SELECT COUNT(*) FROM affected_persons WHERE incident_id=$B2_ID AND is_primary=1 AND deleted_at IS NULL;")"
run "C3: new primary is C3 New Primary"   "C3 New Primary" "$(sqlite3 db/incident_management.db "SELECT name FROM affected_persons WHERE incident_id=$B2_ID AND is_primary=1 AND deleted_at IS NULL;")"

# C4: PATCH C2 person — change job_title only; other fields preserved
echo '{"job_title":"Senior Inspector"}' > /tmp/wt-c4.json
curl -s -X PATCH -H "Authorization: Bearer $PRIYA" -H 'Content-Type: application/json' --data @/tmp/wt-c4.json "http://localhost:3001/api/incidents/$B2_ID/affected-persons/$C2_AP_ID" > /dev/null
run "C4: ap.job_title updated"            "Senior Inspector" "$(sqlite3 db/incident_management.db "SELECT job_title FROM affected_persons WHERE id=$C2_AP_ID;")"
run "C4: ap.name preserved"               "C2 Added" "$(sqlite3 db/incident_management.db "SELECT name FROM affected_persons WHERE id=$C2_AP_ID;")"
run "C4: ap.employment_status preserved"  "employee" "$(sqlite3 db/incident_management.db "SELECT employment_status FROM affected_persons WHERE id=$C2_AP_ID;")"

# C5: Add injury to C2 person
cat > /tmp/wt-c5.json <<'EOF'
{"body_part":"l_ankle","injury_type":"Sprain","mechanism":"slip"}
EOF
C5=$(curl -s -X POST -H "Authorization: Bearer $PRIYA" -H 'Content-Type: application/json' --data @/tmp/wt-c5.json "http://localhost:3001/api/incidents/$B2_ID/affected-persons/$C2_AP_ID/injuries")
C5_INJ_ID=$(echo "$C5" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',0))")
run "C5: injury POST returns id"          "non-zero" "$([ "$C5_INJ_ID" -gt 0 ] && echo non-zero || echo zero)"
run "C5: C2 person now has 2 injuries"    "2" "$(sqlite3 db/incident_management.db "SELECT COUNT(*) FROM injuries WHERE affected_person_id=$C2_AP_ID AND deleted_at IS NULL;")"

# C6: PATCH injury
echo '{"days_away":2}' > /tmp/wt-c6.json
curl -s -X PATCH -H "Authorization: Bearer $PRIYA" -H 'Content-Type: application/json' --data @/tmp/wt-c6.json "http://localhost:3001/api/incidents/$B2_ID/affected-persons/$C2_AP_ID/injuries/$C5_INJ_ID" > /dev/null
run "C6: injury PATCH days_away"          "2" "$(sqlite3 db/incident_management.db "SELECT days_away FROM injuries WHERE id=$C5_INJ_ID;")"

# C7: DELETE injury (soft)
curl -s -X DELETE -H "Authorization: Bearer $PRIYA" "http://localhost:3001/api/incidents/$B2_ID/affected-persons/$C2_AP_ID/injuries/$C5_INJ_ID" > /dev/null
run "C7: injury soft-deleted"             "1" "$(sqlite3 db/incident_management.db "SELECT COUNT(*) FROM injuries WHERE id=$C5_INJ_ID AND deleted_at IS NOT NULL;")"

# C8: DELETE person (soft + cascade injuries)
curl -s -X DELETE -H "Authorization: Bearer $PRIYA" "http://localhost:3001/api/incidents/$B2_ID/affected-persons/$C2_AP_ID" > /dev/null
run "C8: AP soft-deleted"                 "1" "$(sqlite3 db/incident_management.db "SELECT COUNT(*) FROM affected_persons WHERE id=$C2_AP_ID AND deleted_at IS NOT NULL;")"
run "C8: cascaded injury soft-deleted"    "0" "$(sqlite3 db/incident_management.db "SELECT COUNT(*) FROM injuries WHERE affected_person_id=$C2_AP_ID AND deleted_at IS NULL;")"

# C9: Worker role 403 on mutations
run "C9a: worker GET allowed"             "200" "$(curl -sw '%{http_code}' -o /dev/null -H "Authorization: Bearer $WENDY" "http://localhost:3001/api/incidents/$B2_ID/affected-persons")"
run "C9b: worker POST forbidden"          "403" "$(curl -sw '%{http_code}' -o /dev/null -X POST -H "Authorization: Bearer $WENDY" -H 'Content-Type: application/json' -d '{"name":"hack"}' "http://localhost:3001/api/incidents/$B2_ID/affected-persons")"
run "C9c: worker PATCH forbidden"         "403" "$(curl -sw '%{http_code}' -o /dev/null -X PATCH -H "Authorization: Bearer $WENDY" -H 'Content-Type: application/json' -d '{"name":"hack"}' "http://localhost:3001/api/incidents/$B2_ID/affected-persons/$C3_AP_ID")"
run "C9d: worker DELETE forbidden"        "403" "$(curl -sw '%{http_code}' -o /dev/null -X DELETE -H "Authorization: Bearer $WENDY" "http://localhost:3001/api/incidents/$B2_ID/affected-persons/$C3_AP_ID")"

# C10: cross-org 404
run "C10a: sydney-test sees B2 as 404"    "404" "$(curl -sw '%{http_code}' -o /dev/null -H "Authorization: Bearer $SYD" "http://localhost:3001/api/incidents/$B2_ID/affected-persons")"
run "C10b: sydney cant POST to B2"        "404" "$(curl -sw '%{http_code}' -o /dev/null -X POST -H "Authorization: Bearer $SYD" -H 'Content-Type: application/json' -d '{"name":"x"}' "http://localhost:3001/api/incidents/$B2_ID/affected-persons")"

# C11: Modal-edit-mode-style PATCH (multi-field at once)
echo '{"name":"C11 Renamed","job_title":"Lead","is_privacy_case":true}' > /tmp/wt-c11.json
curl -s -X PATCH -H "Authorization: Bearer $PRIYA" -H 'Content-Type: application/json' --data @/tmp/wt-c11.json "http://localhost:3001/api/incidents/$B2_ID/affected-persons/$C3_AP_ID" > /dev/null
run "C11: multi-field PATCH name"         "C11 Renamed" "$(sqlite3 db/incident_management.db "SELECT name FROM affected_persons WHERE id=$C3_AP_ID;")"
run "C11: multi-field PATCH privacy"      "1"           "$(sqlite3 db/incident_management.db "SELECT is_privacy_case FROM affected_persons WHERE id=$C3_AP_ID;")"

# ========================================================================
# SECTION D: Hash chain & audit trail
# ========================================================================
echo
echo "== Section D: WI-C hash chain + audit =="

# D1: verifyChain still returns ok for priya's org after all the above
D1=$(curl -s -H "Authorization: Bearer $PRIYA" http://localhost:3001/api/reports/audit-log/verify | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('ok'))")
run "D1: WI-C chain verifies post-tests" "True" "$D1"

# D2: try to UPDATE an activity_log row → blocked by trigger
RAISE=$(sqlite3 db/incident_management.db "UPDATE activity_log SET description='tampered' WHERE id=1;" 2>&1 | head -1)
run "D2: UPDATE on activity_log blocked"  "yes" "$(echo "$RAISE" | grep -qi 'append-only\|abort' && echo yes || echo no)"

# D3: try to DELETE an activity_log row → blocked by trigger
RAISE2=$(sqlite3 db/incident_management.db "DELETE FROM activity_log WHERE id=1;" 2>&1 | head -1)
run "D3: DELETE on activity_log blocked"  "yes" "$(echo "$RAISE2" | grep -qi 'cannot be deleted\|abort' && echo yes || echo no)"

# ========================================================================
# SECTION E: Reports endpoints
# ========================================================================
echo
echo "== Section E: Reports endpoints =="

# E1: OSHA 301 returns full employee block
E1=$(curl -s -H "Authorization: Bearer $PRIYA" "http://localhost:3001/api/reports/osha-301/$B1_ID")
run "E1: OSHA 301 200 OK"                 "200" "$(curl -sw '%{http_code}' -o /dev/null -H "Authorization: Bearer $PRIYA" "http://localhost:3001/api/reports/osha-301/$B1_ID")"
run "E1: employee.name present"           "A4 FlatName" "$(echo "$E1" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['employee']['name'])")"
run "E1: employee.dob field present"      "True" "$(echo "$E1" | python3 -c "import sys,json; print('dob' in json.loads(sys.stdin.read())['employee'])")"
run "E1: employee.phone present"          "(555)888-7777" "$(echo "$E1" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['employee']['phone'])")"

# E2: OSHA 300 endpoint
run "E2: OSHA 300 list 200"               "200" "$(curl -sw '%{http_code}' -o /dev/null -H "Authorization: Bearer $PRIYA" "http://localhost:3001/api/reports/osha-300?site_id=1&year=2026")"

# E3: OSHA 300A
run "E3: OSHA 300A 200"                   "200" "$(curl -sw '%{http_code}' -o /dev/null -H "Authorization: Bearer $PRIYA" "http://localhost:3001/api/reports/osha-300a?site_id=1&year=2026")"

# E4: RIDDOR list
run "E4: RIDDOR list 200"                 "200" "$(curl -sw '%{http_code}' -o /dev/null -H "Authorization: Bearer $ELENA" "http://localhost:3001/api/reports/riddor?site_id=$UK_SITE&year=2026")"

# E5: Site metrics
run "E5: site-metrics 200"                "200" "$(curl -sw '%{http_code}' -o /dev/null -H "Authorization: Bearer $PRIYA" "http://localhost:3001/api/reports/site-metrics?site_id=1&year=2026")"

# E6: Audit log query
run "E6: audit-log list 200"              "200" "$(curl -sw '%{http_code}' -o /dev/null -H "Authorization: Bearer $PRIYA" "http://localhost:3001/api/reports/audit-log?limit=1")"

# E7: audit-log CSV export
E7=$(curl -s -H "Authorization: Bearer $PRIYA" "http://localhost:3001/api/reports/audit-log/export.csv?limit=1" | head -c 200)
run "E7: CSV has new columns header"      "yes" "$(echo "$E7" | grep -q 'ip_address.*user_agent.*field_diffs.*entry_hash' && echo yes || echo no)"

# ========================================================================
# SECTION F: Adjacent regressions (witnesses, voice extract stub, dashboard)
# ========================================================================
echo
echo "== Section F: Adjacent regression =="

run "F1: witnesses endpoint 200 on B1"     "200" "$(curl -sw '%{http_code}' -o /dev/null -X POST -H "Authorization: Bearer $PRIYA" -H 'Content-Type: application/json' -d '{"name":"F1 Witness","contact":"555-test"}' "http://localhost:3001/api/incidents/$B1_ID/witnesses")"
run "F2: dashboard load 200"               "200" "$(curl -sw '%{http_code}' -o /dev/null -H "Authorization: Bearer $PRIYA" "http://localhost:3001/api/dashboard")"
run "F3: notifications list 200"           "200" "$(curl -sw '%{http_code}' -o /dev/null -H "Authorization: Bearer $PRIYA" "http://localhost:3001/api/notifications")"
run "F4: incidents list 200"               "200" "$(curl -sw '%{http_code}' -o /dev/null -H "Authorization: Bearer $PRIYA" "http://localhost:3001/api/incidents")"
run "F5: incident detail 200"              "200" "$(curl -sw '%{http_code}' -o /dev/null -H "Authorization: Bearer $PRIYA" "http://localhost:3001/api/incidents/$B1_ID")"

# Final chain verify
echo
DFIN=$(curl -s -H "Authorization: Bearer $PRIYA" http://localhost:3001/api/reports/audit-log/verify | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(f'{d.get(\"ok\")},{d.get(\"count\")}')")
run "FINAL: chain verifies after ALL tests" "True" "$(echo "$DFIN" | cut -d, -f1)"

# ========================================================================
# Cleanup test data
# ========================================================================
echo
echo "== Cleanup =="
# Note: can't DELETE activity_log rows (WI-C triggers block); just soft-delete AP+inj and leave incidents.
sqlite3 db/incident_management.db <<SQL
UPDATE affected_persons SET deleted_at=datetime('now') WHERE incident_id IN ($B1_ID,$B2_ID,$B3_ID,$B4_ID) AND deleted_at IS NULL;
UPDATE injuries SET deleted_at=datetime('now') WHERE org_id IN (1,3) AND deleted_at IS NULL AND affected_person_id IN (SELECT id FROM affected_persons WHERE incident_id IN ($B1_ID,$B2_ID,$B3_ID,$B4_ID));
SQL
echo "test rows soft-deleted (incidents kept; activity_log immutable per WI-C)"

# ========================================================================
# Summary
# ========================================================================
echo
echo "==================================================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "==================================================="
if [ $FAIL -gt 0 ]; then
  echo
  echo "Failed tests:"
  for f in "${FAILED_TESTS[@]}"; do
    echo "  - $f"
  done
fi
exit $FAIL
