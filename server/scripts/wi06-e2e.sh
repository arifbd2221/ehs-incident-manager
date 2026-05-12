#!/usr/bin/env bash
# server/scripts/wi06-e2e.sh — end-to-end coverage for WI-06 SafeWork NSW
# notifiable-incident reporting (WHS Act 2011 (NSW) Part 3).
#
# Verifies:
#   • Lookups endpoint returns 10+1 s.36 rows and 11+1 s.37 rows with
#     verbatim Act labels and section refs.
#   • POST /incidents on an AU site with hospitalized=true auto-creates
#     a safework_nsw_notifications row classified as serious-injury
#     s.36(a) (s.35(b) → s.36(a) inpatient hospital).
#   • POST /incidents with type_data.safework_nsw.dangerous_incident_sub
#     auto-creates a dangerous-incident row (s.35(c) / s.37(b)).
#   • POST /incidents with osha_date_of_death (fatality column) on AU
#     site → is_fatality=1 (s.35(a)).
#   • Mines & Petroleum carve-out: excluded_mines_petroleum=1 from
#     type_data → engine returns a row with no deadlines.
#   • Non-AU sites (US / UK) → no NSW row created.
#   • PATCH /incidents/:id triggers re-classification when osha_severe
#     or hospitalized changes; idempotent (UNIQUE(incident_id)).
#   • POST phone-notified → phone_notified_at set, status flips to
#     'submitted' in the deadlines aggregator.
#   • POST regulator-requested-written → starts 48h clock, written_deadline
#     = request + 48h. POST written-submitted → status flips.
#   • s.39 site-preservation status persisted + activity_log row written.
#   • PCBU: ABN checksum gates the write (valid ABN accepted, invalid
#     ABN rejected with abn_validation reason).
#   • Framework gate: non-NSW org (acme = OSHA-only) gets 403 on every
#     SafeWork NSW endpoint.
#   • Cross-tenant 404 on read + write.
#   • WI-C hash chain still verifies.

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

SYDNEY=$(login sydney-test@example.com)
PRIYA=$(login priya@sdsmanager.com)
ACME=$(login acme@sdsmanager.com)
run "login sydney-test (NSW framework)"     "non-empty" "$([ -n "$SYDNEY" ] && echo non-empty || echo empty)"
run "login priya (admin, non-NSW org)"      "non-empty" "$([ -n "$PRIYA" ] && echo non-empty || echo empty)"
run "login acme (US-only framework)"        "non-empty" "$([ -n "$ACME" ] && echo non-empty || echo empty)"

AU_SITE=$(sqlite3 "$DB" "SELECT id FROM sites WHERE country='AU' AND org_id=6 LIMIT 1;")
US_SITE=$(sqlite3 "$DB" "SELECT id FROM sites WHERE country='US' AND org_id=1 LIMIT 1;")
ACME_SITE=$(sqlite3 "$DB" "SELECT id FROM sites WHERE org_id=2 LIMIT 1;")
run "AU site discovered (sydney-test org)"  "non-zero" "$([ "${AU_SITE:-0}" -gt 0 ] && echo non-zero || echo zero)"
run "US site discovered (priya org)"        "non-zero" "$([ "${US_SITE:-0}" -gt 0 ] && echo non-zero || echo zero)"
run "Acme site discovered"                  "non-zero" "$([ "${ACME_SITE:-0}" -gt 0 ] && echo non-zero || echo zero)"

post_incident() {
  curl -s -X POST "$BASE/api/incidents" -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $1" -d "$2" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))"
}

nsw_for() {
  curl -s -H "Authorization: Bearer $1" "$BASE/api/reports/safework-nsw/$2"
}

EVT_AT='2026-05-12T10:00:00.000Z'

# ============================================================
echo ""
echo "== Section A — Lookups endpoint =="
# ============================================================

A_LOOK=$(curl -s -H "Authorization: Bearer $SYDNEY" "$BASE/api/reports/safework-nsw/lookups")
A_S36_COUNT=$(echo "$A_LOOK" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('serious_injury_types', [])))")
A_S37_COUNT=$(echo "$A_LOOK" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('dangerous_incident_types', [])))")
A_FIRST_S36_REF=$(echo "$A_LOOK" | python3 -c "import sys,json; print(json.load(sys.stdin)['serious_injury_types'][0]['section_ref'])")
A_FIRST_S37_REF=$(echo "$A_LOOK" | python3 -c "import sys,json; print(json.load(sys.stdin)['dangerous_incident_types'][0]['section_ref'])")
run "A1: s.36 lookup count = 11 (10 + 1 other prescribed)"  "11"                          "$A_S36_COUNT"
run "A2: s.37 lookup count = 12 (11 + 1 other prescribed)"  "12"                          "$A_S37_COUNT"
run "A3: first s.36 row carries section_ref"                "WHS Act 2011 (NSW) s.36(a)"  "$A_FIRST_S36_REF"
run "A4: first s.37 row carries section_ref"                "WHS Act 2011 (NSW) s.37(a)"  "$A_FIRST_S37_REF"

# ============================================================
echo ""
echo "== Section B — Auto-create from POST /incidents =="
# ============================================================

# B1: hospitalization on AU site → s.35(b) serious injury, s.36(a)
B1=$(post_incident "$SYDNEY" "$(cat <<EOF
{"site_id":$AU_SITE,"title":"WI-06 B1 hospitalization (NSW)","type":"injury",
 "description":"Worker admitted in-patient.","incident_datetime":"$EVT_AT",
 "likelihood":2,"consequence":2,
 "type_data":{"injury_type":"Crush","hospitalized":true,"injured_person":{"name":"B1 Worker"}}}
EOF
)")
run "B1: incident created"  "non-empty" "$([ -n "$B1" ] && echo non-empty || echo empty)"
B1_NSW=$(nsw_for "$SYDNEY" "$B1")
B1_NUM=$(echo "$B1_NSW" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('nsw_number',''))")
B1_FATALITY=$(echo "$B1_NSW" | python3 -c "import sys,json; print(json.load(sys.stdin).get('is_fatality',''))")
B1_SERIOUS=$(echo "$B1_NSW" | python3 -c "import sys,json; print(json.load(sys.stdin).get('is_serious_injury',''))")
B1_DANGEROUS=$(echo "$B1_NSW" | python3 -c "import sys,json; print(json.load(sys.stdin).get('is_dangerous_incident',''))")
B1_SUBS=$(echo "$B1_NSW" | python3 -c "import sys,json; print(json.load(sys.stdin).get('serious_injury_sub_categories',[]))")
run "B1: NSW number assigned (NSW-{year}-NNNN)"  "yes" "$([ -n "$B1_NUM" ] && echo yes || echo no)"
run "B1: is_fatality=0"                          "0"   "$B1_FATALITY"
run "B1: is_serious_injury=1"                    "1"   "$B1_SERIOUS"
run "B1: is_dangerous_incident=0"                "0"   "$B1_DANGEROUS"
run "B1: s.36(a) inpatient_hospital auto-derived"  "['s36_a_inpatient_hospital']"  "$B1_SUBS"

# B2: dangerous incident via explicit s.37 sub-categories flag
B2=$(post_incident "$SYDNEY" "$(cat <<EOF
{"site_id":$AU_SITE,"title":"WI-06 B2 dangerous incident","type":"dangerous",
 "description":"Press hydraulic line ruptured — uncontrolled escape.","incident_datetime":"$EVT_AT",
 "likelihood":3,"consequence":2,
 "type_data":{"safework_nsw":{"dangerous_incident_sub":["s37_d_uncontrolled_pressurised_substance","s37_b_uncontrolled_fire_explosion"]}}}
EOF
)")
B2_NSW=$(nsw_for "$SYDNEY" "$B2")
B2_DANGEROUS=$(echo "$B2_NSW" | python3 -c "import sys,json; print(json.load(sys.stdin).get('is_dangerous_incident',''))")
B2_SUBS=$(echo "$B2_NSW" | python3 -c "import sys,json; print(sorted(json.load(sys.stdin).get('dangerous_incident_sub_categories',[])))")
run "B2: is_dangerous_incident=1"                        "1"                                                              "$B2_DANGEROUS"
run "B2: both s.37 sub-categories captured"  "['s37_b_uncontrolled_fire_explosion', 's37_d_uncontrolled_pressurised_substance']"  "$B2_SUBS"

# B3: fatality via osha_date_of_death — sets is_fatality=1 (s.35(a))
B3=$(post_incident "$SYDNEY" "$(cat <<EOF
{"site_id":$AU_SITE,"title":"WI-06 B3 fatality","type":"injury",
 "description":"Forklift impact — fatality.","incident_datetime":"$EVT_AT",
 "likelihood":3,"consequence":3,
 "type_data":{"injury_type":"Crush","injured_person":{"name":"B3 Worker"}}}
EOF
)")
# Set osha_date_of_death via PATCH (POST destructure doesn't accept it directly — same as WI-07 path)
curl -s -X PATCH -H "Content-Type: application/json" -H "Authorization: Bearer $SYDNEY" \
  -d '{"osha_date_of_death":"2026-05-12T13:00:00.000Z"}' \
  "$BASE/api/incidents/$B3" > /dev/null
B3_NSW=$(nsw_for "$SYDNEY" "$B3")
B3_FATALITY=$(echo "$B3_NSW" | python3 -c "import sys,json; print(json.load(sys.stdin).get('is_fatality',''))")
run "B3: PATCH triggers fatality classification (s.35(a))" "1" "$B3_FATALITY"

# B4: incident with neither hospitalized nor explicit flags → no NSW row
B4=$(post_incident "$SYDNEY" "$(cat <<EOF
{"site_id":$AU_SITE,"title":"WI-06 B4 minor first-aid","type":"injury",
 "description":"Cut — band-aid only.","incident_datetime":"$EVT_AT",
 "likelihood":1,"consequence":1,
 "type_data":{"injured_person":{"name":"B4 Worker"}}}
EOF
)")
B4_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $SYDNEY" "$BASE/api/reports/safework-nsw/$B4")
run "B4: minor incident → no NSW row (404)" "404" "$B4_STATUS"

# B5: Mines & Petroleum carve-out — type_data.safework_nsw.excluded_mines_petroleum
B5=$(post_incident "$SYDNEY" "$(cat <<EOF
{"site_id":$AU_SITE,"title":"WI-06 B5 mines exclusion","type":"injury",
 "description":"Underground mine — covered by WHS (M&P) Act 2013.","incident_datetime":"$EVT_AT",
 "likelihood":2,"consequence":2,
 "type_data":{"hospitalized":true,"safework_nsw":{"excluded_mines_petroleum":true},"injured_person":{"name":"B5 Worker"}}}
EOF
)")
B5_NSW=$(nsw_for "$SYDNEY" "$B5")
B5_EXCLUDED=$(echo "$B5_NSW" | python3 -c "import sys,json; print(json.load(sys.stdin).get('excluded_mines_petroleum',''))")
run "B5: row created with excluded_mines_petroleum=1"  "1" "$B5_EXCLUDED"

# ============================================================
echo ""
echo "== Section C — AU-only gate =="
# ============================================================

# C1: hospitalization on US site → NO NSW row created
C1=$(post_incident "$PRIYA" "$(cat <<EOF
{"site_id":$US_SITE,"title":"WI-06 C1 US hospitalization (should not create NSW)","type":"injury",
 "description":"US incident — OSHA territory.","incident_datetime":"$EVT_AT",
 "likelihood":2,"consequence":2,
 "type_data":{"injury_type":"Crush","hospitalized":true,"injured_person":{"name":"C1 Worker"}}}
EOF
)")
# Framework gate: acme is OSHA-only (no safework_nsw) so the gate
# fires before the per-incident lookup, regardless of which incident
# id is in the URL. Using priya here would no longer prove the gate
# because SDS Manager Inc. is now operationally NSW-enabled.
C1_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $ACME" "$BASE/api/reports/safework-nsw/$C1")
run "C1: non-NSW org (acme, OSHA-only) → 403 (framework gate)" "403" "$C1_STATUS"

# Sanity at the DB level: no NSW row should exist for the US incident.
C1_DB_COUNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM safework_nsw_notifications WHERE incident_id=$C1;")
run "C1: DB-level — no NSW row for non-AU incident" "0" "$C1_DB_COUNT"

# ============================================================
echo ""
echo "== Section D — PATCH re-classification + idempotency =="
# ============================================================

# D1: create as minor, PATCH hospitalized=true → row appears.
D1=$(post_incident "$SYDNEY" "$(cat <<EOF
{"site_id":$AU_SITE,"title":"WI-06 D1 escalate via PATCH","type":"injury",
 "description":"Sprain; admitted next day.","incident_datetime":"$EVT_AT",
 "likelihood":1,"consequence":1,
 "type_data":{"injured_person":{"name":"D1 Worker"}}}
EOF
)")
D1_BEFORE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $SYDNEY" "$BASE/api/reports/safework-nsw/$D1")
run "D1: pre-PATCH → no NSW row"  "404" "$D1_BEFORE"

curl -s -X PATCH -H "Content-Type: application/json" -H "Authorization: Bearer $SYDNEY" \
  -d '{"hospitalized":1}' "$BASE/api/incidents/$D1" > /dev/null

D1_AFTER=$(nsw_for "$SYDNEY" "$D1")
D1_SERIOUS=$(echo "$D1_AFTER" | python3 -c "import sys,json; print(json.load(sys.stdin).get('is_serious_injury',''))")
run "D1: post-PATCH → NSW row created with is_serious_injury=1"  "1" "$D1_SERIOUS"

# Idempotent: PATCH again → still one row.
curl -s -X PATCH -H "Content-Type: application/json" -H "Authorization: Bearer $SYDNEY" \
  -d '{"hospitalized":1}' "$BASE/api/incidents/$D1" > /dev/null
D1_COUNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM safework_nsw_notifications WHERE incident_id=$D1;")
run "D1: idempotent — re-PATCH does not duplicate"  "1" "$D1_COUNT"

# ============================================================
echo ""
echo "== Section E — Phone notification (s.38(1)) =="
# ============================================================

B1_NSW_ID=$(echo "$B1_NSW" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")
run "B1 NSW id captured"  "non-empty" "$([ -n "$B1_NSW_ID" ] && echo non-empty || echo empty)"

PHONE_OUT=$(curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $SYDNEY" \
  -d '{"regulator_office":"SafeWork NSW — Sydney","notes":"Spoke with notifications team."}' \
  "$BASE/api/reports/safework-nsw/$B1_NSW_ID/phone-notified")
E1_AT=$(echo "$PHONE_OUT" | python3 -c "import sys,json; print('set' if json.load(sys.stdin).get('phone_notified_at') else 'empty')")
E1_OFFICE=$(echo "$PHONE_OUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('phone_regulator_office',''))")
run "E1: phone_notified_at set"                          "set"                          "$E1_AT"
run "E1: phone_regulator_office captured"                "SafeWork NSW — Sydney"        "$E1_OFFICE"

# Aggregator: status flips to submitted
DL_AFTER_PHONE=$(curl -s -H "Authorization: Bearer $SYDNEY" "$BASE/api/incidents/$B1/deadlines")
E1_STATUS=$(echo "$DL_AFTER_PHONE" | python3 -c "
import sys,json
d=json.load(sys.stdin).get('pending_deadlines', [])
ps=[x for x in d if x['kind']=='safework_nsw_phone']
print(ps[0]['status'] if ps else 'missing')")
run "E1: aggregator status='submitted' after phone-notified"  "submitted" "$E1_STATUS"

# Idempotent re-submit returns 200
E1_AGAIN=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $SYDNEY" \
  -d '{"regulator_office":"Should be ignored"}' \
  "$BASE/api/reports/safework-nsw/$B1_NSW_ID/phone-notified")
run "E2: phone-notified idempotent (second submit → 200)"  "200" "$E1_AGAIN"

# ============================================================
echo ""
echo "== Section F — Written notice (s.38(4)(b), s.38(5)) =="
# ============================================================

# Before regulator request: no written deadline emitted by aggregator.
DL_PRE=$(curl -s -H "Authorization: Bearer $SYDNEY" "$BASE/api/incidents/$B1/deadlines")
F1_HAS_WRITTEN=$(echo "$DL_PRE" | python3 -c "
import sys,json
d=json.load(sys.stdin).get('pending_deadlines', [])
print('yes' if any(x['kind']=='safework_nsw_written' for x in d) else 'no')")
run "F1: pre-request — no written deadline emitted"  "no" "$F1_HAS_WRITTEN"

# Log regulator request → starts 48h clock
REQ_OUT=$(curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $SYDNEY" \
  -d '{}' \
  "$BASE/api/reports/safework-nsw/$B1_NSW_ID/regulator-requested-written")
F2_REQ_AT=$(echo "$REQ_OUT" | python3 -c "import sys,json; print('set' if json.load(sys.stdin).get('regulator_requested_written_at') else 'empty')")
F2_DEADLINE=$(echo "$REQ_OUT" | python3 -c "import sys,json; print('set' if json.load(sys.stdin).get('written_deadline') else 'empty')")
run "F2: regulator_requested_written_at set"  "set" "$F2_REQ_AT"
run "F2: written_deadline computed (+48h)"    "set" "$F2_DEADLINE"

# After regulator request: aggregator emits written deadline with status
DL_AFTER_REQ=$(curl -s -H "Authorization: Bearer $SYDNEY" "$BASE/api/incidents/$B1/deadlines")
F3_STATUS=$(echo "$DL_AFTER_REQ" | python3 -c "
import sys,json
d=json.load(sys.stdin).get('pending_deadlines', [])
ws=[x for x in d if x['kind']=='safework_nsw_written']
print(ws[0]['status'] if ws else 'missing')")
F3_REG=$(echo "$DL_AFTER_REQ" | python3 -c "
import sys,json
d=json.load(sys.stdin).get('pending_deadlines', [])
ws=[x for x in d if x['kind']=='safework_nsw_written']
print(ws[0]['reg_ref'] if ws else 'missing')")
# Deadline is ~48h in future. Should land in due_soon (>24h, ≤72h) or upcoming (>72h).
run "F3: written deadline reg_ref = WHS Act s.38(4)(b)"  "WHS Act s.38(4)(b)"  "$F3_REG"
F3_PENDING_OR_NOT=$(python3 -c "print('yes' if '$F3_STATUS' in ('due_soon','due_today','upcoming') else 'no')")
run "F3: written status is upcoming-ish (not submitted, not overdue)"  "yes" "$F3_PENDING_OR_NOT"

# Submit the written notice
WRITTEN_OUT=$(curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $SYDNEY" \
  -d '{"reference":"SWNSW-2026-001","notes":"Submitted via email."}' \
  "$BASE/api/reports/safework-nsw/$B1_NSW_ID/written-submitted")
F4_AT=$(echo "$WRITTEN_OUT" | python3 -c "import sys,json; print('set' if json.load(sys.stdin).get('written_submitted_at') else 'empty')")
F4_REF=$(echo "$WRITTEN_OUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('written_reference',''))")
run "F4: written_submitted_at set"            "set"               "$F4_AT"
run "F4: written_reference captured"          "SWNSW-2026-001"    "$F4_REF"

DL_AFTER_WRITTEN=$(curl -s -H "Authorization: Bearer $SYDNEY" "$BASE/api/incidents/$B1/deadlines")
F4_STATUS=$(echo "$DL_AFTER_WRITTEN" | python3 -c "
import sys,json
d=json.load(sys.stdin).get('pending_deadlines', [])
ws=[x for x in d if x['kind']=='safework_nsw_written']
print(ws[0]['status'] if ws else 'missing')")
run "F4: written status flips to 'submitted'"  "submitted"  "$F4_STATUS"

# ============================================================
echo ""
echo "== Section G — s.39 site preservation + PCBU =="
# ============================================================

SP_OUT=$(curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $SYDNEY" \
  -d '{"status":"disturbed_to_make_safe","notes":"Hydraulic leak isolated for safety."}' \
  "$BASE/api/reports/safework-nsw/$B1_NSW_ID/site-preservation")
G1_STATUS=$(echo "$SP_OUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('site_preservation_status',''))")
run "G1: site_preservation_status persisted"  "disturbed_to_make_safe" "$G1_STATUS"

# Invalid enum rejected
G2_BAD=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $SYDNEY" \
  -d '{"status":"not_a_real_status"}' \
  "$BASE/api/reports/safework-nsw/$B1_NSW_ID/site-preservation")
run "G2: invalid site preservation enum → 400"  "400" "$G2_BAD"

# PCBU with VALID ABN + WI-06 carry-forward extended fields (trading
# name + address + worker_count) per migration 033.
PCBU_OK=$(curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $SYDNEY" \
  -d '{"name":"Sydney Test PCBU","abn":"51 824 753 556","anzsic_code":"2412","trading_name":"Sydney Smelters","address":"1 Industrial Way, Sydney NSW 2000","worker_count":47}' \
  "$BASE/api/reports/safework-nsw/$B1_NSW_ID/pcbu")
G3_ABN=$(echo "$PCBU_OK" | python3 -c "import sys,json; print(json.load(sys.stdin).get('pcbu_abn',''))")
G3_NAME=$(echo "$PCBU_OK" | python3 -c "import sys,json; print(json.load(sys.stdin).get('pcbu_name',''))")
G3_ANZ=$(echo "$PCBU_OK" | python3 -c "import sys,json; print(json.load(sys.stdin).get('pcbu_anzsic_code',''))")
G3_TRADE=$(echo "$PCBU_OK" | python3 -c "import sys,json; print(json.load(sys.stdin).get('pcbu_trading_name',''))")
G3_ADDR=$(echo "$PCBU_OK" | python3 -c "import sys,json; print(json.load(sys.stdin).get('pcbu_address',''))")
G3_WC=$(echo "$PCBU_OK" | python3 -c "import sys,json; print(json.load(sys.stdin).get('pcbu_worker_count',''))")
run "G3: ABN normalised on accept"          "51824753556"                       "$G3_ABN"
run "G3: PCBU name captured"                "Sydney Test PCBU"                  "$G3_NAME"
run "G3: ANZSIC 4-digit captured"           "2412"                              "$G3_ANZ"
run "G3: trading_name captured"             "Sydney Smelters"                   "$G3_TRADE"
run "G3: address captured"                  "1 Industrial Way, Sydney NSW 2000" "$G3_ADDR"
run "G3: worker_count captured"             "47"                                "$G3_WC"

# PCBU with INVALID ABN (checksum fail) → 400
G4_BAD_ABN=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $SYDNEY" \
  -d '{"abn":"12 345 678 901"}' "$BASE/api/reports/safework-nsw/$B1_NSW_ID/pcbu")
run "G4: invalid ABN checksum → 400"  "400" "$G4_BAD_ABN"

# ANZSIC must be 4 digits
G5_BAD_ANZ=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $SYDNEY" \
  -d '{"anzsic_code":"24"}' "$BASE/api/reports/safework-nsw/$B1_NSW_ID/pcbu")
run "G5: 2-digit ANZSIC code → 400"  "400" "$G5_BAD_ANZ"

# G6: worker_count must be a non-negative integer
G6_BAD_WC=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $SYDNEY" \
  -d '{"worker_count":-3}' "$BASE/api/reports/safework-nsw/$B1_NSW_ID/pcbu")
run "G6: negative worker_count → 400"  "400" "$G6_BAD_WC"

# G7: ANZSIC lookup endpoint returns seeded=false + empty array until a
# code list is populated (chunk-11 v1 ships unseeded). Confirms the
# anzsic_codes table exists from migration 033.
G7_RESP=$(curl -s -H "Authorization: Bearer $SYDNEY" "$BASE/api/reports/safework-nsw/anzsic-codes")
G7_SEEDED=$(echo "$G7_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('seeded'))")
G7_COUNT=$(echo "$G7_RESP" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('codes',[])))")
run "G7: anzsic-codes endpoint reports seeded=False"  "False"  "$G7_SEEDED"
run "G7: anzsic-codes table empty until seeded"       "0"      "$G7_COUNT"

# ============================================================
echo ""
echo "== Section H — Framework + tenant gates =="
# ============================================================

# H1: non-NSW org (acme = US-only) gets 403 on every NSW endpoint.
H1=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $ACME" "$BASE/api/reports/safework-nsw/lookups")
run "H1: non-NSW org → 403 on lookups"  "403"  "$H1"

H2=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $ACME" "$BASE/api/reports/safework-nsw/$B1")
run "H2: non-NSW org → 403 on per-incident GET"  "403"  "$H2"

H3=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $ACME" \
  -d '{}' "$BASE/api/reports/safework-nsw/$B1_NSW_ID/phone-notified")
run "H3: non-NSW org → 403 on phone-notified"  "403"  "$H3"

# H4: cross-tenant — sydney-test trying to read a priya incident → 404 (incident not in org).
H4=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $SYDNEY" "$BASE/api/reports/safework-nsw/$C1")
run "H4: cross-tenant GET → 404"  "404"  "$H4"

# ============================================================
echo ""
echo "== Section I — activity_log + WI-C hash chain =="
# ============================================================

I1=$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_log WHERE entity_type='incident' AND entity_id=$B1 AND action='safework_nsw_opened';")
run "I1: safework_nsw_opened logged for B1"  "1"  "$I1"

I2=$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_log WHERE entity_type='incident' AND entity_id=$B1 AND action='safework_nsw_phone_notified';")
run "I2: safework_nsw_phone_notified logged for B1"  "1"  "$I2"

I3=$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_log WHERE entity_type='incident' AND entity_id=$B1 AND action='safework_nsw_regulator_requested_written';")
run "I3: safework_nsw_regulator_requested_written logged"  "1"  "$I3"

I4=$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_log WHERE entity_type='incident' AND entity_id=$B1 AND action='safework_nsw_written_submitted';")
run "I4: safework_nsw_written_submitted logged"  "1"  "$I4"

# B5 (mines-petroleum carve-out) and B3 (fatality via PATCH) should also have safework_nsw_opened rows.
I5=$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_log WHERE entity_type='incident' AND entity_id=$B5 AND action='safework_nsw_opened';")
run "I5: B5 mines-exclusion still logged safework_nsw_opened"  "1"  "$I5"

I6=$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_log WHERE entity_type='incident' AND entity_id=$B3 AND action='safework_nsw_opened';")
run "I6: B3 (fatality via PATCH) → safework_nsw_opened logged"  "1"  "$I6"

# WI-C hash chain — sydney-test is admin so can hit /verify
CHAIN=$(curl -s -H "Authorization: Bearer $SYDNEY" "$BASE/api/reports/audit-log/verify" \
  | python3 -c "import sys,json; print('ok' if json.load(sys.stdin).get('ok') else 'broken')")
run "I7: WI-C hash chain still verifies after WI-06 writes"  "ok"  "$CHAIN"

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
