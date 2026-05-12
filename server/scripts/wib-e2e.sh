#!/usr/bin/env bash
# server/scripts/wib-e2e.sh — full end-to-end coverage for the WI-B
# recordability override approval workflow.
#
# Same pattern as wi04-e2e.sh + wia-regression.sh. Boots from a running
# BE (localhost:3001). Demo accounts:
#   • elena  — ehs_manager (elevated) in SDS Manager Inc. org=1.
#   • priya  — admin (elevated) in SDS Manager Inc. org=1. Used as the
#              alt-decider so the no-self-approval rule kicks in.
#   • wendy  — worker (non-elevated) in SDS Manager Inc. org=1. Drives
#              the 403 case for global-queue + decision endpoints.
#   • acme   — admin in Acme Manufacturing org=2. Cross-tenant 404 case.

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

echo "== Logins =="
ELENA=$(login elena@sdsmanager.com)
PRIYA=$(login priya@sdsmanager.com)
WENDY=$(login wendy@sdsmanager.com)
ACME=$(login acme@sdsmanager.com)
run "login elena (ehs_manager)" "non-empty" "$([ -n "$ELENA" ] && echo non-empty || echo empty)"
run "login priya (admin)"        "non-empty" "$([ -n "$PRIYA" ] && echo non-empty || echo empty)"
run "login wendy (worker)"       "non-empty" "$([ -n "$WENDY" ] && echo non-empty || echo empty)"
run "login acme (cross-tenant)"  "non-empty" "$([ -n "$ACME" ] && echo non-empty || echo empty)"

US_SITE=$(sqlite3 "$DB" "SELECT id FROM sites WHERE country='US' AND org_id=1 LIMIT 1;")
run "US site discovered" "non-zero" "$([ "${US_SITE:-0}" -gt 0 ] && echo non-zero || echo zero)"

# Create a baseline injury incident as elena (US site → OSHA, no RIDDOR).
# We'll set osha_recordable=0 manually via PATCH so the override request
# proposes flipping it to 1.
echo ""
echo "== Setup: create baseline incident =="

INC_RESP=$(curl -s -X POST "$BASE/api/incidents" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ELENA" \
  -d "$(cat <<EOF
{"site_id":$US_SITE,"title":"WI-B baseline injury","type":"injury",
 "description":"Hand laceration in stamping area.",
 "incident_datetime":"2026-05-12T15:00:00","area":"Stamping","likelihood":2,"consequence":2,
 "body_parts_affected":["r_hand"],
 "type_data":{"injury_type":"Laceration","treatments":["Medical treatment"]},
 "affected_persons":[{"name":"WI-B Worker","employment_status":"employee","is_primary":true,"injuries":[{"body_part":"r_hand","injury_type":"Laceration"}]}]}
EOF
)")
INC_ID=$(echo "$INC_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','?'))")
run "incident created"  "non-zero" "$([ -n "$INC_ID" ] && [ "$INC_ID" -gt 0 ] && echo non-zero || echo zero)"

# Force osha_recordable=0 via direct PATCH (elevated allowed). This also
# exercises the new console.warn — we won't assert on stderr here, but
# the BE log will show it.
curl -s -X PATCH "$BASE/api/incidents/$INC_ID" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ELENA" \
  -d '{"osha_recordable":0}' > /dev/null
run "baseline osha_recordable=0" "0" "$(sqlite3 "$DB" "SELECT osha_recordable FROM incidents WHERE id=$INC_ID;")"

echo ""
echo "== Section A — Create override requests =="

# A1: elena creates a request to flip osha_recordable 0→1
REQ_RESP=$(curl -s -X POST "$BASE/api/incidents/$INC_ID/override-requests" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $ELENA" \
  -d '{"field":"osha_recordable","proposed_value":1,"reason":"HCP confirmed medical treatment beyond first aid, days away expected"}')
REQ_ID=$(echo "$REQ_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','?'))")
run "A1: request created"                          "non-zero" "$([ -n "$REQ_ID" ] && [ "$REQ_ID" -gt 0 ] && echo non-zero || echo zero)"
run "A1: request status=pending"                   "pending" "$(sqlite3 "$DB" "SELECT status FROM classification_override_requests WHERE id=$REQ_ID;")"
run "A1: requested_by=elena (1)"                    "1"       "$(sqlite3 "$DB" "SELECT requested_by FROM classification_override_requests WHERE id=$REQ_ID;")"
run "A1: jurisdiction=US-OSHA"                      "US-OSHA" "$(sqlite3 "$DB" "SELECT jurisdiction FROM classification_override_requests WHERE id=$REQ_ID;")"
run "A1: proposed_value=1"                          "1"       "$(sqlite3 "$DB" "SELECT proposed_value FROM classification_override_requests WHERE id=$REQ_ID;")"
run "A1: override_requested audit row"              "1"       "$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_log WHERE entity_type='incident' AND entity_id=$INC_ID AND action='override_requested';")"

# A2: second pending on same field → 409
A2_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/incidents/$INC_ID/override-requests" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $ELENA" \
  -d '{"field":"osha_recordable","proposed_value":1,"reason":"duplicate"}')
run "A2: second pending blocked (409)"             "409" "$A2_CODE"

# A3: request with no reason → 400
A3_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/incidents/$INC_ID/override-requests" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $ELENA" \
  -d '{"field":"riddor_reportable","proposed_value":1}')
run "A3: missing reason → 400"                     "400" "$A3_CODE"

# A4: unknown field → 400
A4_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/incidents/$INC_ID/override-requests" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $ELENA" \
  -d '{"field":"severity","proposed_value":1,"reason":"trying severity"}')
run "A4: non-overridable field → 400"              "400" "$A4_CODE"

# A5: proposed value matches current → 409
A5_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/incidents/$INC_ID/override-requests" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $ELENA" \
  -d '{"field":"riddor_reportable","proposed_value":0,"reason":"already false but trying anyway"}')
run "A5: no-op proposed value → 409"               "409" "$A5_CODE"

# A6: cross-tenant create → 404 (incident not in caller's org)
A6_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/incidents/$INC_ID/override-requests" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $ACME" \
  -d '{"field":"osha_recordable","proposed_value":1,"reason":"acme cross-tenant"}')
run "A6: cross-tenant POST → 404"                  "404" "$A6_CODE"

echo ""
echo "== Section B — List + global queue =="

# B1: list on incident returns the request
B1=$(curl -s -H "Authorization: Bearer $ELENA" "$BASE/api/incidents/$INC_ID/override-requests" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('requests',[])))")
run "B1: incident list count=1"                    "1" "$B1"

# B2: global queue (elena, elevated) — count of pending in org
B2_BEFORE=$(curl -s -H "Authorization: Bearer $ELENA" "$BASE/api/override-requests?status=pending" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(any(r['id']==$REQ_ID for r in d.get('requests',[])))")
run "B2: pending queue contains our request"       "True" "$B2_BEFORE"

# B3: worker (wendy) gets 403 on global queue
B3_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $WENDY" "$BASE/api/override-requests?status=pending")
run "B3: worker → global queue 403"                "403" "$B3_CODE"

# B4: status=approved on the global endpoint → 400 (not supported)
B4_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $ELENA" "$BASE/api/override-requests?status=approved")
run "B4: ?status=approved → 400"                   "400" "$B4_CODE"

# B5: cross-tenant single GET → 404
B5_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $ACME" "$BASE/api/override-requests/$REQ_ID")
run "B5: cross-tenant single GET → 404"            "404" "$B5_CODE"

echo ""
echo "== Section C — Self-approval guard =="

# C1: elena (the requester) tries to approve → 403 (route-level guard)
C1_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/override-requests/$REQ_ID/approve" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $ELENA" -d '{}')
run "C1: self-approve route-blocked → 403"         "403" "$C1_CODE"

# C2: elena tries to reject her own → 403
C2_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/override-requests/$REQ_ID/reject" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $ELENA" -d '{}')
run "C2: self-reject route-blocked → 403"          "403" "$C2_CODE"

# C3: worker (wendy) tries to approve → 403 (not elevated)
C3_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/override-requests/$REQ_ID/approve" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $WENDY" -d '{}')
run "C3: worker approve → 403"                     "403" "$C3_CODE"

# C4: DB-level trigger sanity — try a raw UPDATE setting decided_by = requested_by.
# Expect SQLite to ABORT with the message from migration 026.
TRIG_RES=$(sqlite3 "$DB" "UPDATE classification_override_requests SET decided_by=requested_by, decided_at=datetime('now') WHERE id=$REQ_ID;" 2>&1 || true)
run "C4: DB trigger blocks self-approval UPDATE"   "matched" "$(echo "$TRIG_RES" | grep -q 'requester cannot also be the decider' && echo matched || echo unmatched)"
run "C4: row still pending after blocked UPDATE"   "pending" "$(sqlite3 "$DB" "SELECT status FROM classification_override_requests WHERE id=$REQ_ID;")"

echo ""
echo "== Section D — Approve happy path =="

# D1: priya (admin, different user) approves
D1_RESP=$(curl -s -X POST "$BASE/api/override-requests/$REQ_ID/approve" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $PRIYA" \
  -d '{"decision_note":"HCP records sighted, approving recordable flip."}')
D1_STATUS=$(echo "$D1_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))")
run "D1: approve returns status=approved"          "approved" "$D1_STATUS"
run "D1: incident.osha_recordable flipped to 1"    "1"        "$(sqlite3 "$DB" "SELECT osha_recordable FROM incidents WHERE id=$INC_ID;")"
run "D1: decided_by=priya (13)"                    "13"       "$(sqlite3 "$DB" "SELECT decided_by FROM classification_override_requests WHERE id=$REQ_ID;")"
run "D1: override_approved audit row"              "1"        "$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_log WHERE entity_type='incident' AND entity_id=$INC_ID AND action='override_approved';")"

# D2: try to re-approve a decided request → 409
D2_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/override-requests/$REQ_ID/approve" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $PRIYA" -d '{}')
run "D2: re-approve decided → 409"                 "409" "$D2_CODE"

# D3: now that the prior pending is decided, elena can open a fresh one
# on the same field (e.g., revert)
REVERT_RESP=$(curl -s -X POST "$BASE/api/incidents/$INC_ID/override-requests" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $ELENA" \
  -d '{"field":"osha_recordable","proposed_value":0,"reason":"HCP later determined first aid only — revert"}')
REVERT_ID=$(echo "$REVERT_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','?'))")
run "D3: new request allowed after prior decided"  "non-zero" "$([ -n "$REVERT_ID" ] && [ "$REVERT_ID" -gt 0 ] && echo non-zero || echo zero)"

echo ""
echo "== Section E — Reject =="

# E1: priya rejects the revert
E1_RESP=$(curl -s -X POST "$BASE/api/override-requests/$REVERT_ID/reject" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $PRIYA" \
  -d '{"decision_note":"Documentation insufficient to revert."}')
E1_STATUS=$(echo "$E1_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))")
run "E1: reject returns status=rejected"           "rejected" "$E1_STATUS"
run "E1: incident.osha_recordable still 1"         "1"        "$(sqlite3 "$DB" "SELECT osha_recordable FROM incidents WHERE id=$INC_ID;")"
run "E1: override_rejected audit row"              "1"        "$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_log WHERE entity_type='incident' AND entity_id=$INC_ID AND action='override_rejected';")"

echo ""
echo "== Section F — Withdraw =="

# F1: elena creates another revert request
F1_RESP=$(curl -s -X POST "$BASE/api/incidents/$INC_ID/override-requests" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $ELENA" \
  -d '{"field":"osha_recordable","proposed_value":0,"reason":"second attempt, will withdraw"}')
WD_ID=$(echo "$F1_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','?'))")
run "F1: another pending allowed (prior rejected)" "non-zero" "$([ -n "$WD_ID" ] && [ "$WD_ID" -gt 0 ] && echo non-zero || echo zero)"

# F2: priya (not requester) tries to withdraw → 403
F2_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/override-requests/$WD_ID/withdraw" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $PRIYA")
run "F2: non-requester withdraw → 403"             "403" "$F2_CODE"

# F3: elena (requester) withdraws
F3_RESP=$(curl -s -X POST "$BASE/api/override-requests/$WD_ID/withdraw" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $ELENA")
F3_STATUS=$(echo "$F3_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))")
run "F3: withdraw returns status=withdrawn"        "withdrawn" "$F3_STATUS"
run "F3: override_withdrawn audit row"             "1"         "$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_log WHERE entity_type='incident' AND entity_id=$INC_ID AND action='override_withdrawn';")"

echo ""
echo "== Section G — Audit hash chain integrity =="

G1=$(curl -s -H "Authorization: Bearer $PRIYA" "$BASE/api/reports/audit-log/verify" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ok'))")
run "G1: WI-C hash chain still verifies"           "True" "$G1"

echo ""
echo "===================================================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "===================================================="
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "Failed tests:"
  for f in "${FAILED[@]}"; do echo "  - $f"; done
fi

exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
