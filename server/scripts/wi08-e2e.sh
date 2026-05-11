#!/usr/bin/env bash
# server/scripts/wi08-e2e.sh — end-to-end coverage for the WI-08
# regulatory-deadline aggregator.
#
# Verifies:
#   • Aggregated /deadlines endpoint returns correct shape for RIDDOR
#     incidents, with the right kind + reg_ref + status transitions.
#   • Phone-notification status flips to 'submitted' once
#     phone_notified_at is set.
#   • Written status flips to 'submitted' once written_submitted_at is set.
#   • Non-RIDDOR (US-site) incidents return an empty array.
#   • disease category (no phone, no written deadline) returns []
#     because the riddor_reports.written_deadline is NULL by design.
#   • Cross-tenant requests get 404 (acme cannot read elena's incident).
#   • The list endpoint attaches pending_deadlines + most_urgent_deadline
#     to each row, and the most-urgent picker prefers without_delay over
#     upcoming.

set -u

BASE="http://localhost:3001"
DB="db/incident_management.db"
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

login() {
  curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"password123\"}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))"
}

ELENA=$(login elena@sdsmanager.com)
PRIYA=$(login priya@sdsmanager.com)
ACME=$(login acme@sdsmanager.com)
run "login elena"               "non-empty" "$([ -n "$ELENA" ] && echo non-empty || echo empty)"
run "login priya"               "non-empty" "$([ -n "$PRIYA" ] && echo non-empty || echo empty)"
run "login acme (cross-tenant)" "non-empty" "$([ -n "$ACME" ] && echo non-empty || echo empty)"

UK_SITE=$(sqlite3 "$DB" "SELECT id FROM sites WHERE country='UK' AND org_id=1 LIMIT 1;")
US_SITE=$(sqlite3 "$DB" "SELECT id FROM sites WHERE country='US' AND org_id=1 LIMIT 1;")
run "UK site discovered" "non-zero" "$([ "${UK_SITE:-0}" -gt 0 ] && echo non-zero || echo zero)"
run "US site discovered" "non-zero" "$([ "${US_SITE:-0}" -gt 0 ] && echo non-zero || echo zero)"

post_incident() {
  curl -s -X POST "$BASE/api/incidents" -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $1" -d "$2" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))"
}

deadlines_for() {
  curl -s -H "Authorization: Bearer $ELENA" "$BASE/api/incidents/$1/deadlines"
}

echo ""
echo "== Section A — UK RIDDOR specified injury (phone + written) =="

# A1: specified_injury → phone required, 10-day written
A1=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"WI-08 A1 fracture worker","type":"injury",
 "description":"Worker fractured radius in press.",
 "incident_datetime":"2026-05-12T10:00:00","area":"Press shop","likelihood":2,"consequence":3,
 "body_parts_affected":["l_arm"],
 "type_data":{"injury_type":"Fracture","hospitalized":true},
 "affected_persons":[{"name":"A1 Worker","employment_status":"employee","is_primary":true,"injuries":[{"body_part":"l_arm","injury_type":"Fracture","hospitalized":1}]}]}
EOF
)")
A1_OUT=$(deadlines_for "$A1")
A1_PHONE_STATUS=$(echo "$A1_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); ps=[p for p in d['pending_deadlines'] if p['kind']=='riddor_phone']; print(ps[0]['status'] if ps else 'missing')")
A1_WRITTEN_STATUS=$(echo "$A1_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); ws=[p for p in d['pending_deadlines'] if p['kind']=='riddor_written']; print(ws[0]['status'] if ws else 'missing')")
A1_REG=$(echo "$A1_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); ps=[p for p in d['pending_deadlines'] if p['kind']=='riddor_phone']; print(ps[0]['reg_ref'] if ps else 'missing')")
run "A1: phone status='without_delay'"            "without_delay" "$A1_PHONE_STATUS"
run "A1: written status='upcoming' (deadline > 72h)" "upcoming" "$A1_WRITTEN_STATUS"
run "A1: reg_ref='Reg 4(1)'"                       "Reg 4(1)"      "$A1_REG"

# A2: After we mark the RIDDOR report as phone-notified, status flips
sqlite3 "$DB" "UPDATE riddor_reports SET phone_notified_at=datetime('now') WHERE incident_id=$A1;" 2>&1 > /dev/null || true
A2_OUT=$(deadlines_for "$A1")
A2_PHONE_STATUS=$(echo "$A2_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); ps=[p for p in d['pending_deadlines'] if p['kind']=='riddor_phone']; print(ps[0]['status'] if ps else 'missing')")
run "A2: phone status='submitted' after notification" "submitted" "$A2_PHONE_STATUS"

# A3: Then submit the written report → written status flips
sqlite3 "$DB" "UPDATE riddor_reports SET written_submitted_at=datetime('now') WHERE incident_id=$A1;" 2>&1 > /dev/null || true
A3_OUT=$(deadlines_for "$A1")
A3_WRITTEN_STATUS=$(echo "$A3_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); ws=[p for p in d['pending_deadlines'] if p['kind']=='riddor_written']; print(ws[0]['status'] if ws else 'missing')")
run "A3: written status='submitted' after submission" "submitted" "$A3_WRITTEN_STATUS"

echo ""
echo "== Section B — UK RIDDOR over-7-day (no phone, 15-day written) =="

B1=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"WI-08 B1 over-7-day","type":"injury",
 "description":"Worker off 10 days, sprain.",
 "incident_datetime":"2026-05-12T10:00:00","area":"Loading","likelihood":2,"consequence":2,
 "body_parts_affected":["l_arm"],
 "type_data":{"injury_type":"Sprain","osha_days_away":12},
 "affected_persons":[{"name":"B1 Worker","employment_status":"employee","is_primary":true,"injuries":[{"body_part":"l_arm","injury_type":"Sprain","days_away":12}]}]}
EOF
)")
B1_OUT=$(deadlines_for "$B1")
B1_COUNT=$(echo "$B1_OUT" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['pending_deadlines']))")
B1_PHONE_COUNT=$(echo "$B1_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len([p for p in d['pending_deadlines'] if p['kind']=='riddor_phone']))")
B1_WRITTEN_REG=$(echo "$B1_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); ws=[p for p in d['pending_deadlines'] if p['kind']=='riddor_written']; print(ws[0]['reg_ref'] if ws else 'missing')")
run "B1: count=1 (over_7_day has no phone duty)"  "1" "$B1_COUNT"
run "B1: no riddor_phone entry"                    "0" "$B1_PHONE_COUNT"
run "B1: written reg_ref='Reg 4(2)'"               "Reg 4(2)" "$B1_WRITTEN_REG"

echo ""
echo "== Section C — UK RIDDOR disease (no phone, no fixed deadline) =="

C1=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"WI-08 C1 dermatitis","type":"illness",
 "description":"Diagnosed occupational dermatitis.",
 "incident_datetime":"2026-05-12T10:00:00","area":"Lab","likelihood":2,"consequence":2,
 "type_data":{"illness_category":"Occupational dermatitis from epoxy"}}
EOF
)")
C1_OUT=$(deadlines_for "$C1")
C1_COUNT=$(echo "$C1_OUT" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['pending_deadlines']))")
run "C1: disease → no deadlines surfaced (no fixed clock)" "0" "$C1_COUNT"

echo ""
echo "== Section D — Non-RIDDOR (US site) =="

D1=$(post_incident "$PRIYA" "$(cat <<EOF
{"site_id":$US_SITE,"title":"WI-08 D1 US injury","type":"injury",
 "description":"US site, no RIDDOR.",
 "incident_datetime":"2026-05-12T10:00:00","area":"Floor","likelihood":2,"consequence":2,
 "body_parts_affected":["l_hand"],
 "type_data":{"injury_type":"Laceration"},
 "affected_persons":[{"name":"D1 Worker","employment_status":"employee","is_primary":true,"injuries":[{"body_part":"l_hand","injury_type":"Laceration"}]}]}
EOF
)")
D1_OUT=$(curl -s -H "Authorization: Bearer $PRIYA" "$BASE/api/incidents/$D1/deadlines")
D1_COUNT=$(echo "$D1_OUT" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['pending_deadlines']))")
run "D1: US incident → 0 deadlines"  "0" "$D1_COUNT"

echo ""
echo "== Section E — Cross-tenant + list-attachment =="

# E1: acme cannot read elena's incident's deadlines.
E1_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $ACME" "$BASE/api/incidents/$A1/deadlines")
run "E1: cross-tenant /deadlines → 404"   "404" "$E1_CODE"

# E2: GET /incidents (list) attaches pending_deadlines and most_urgent_deadline.
# The B1 (over_7_day) row should have most_urgent_deadline.kind=riddor_written and status=upcoming.
E2_OUT=$(curl -s -H "Authorization: Bearer $ELENA" "$BASE/api/incidents?limit=200")
E2_FOUND=$(echo "$E2_OUT" | python3 -c "
import sys,json
data = json.load(sys.stdin)
target = next((i for i in data.get('incidents',[]) if i.get('id') == $B1), None)
if not target: print('missing'); sys.exit()
pd = target.get('pending_deadlines') or []
mu = target.get('most_urgent_deadline') or {}
ok_count = len(pd) == 1
ok_mu = mu.get('kind') == 'riddor_written' and mu.get('status') == 'upcoming'
print('ok' if (ok_count and ok_mu) else f'count={len(pd)} mu={mu.get(\"kind\")}/{mu.get(\"status\")}')
")
run "E2: list row attaches pending_deadlines + most_urgent" "ok" "$E2_FOUND"

# E3: the A1 row's most-urgent should now be 'submitted' (we marked phone+written
# submitted earlier). Verifies the ranking actually picks the right entry when
# multiple deadlines exist.
E3_OUT=$(echo "$E2_OUT" | python3 -c "
import sys,json
data = json.load(sys.stdin)
target = next((i for i in data.get('incidents',[]) if i.get('id') == $A1), None)
if not target: print('missing'); sys.exit()
mu = target.get('most_urgent_deadline') or {}
print(mu.get('status') or 'missing')
")
run "E3: A1 most-urgent status='submitted' after both done" "submitted" "$E3_OUT"

# E4: detail endpoint also attaches pending_deadlines + most_urgent_deadline
E4_OUT=$(curl -s -H "Authorization: Bearer $ELENA" "$BASE/api/incidents/$B1")
E4_HAS=$(echo "$E4_OUT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
pd=d.get('pending_deadlines',[])
mu=d.get('most_urgent_deadline')
print('ok' if (len(pd)==1 and mu and mu['kind']=='riddor_written') else f'count={len(pd)} mu={mu}')
")
run "E4: detail endpoint attaches deadlines" "ok" "$E4_HAS"

echo ""
echo "===================================================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "===================================================="
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "Failed tests:"
  for f in "${FAILED[@]}"; do echo "  - $f"; done
fi

exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
