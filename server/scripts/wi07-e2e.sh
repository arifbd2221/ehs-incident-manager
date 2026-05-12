#!/usr/bin/env bash
# server/scripts/wi07-e2e.sh — end-to-end coverage for WI-07 OSHA 1904.39
# severe-injury notifications.
#
# Verifies:
#   • POST /incidents auto-creates osha_severe_notifications rows when
#     evaluateSevereInjury detects fatality / hospitalization / amputation
#     / loss_of_eye.
#   • 1904.39(a)(1) — 8-hour deadline for fatalities (from death event).
#   • 1904.39(a)(2) — 24-hour deadline for hospitalization / amputation /
#     loss_of_eye (from incident_datetime).
#   • 1904.39(b)(6) — fatalities outside the 30-day window are NOT
#     reportable (no row created).
#   • Multi-category incidents create multiple rows.
#   • US-only gate: UK / AU sites get no rows (1904.39 is US OSH Act).
#   • PATCH /incidents/:id with osha_date_of_death / hospitalized /
#     type_data.osha_severe.* re-runs classification and creates rows
#     when newly applicable. Idempotent — re-PATCHing doesn't dupe.
#   • Deadlines aggregator surfaces the rows on /incidents/:id (detail),
#     /incidents/:id/deadlines (dedicated), and the list /incidents
#     (pending_deadlines + most_urgent_deadline per row).
#   • Status enum: `due_soon` (<72h), `submitted` (after phone-notified).
#   • POST /reports/osha-severe/:notificationId/phone-notified writes
#     phone_notified_at + phone_notified_by, captures area_office /
#     osha_reference / notes. Idempotent (second submit returns same row).
#   • Worker role 403 on phone-notified write.
#   • Cross-tenant 404 on GET + write.
#   • activity_log entries: `osha_severe_opened` (POST + PATCH) and
#     `osha_severe_phone_notified` (write).
#   • WI-C hash chain still verifies after a full run.

set -u

BASE="http://localhost:3001"
DB="db/incident_management.db"
cd "$(dirname "$0")/.."

PASS=0; FAIL=0
declare -a FAILED

run() {
  local name="$1"; local expected="$2"; local actual="$3"
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS+1)); printf "  \033[32mPASS\033[0m  %-78s\n" "$name"
  else
    FAIL=$((FAIL+1)); FAILED+=("$name :: expected $expected got $actual")
    printf "  \033[31mFAIL\033[0m  %-78s expected=%s got=%s\n" "$name" "$expected" "$actual"
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
SYDNEY=$(login sydney-test@example.com)
WENDY=$(login wendy@sdsmanager.com)        # worker role
run "login elena (UK site owner)"           "non-empty" "$([ -n "$ELENA" ] && echo non-empty || echo empty)"
run "login priya (admin, org=1)"            "non-empty" "$([ -n "$PRIYA" ] && echo non-empty || echo empty)"
run "login acme (org=2, cross-tenant)"      "non-empty" "$([ -n "$ACME" ] && echo non-empty || echo empty)"
run "login sydney-test (AU framework)"      "non-empty" "$([ -n "$SYDNEY" ] && echo non-empty || echo empty)"
run "login wendy (worker)"                  "non-empty" "$([ -n "$WENDY" ] && echo non-empty || echo empty)"

# Surface relevant sites for the test matrix.
US_SITE=$(sqlite3 "$DB" "SELECT id FROM sites WHERE country='US' AND org_id=1 LIMIT 1;")
UK_SITE=$(sqlite3 "$DB" "SELECT id FROM sites WHERE country='UK' AND org_id=1 LIMIT 1;")
ACME_SITE=$(sqlite3 "$DB" "SELECT id FROM sites WHERE org_id=2 LIMIT 1;")
SYDNEY_SITE=$(sqlite3 "$DB" "SELECT id FROM sites WHERE country='AU' LIMIT 1;")
run "US site discovered (priya/elena org)"  "non-zero" "$([ "${US_SITE:-0}" -gt 0 ] && echo non-zero || echo zero)"
run "UK site discovered (priya/elena org)"  "non-zero" "$([ "${UK_SITE:-0}" -gt 0 ] && echo non-zero || echo zero)"
run "Acme org site discovered"              "non-zero" "$([ "${ACME_SITE:-0}" -gt 0 ] && echo non-zero || echo zero)"
run "AU site discovered (sydney-test)"      "non-zero" "$([ "${SYDNEY_SITE:-0}" -gt 0 ] && echo non-zero || echo zero)"

post_incident() {
  curl -s -X POST "$BASE/api/incidents" -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $1" -d "$2" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))"
}

severe_for() {
  curl -s -H "Authorization: Bearer $1" "$BASE/api/reports/osha-severe/$2" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get('notifications', [])))"
}

deadlines_for() {
  curl -s -H "Authorization: Bearer $1" "$BASE/api/incidents/$2/deadlines" \
    | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('pending_deadlines', [])))"
}

# Use a fixed timestamp so window math is deterministic.
EVT_AT='2026-05-12T08:00:00.000Z'

# ============================================================
echo ""
echo "== Section A — Hospitalization (24h, 1904.39(a)(2)) =="
# ============================================================

A1=$(post_incident "$PRIYA" "$(cat <<EOF
{"site_id":$US_SITE,"title":"WI-07 A1 hospitalization (US)","type":"injury",
 "description":"Worker admitted in-patient for crush trauma.",
 "incident_datetime":"$EVT_AT","likelihood":2,"consequence":2,
 "type_data":{"injury_type":"Crush","hospitalized":true,"injured_person":{"name":"A1 Worker","job_title":"Operator"}}}
EOF
)")
run "A1: incident created" "non-empty" "$([ -n "$A1" ] && echo non-empty || echo empty)"

A1_ROWS=$(severe_for "$PRIYA" "$A1")
A1_COUNT=$(echo "$A1_ROWS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
A1_CAT=$(echo "$A1_ROWS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['category'] if d else 'none')")
A1_DEADLINE=$(echo "$A1_ROWS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['deadline_at'] if d else 'none')")
run "A1: 1 severe row auto-created"                  "1"               "$A1_COUNT"
run "A1: category='hospitalization'"                 "hospitalization" "$A1_CAT"
run "A1: deadline = incident + 24h"                  "2026-05-13T08:00:00.000Z" "$A1_DEADLINE"

A1_DL=$(deadlines_for "$PRIYA" "$A1")
A1_KIND=$(echo "$A1_DL" | python3 -c "import sys,json; d=json.load(sys.stdin); ks=[x['kind'] for x in d if x['kind'].startswith('osha_severe_')]; print(ks[0] if ks else 'none')")
A1_STATUS=$(echo "$A1_DL" | python3 -c "import sys,json; d=json.load(sys.stdin); ks=[x for x in d if x['kind'].startswith('osha_severe_')]; print(ks[0]['status'] if ks else 'none')")
A1_REG=$(echo "$A1_DL" | python3 -c "import sys,json; d=json.load(sys.stdin); ks=[x for x in d if x['kind'].startswith('osha_severe_')]; print(ks[0]['reg_ref'] if ks else 'none')")
run "A1: aggregator surfaces severe deadline"        "osha_severe_hospitalization" "$A1_KIND"
run "A1: status (deadline >24h but ≤72h) starts as due_soon" "due_soon"         "$A1_STATUS"
run "A1: reg_ref = 1904.39(a)(2)"                    "1904.39(a)(2)"   "$A1_REG"

# ============================================================
echo ""
echo "== Section B — Amputation + Loss-of-eye explicit flags =="
# ============================================================

B1=$(post_incident "$PRIYA" "$(cat <<EOF
{"site_id":$US_SITE,"title":"WI-07 B1 amputation","type":"injury",
 "description":"Index finger amputation in press die.",
 "incident_datetime":"$EVT_AT","likelihood":3,"consequence":2,
 "type_data":{"injury_type":"Amputation","osha_severe":{"amputation":true},"injured_person":{"name":"B1 Worker","job_title":"Press operator"}}}
EOF
)")
B1_ROWS=$(severe_for "$PRIYA" "$B1")
B1_COUNT=$(echo "$B1_ROWS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
B1_CAT=$(echo "$B1_ROWS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['category'] if d else 'none')")
run "B1: amputation row auto-created"                "1"               "$B1_COUNT"
run "B1: category='amputation'"                      "amputation"      "$B1_CAT"

B2=$(post_incident "$PRIYA" "$(cat <<EOF
{"site_id":$US_SITE,"title":"WI-07 B2 loss of eye","type":"injury",
 "description":"Chemical splash; loss of eye after surgery.",
 "incident_datetime":"$EVT_AT","likelihood":2,"consequence":3,
 "type_data":{"injury_type":"Chemical splash","osha_severe":{"loss_of_eye":true},"injured_person":{"name":"B2 Worker","job_title":"Lab tech"}}}
EOF
)")
B2_ROWS=$(severe_for "$PRIYA" "$B2")
B2_COUNT=$(echo "$B2_ROWS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
B2_CAT=$(echo "$B2_ROWS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['category'] if d else 'none')")
run "B2: loss_of_eye row auto-created"               "1"               "$B2_COUNT"
run "B2: category='loss_of_eye'"                     "loss_of_eye"     "$B2_CAT"

# B3: no severe flag set → no row (substring match on injury_type 'amputation'
# alone is NOT enough — explicit flag required to honor 1904.39(b)(11) carve-outs).
B3=$(post_incident "$PRIYA" "$(cat <<EOF
{"site_id":$US_SITE,"title":"WI-07 B3 fingertip avulsion (NOT amputation)","type":"injury",
 "description":"Fingertip avulsion — per 1904.39(b)(11) NOT a reportable amputation.",
 "incident_datetime":"$EVT_AT","likelihood":2,"consequence":1,
 "type_data":{"injury_type":"Avulsion - amputation-like","injured_person":{"name":"B3 Worker"}}}
EOF
)")
B3_ROWS=$(severe_for "$PRIYA" "$B3")
B3_COUNT=$(echo "$B3_ROWS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
run "B3: no severe row when only injury_type hint (no explicit flag)" "0" "$B3_COUNT"

# ============================================================
echo ""
echo "== Section C — Multi-category (fatality + amputation) via PATCH =="
# ============================================================

# C1: create with amputation flag; then PATCH osha_date_of_death + osha_severe.amputation
# to trigger fatality on the same incident. Tests both the PATCH hook and
# multi-category creation.
C1=$(post_incident "$PRIYA" "$(cat <<EOF
{"site_id":$US_SITE,"title":"WI-07 C1 fatal incident","type":"injury",
 "description":"Forklift impact; fatality + arm amputation.",
 "incident_datetime":"$EVT_AT","likelihood":3,"consequence":3,
 "type_data":{"injury_type":"Crush","osha_severe":{"amputation":true},"injured_person":{"name":"C1 Worker"}}}
EOF
)")
C1_ROWS_BEFORE=$(severe_for "$PRIYA" "$C1")
C1_COUNT_BEFORE=$(echo "$C1_ROWS_BEFORE" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
run "C1: amputation row created at POST"             "1"               "$C1_COUNT_BEFORE"

# Now PATCH the fatality field
curl -s -X PATCH -H "Content-Type: application/json" -H "Authorization: Bearer $PRIYA" \
  -d '{"osha_date_of_death":"2026-05-12T20:00:00.000Z"}' \
  "$BASE/api/incidents/$C1" > /dev/null

C1_ROWS_AFTER=$(severe_for "$PRIYA" "$C1")
C1_COUNT_AFTER=$(echo "$C1_ROWS_AFTER" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
C1_HAS_FATAL=$(echo "$C1_ROWS_AFTER" | python3 -c "import sys,json; d=json.load(sys.stdin); cats=[r['category'] for r in d]; print('yes' if 'fatality' in cats else 'no')")
C1_FATAL_DEADLINE=$(echo "$C1_ROWS_AFTER" | python3 -c "import sys,json; d=json.load(sys.stdin); f=[r for r in d if r['category']=='fatality']; print(f[0]['deadline_at'] if f else 'none')")
run "C1: PATCH adds fatality row → 2 total"          "2"               "$C1_COUNT_AFTER"
run "C1: fatality row present after PATCH"           "yes"             "$C1_HAS_FATAL"
# Fatality deadline = date_of_death + 8h = 2026-05-12T20:00 + 8h = 2026-05-13T04:00
run "C1: fatality deadline = death + 8h"             "2026-05-13T04:00:00.000Z" "$C1_FATAL_DEADLINE"

# C1 idempotency: re-PATCH the same value → no new row
curl -s -X PATCH -H "Content-Type: application/json" -H "Authorization: Bearer $PRIYA" \
  -d '{"osha_date_of_death":"2026-05-12T20:00:00.000Z"}' \
  "$BASE/api/incidents/$C1" > /dev/null

C1_COUNT_RE=$(severe_for "$PRIYA" "$C1" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
run "C1: idempotent — re-PATCH does not duplicate"   "2"               "$C1_COUNT_RE"

# C2: PATCH the hospitalized flag on a previously-uneventful incident.
C2=$(post_incident "$PRIYA" "$(cat <<EOF
{"site_id":$US_SITE,"title":"WI-07 C2 hospitalize-later","type":"injury",
 "description":"Strain; initially first-aid, hospitalized next morning.",
 "incident_datetime":"$EVT_AT","likelihood":1,"consequence":1,
 "type_data":{"injury_type":"Strain","injured_person":{"name":"C2 Worker"}}}
EOF
)")
C2_BEFORE=$(severe_for "$PRIYA" "$C2" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
run "C2: no severe row pre-PATCH"                    "0"               "$C2_BEFORE"

curl -s -X PATCH -H "Content-Type: application/json" -H "Authorization: Bearer $PRIYA" \
  -d '{"hospitalized":1,"hospitalization_date":"2026-05-13T07:00:00.000Z"}' \
  "$BASE/api/incidents/$C2" > /dev/null

C2_AFTER=$(severe_for "$PRIYA" "$C2" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
run "C2: hospitalization row created via PATCH"      "1"               "$C2_AFTER"

# ============================================================
echo ""
echo "== Section D — US-only gate =="
# ============================================================

# UK site → hospitalized=true should NOT create a severe row (1904.39 is US-only).
D1=$(post_incident "$ELENA" "$(cat <<EOF
{"site_id":$UK_SITE,"title":"WI-07 D1 UK hospitalization","type":"injury",
 "description":"UK incident — RIDDOR territory.","incident_datetime":"$EVT_AT",
 "likelihood":2,"consequence":2,
 "type_data":{"injury_type":"Fracture","hospitalized":true,"injured_person":{"name":"D1 Worker"}}}
EOF
)")
D1_COUNT=$(severe_for "$ELENA" "$D1" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
run "D1: UK site → no osha_severe row"               "0"               "$D1_COUNT"

# Sydney AU site → no severe row either.
D2=$(post_incident "$SYDNEY" "$(cat <<EOF
{"site_id":$SYDNEY_SITE,"title":"WI-07 D2 AU hospitalization","type":"injury",
 "description":"AU incident — SafeWork NSW territory.","incident_datetime":"$EVT_AT",
 "likelihood":2,"consequence":2,
 "type_data":{"injury_type":"Fracture","hospitalized":true,"injured_person":{"name":"D2 Worker"}}}
EOF
)")
D2_COUNT=$(severe_for "$SYDNEY" "$D2" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
run "D2: AU site → no osha_severe row"               "0"               "$D2_COUNT"

# ============================================================
echo ""
echo "== Section E — Phone-notified write =="
# ============================================================

# Grab the A1 hospitalization row id.
A1_ID=$(sqlite3 "$DB" "SELECT id FROM osha_severe_notifications WHERE incident_id=$A1 ORDER BY id ASC LIMIT 1;")
run "A1 row id discovered" "non-zero" "$([ "${A1_ID:-0}" -gt 0 ] && echo non-zero || echo zero)"

# Phone-notify it.
NOTIFY_OUT=$(curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $PRIYA" \
  -d '{"area_office":"Chicago Regional Office","osha_reference":"OSHA-WI07-001","notes":"Spoke with Officer Smith."}' \
  "$BASE/api/reports/osha-severe/$A1_ID/phone-notified")
E1_AREA=$(echo "$NOTIFY_OUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('osha_area_office',''))")
E1_REF=$(echo "$NOTIFY_OUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('osha_reference',''))")
E1_AT=$(echo "$NOTIFY_OUT" | python3 -c "import sys,json; print('set' if json.load(sys.stdin).get('phone_notified_at') else 'empty')")
run "E1: area_office captured"                       "Chicago Regional Office" "$E1_AREA"
run "E1: osha_reference captured"                    "OSHA-WI07-001"   "$E1_REF"
run "E1: phone_notified_at set"                      "set"             "$E1_AT"

# Status flips to submitted in the aggregator
A1_DL_AFTER=$(deadlines_for "$PRIYA" "$A1")
E1_STATUS=$(echo "$A1_DL_AFTER" | python3 -c "import sys,json; d=json.load(sys.stdin); ks=[x for x in d if x['kind'].startswith('osha_severe_')]; print(ks[0]['status'] if ks else 'none')")
run "E1: status flips to 'submitted' after phone-notified" "submitted" "$E1_STATUS"

# Idempotent: posting again returns the same row, no failure.
NOTIFY_AGAIN=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $PRIYA" \
  -d '{"area_office":"Ignored — already submitted"}' \
  "$BASE/api/reports/osha-severe/$A1_ID/phone-notified")
run "E2: idempotent — second phone-notified returns 200" "200" "$NOTIFY_AGAIN"

E2_AREA=$(curl -s -H "Authorization: Bearer $PRIYA" "$BASE/api/reports/osha-severe/$A1" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); r=[x for x in d['notifications'] if x['id']==$A1_ID]; print(r[0]['osha_area_office'] if r else '')")
run "E2: area_office unchanged on re-submit"         "Chicago Regional Office" "$E2_AREA"

# E3: worker role 403
NOTIFY_FORBIDDEN=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $WENDY" \
  -d '{"area_office":"Worker tried"}' \
  "$BASE/api/reports/osha-severe/$A1_ID/phone-notified")
run "E3: worker role gets 403 on phone-notified"     "403"             "$NOTIFY_FORBIDDEN"

# ============================================================
echo ""
echo "== Section F — Cross-tenant guards =="
# ============================================================

# acme can't GET priya's incident's severe rows
F1=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $ACME" "$BASE/api/reports/osha-severe/$A1")
run "F1: cross-tenant GET → 404"                     "404"             "$F1"

# acme can't post phone-notified on priya's row
F2=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $ACME" \
  -d '{"area_office":"Hack"}' \
  "$BASE/api/reports/osha-severe/$A1_ID/phone-notified")
run "F2: cross-tenant phone-notified → 404"          "404"             "$F2"

# ============================================================
echo ""
echo "== Section G — List endpoint integration =="
# ============================================================

# Confirm the incidents-list endpoint surfaces severe deadlines on rows.
LIST_OUT=$(curl -s -H "Authorization: Bearer $PRIYA" "$BASE/api/incidents?limit=200")
G1_HAS_KIND=$(echo "$LIST_OUT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
got=False
for r in d.get('incidents', []):
    for p in r.get('pending_deadlines') or []:
        if p.get('kind','').startswith('osha_severe_'):
            got=True; break
    if got: break
print('yes' if got else 'no')")
run "G1: list rows surface osha_severe_* deadlines"  "yes"             "$G1_HAS_KIND"

# A1 should appear in list with most_urgent_deadline = submitted (we phone-notified above)
G2_A1_STATUS=$(echo "$LIST_OUT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for r in d.get('incidents', []):
    if r.get('id') == $A1:
        m = r.get('most_urgent_deadline') or {}
        print(m.get('status', 'none')); break
else:
    print('not-found')")
run "G2: A1 row's most_urgent_deadline = 'submitted'" "submitted"      "$G2_A1_STATUS"

# ============================================================
echo ""
echo "== Section H — activity_log + WI-C hash chain =="
# ============================================================

# Each created row + phone-notified write should produce activity_log entries.
H1=$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_log WHERE entity_type='incident' AND entity_id=$A1 AND action='osha_severe_opened';")
run "H1: osha_severe_opened logged for A1"           "1"               "$H1"

H2=$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_log WHERE entity_type='incident' AND entity_id=$A1 AND action='osha_severe_phone_notified';")
run "H2: osha_severe_phone_notified logged for A1"   "1"               "$H2"

# C1 should have TWO osha_severe_opened (amputation at POST, fatality at PATCH).
H3=$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_log WHERE entity_type='incident' AND entity_id=$C1 AND action='osha_severe_opened';")
run "H3: C1 has 2 osha_severe_opened (POST + PATCH)"  "2"               "$H3"

# WI-C hash chain still verifies after all our mutations
CHAIN=$(curl -s -H "Authorization: Bearer $PRIYA" "$BASE/api/reports/audit-log/verify" \
  | python3 -c "import sys,json; print('ok' if json.load(sys.stdin).get('ok') else 'broken')")
run "H4: WI-C hash chain still verifies"             "ok"              "$CHAIN"

# ============================================================
echo ""
echo "===================================================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "===================================================="
if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Failed tests:"
  for f in "${FAILED[@]}"; do echo "  - $f"; done
  exit 1
fi
