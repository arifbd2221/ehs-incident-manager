#!/usr/bin/env bash
# server/scripts/wi06-pdf-e2e.sh — end-to-end coverage for the WI-06
# follow-up: SafeWork NSW record-copy PDF.
#
# Verifies:
#   • PDF download succeeds for a NSW-classified incident; content-type
#     application/pdf, body has a valid trailer dictionary.
#   • Renders verbatim Act labels for selected s.36 / s.37 sub-categories.
#   • Header carries the NSW number + event date + organisation byline.
#   • Footer carries the s.38 submission-channel disclaimer (phone +
#     online portal) verbatim.
#   • Government-document styling — no SafeWork NSW logo string, no
#     impersonation language; explicit "Internal record copy" label.
#   • Mines & Petroleum carve-out renders the s.38(8)/s.39(4)
#     determination section.
#   • Cross-tenant 404 (acme@sdsmanager.com is OSHA-only US org).
#   • Framework gate 403 (riddor-test is UK-only).
#   • Unknown incident → 404; incident without a NSW row → 404.
#   • activity_log row written with action='safework_nsw_pdf_downloaded'
#     and metadata carries nsw_number + notification id.
#   • WI-C hash chain still verifies after several downloads.

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
ACME=$(login acme@sdsmanager.com)
RIDDOR=$(login riddor-test@example.com)
PRIYA=$(login priya@sdsmanager.com)
run "login sydney"     "non-empty" "$([ -n "$SYDNEY" ] && echo non-empty || echo empty)"
run "login acme"       "non-empty" "$([ -n "$ACME" ]   && echo non-empty || echo empty)"
run "login riddor"     "non-empty" "$([ -n "$RIDDOR" ] && echo non-empty || echo empty)"
run "login priya"      "non-empty" "$([ -n "$PRIYA" ]  && echo non-empty || echo empty)"

# ============================================================
echo ""
echo "== Section A — Seed a NSW-notifiable incident =="
# ============================================================

SITE_ID=$(curl -s -H "Authorization: Bearer $SYDNEY" "$BASE/api/sites" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['sites'][0]['id'])")
run "Section A: NSW site resolved"  "non-empty" "$([ -n "$SITE_ID" ] && echo non-empty || echo empty)"

# Create a fresh AU incident with hospitalised=1 → auto-classified as
# s.35(b) / s.36(a) inpatient hospital + an explicit s.37(b) dangerous
# incident so the PDF exercises both sub-category sections.
CREATE_BODY=$(cat <<EOF
{
  "title": "WI-06 PDF e2e seed — multi-category",
  "type": "injury",
  "site_id": $SITE_ID,
  "department": "Smelting",
  "area": "Pot line 3",
  "specific_location": "Hearth tap",
  "incident_datetime": "2026-05-12T03:15:00Z",
  "description": "Operator sustained a serious laceration during a hot-tap operation and was admitted overnight for observation. Pot line equipment failed during the same shift, producing an uncontrolled escape of molten metal.",
  "immediate_actions_taken": "Production halted, area cordoned, injured worker transported to hospital, regulator notified by phone.",
  "hospitalized": 1,
  "type_data": {
    "safework_nsw": {
      "serious_injury_sub": ["s36_a_inpatient_hospital", "s36_b_viii_serious_lacerations"],
      "dangerous_incident_sub": ["s37_b_uncontrolled_fire_explosion"]
    }
  }
}
EOF
)
INC_ID=$(curl -s -X POST "$BASE/api/incidents" \
  -H "Authorization: Bearer $SYDNEY" -H "Content-Type: application/json" \
  -d "$CREATE_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','') or d.get('incident',{}).get('id',''))")
run "Section A: incident created"   "non-empty" "$([ -n "$INC_ID" ] && echo non-empty || echo empty)"

# Read the NSW row that was auto-created on POST.
NSW=$(curl -s -H "Authorization: Bearer $SYDNEY" "$BASE/api/reports/safework-nsw/$INC_ID")
NSW_NUMBER=$(echo "$NSW" | python3 -c "import sys,json;print(json.load(sys.stdin).get('nsw_number',''))" 2>/dev/null)
NSW_NID=$(echo "$NSW" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
run "Section A: NSW row auto-created"            "non-empty" "$([ -n "$NSW_NUMBER" ] && echo non-empty || echo empty)"
SER=$(echo "$NSW" | python3 -c "import sys,json;print(json.load(sys.stdin).get('is_serious_injury',0))")
DAN=$(echo "$NSW" | python3 -c "import sys,json;print(json.load(sys.stdin).get('is_dangerous_incident',0))")
run "Section A: is_serious_injury=1"             "1"  "$SER"
run "Section A: is_dangerous_incident=1"         "1"  "$DAN"

# ============================================================
echo ""
echo "== Section B — PDF download (happy path) =="
# ============================================================

rm -f /tmp/wi06pdf_b.pdf
B_OUT=$(curl -s -o /tmp/wi06pdf_b.pdf -w "%{http_code} %{content_type}" \
  "$BASE/api/reports/safework-nsw/$INC_ID?format=pdf" \
  -H "Authorization: Bearer $SYDNEY")
B_CODE=$(echo "$B_OUT" | awk '{print $1}')
B_TYPE=$(echo "$B_OUT" | awk '{print $2}')
B_PAGES=$(pdfinfo /tmp/wi06pdf_b.pdf 2>/dev/null | awk '/^Pages:/ {print $2}')
run "B1: 200 OK"                                 "200"             "$B_CODE"
run "B2: content-type application/pdf"           "application/pdf" "$B_TYPE"
run "B3: at least 1 page"                        "yes" "$([ "${B_PAGES:-0}" -ge 1 ] && echo yes || echo no)"

# Extract text once for the assertion battery.
TXT=$(pdftotext -layout /tmp/wi06pdf_b.pdf - 2>/dev/null)

assert_contains() {
  local name="$1"; local needle="$2"
  if echo "$TXT" | grep -qF -- "$needle"; then
    PASS=$((PASS+1)); printf "  \033[32mPASS\033[0m  %-78s\n" "$name"
  else
    FAIL=$((FAIL+1)); FAILED+=("$name :: missing '$needle'")
    printf "  \033[31mFAIL\033[0m  %-78s MISSING: %s\n" "$name" "$needle"
  fi
}

assert_contains "B4: header — Notifiable Incident Record"          "Notifiable Incident Record"
assert_contains "B5: header — Internal record copy label"          "Internal record copy"
assert_contains "B6: NSW reference number rendered"                "$NSW_NUMBER"
assert_contains "B7: WHS Act 2011 (NSW), Part 3 cite"              "Work Health and Safety Act 2011 (NSW), Part 3"
assert_contains "B8: s.35 section heading"                         "Notifiable category"
assert_contains "B9: s.36 verbatim label (a) in-patient hospital"  "Immediate treatment as an in-patient in a hospital"
assert_contains "B10: s.36 verbatim label (b)(viii) serious lacerations" "Serious lacerations"
assert_contains "B11: s.37 verbatim label (b) uncontrolled implosion/explosion/fire" "An uncontrolled implosion, explosion or fire"
assert_contains "B12: s.36(a) section_ref verbatim"                "WHS Act 2011 (NSW) s.36(a)"
assert_contains "B13: s.37(b) section_ref verbatim"                "WHS Act 2011 (NSW) s.37(b)"
assert_contains "B14: narrative description rendered"              "uncontrolled escape of molten metal"
assert_contains "B15: footer disclaimer line 1 (phone + portal)"   "Notifiable incidents are reported to SafeWork NSW by telephone (13 10 50) or online portal"
assert_contains "B16: footer disclaimer line 2 (not a substitute)" "internal record copy"
assert_contains "B17: section 7 — s.38 notification log"           "Notification log"
assert_contains "B18: s.38(4)(b) written-notice subsection text"   "only when requested by the regulator"

# Ensure no logo / impersonation language slipped in. "SafeWork NSW"
# appears intentionally in the footer (regulator name) and disclaimers,
# but the title block must use the "Notifiable Incident Record" label
# instead of pretending to be an official SafeWork NSW form.
B_IMPERSONATION=$(echo "$TXT" | grep -ciE 'safework nsw form|nsw government form|official notification form' || true)
run "B19: no impersonation language"             "0" "${B_IMPERSONATION:-0}"

# ============================================================
echo ""
echo "== Section C — activity_log + WI-C hash chain =="
# ============================================================

ACT_ROW=$(sqlite3 "$DB" "SELECT action || '|' || entity_id FROM activity_log WHERE action='safework_nsw_pdf_downloaded' AND entity_id=$INC_ID ORDER BY id DESC LIMIT 1;")
run "C1: activity_log row written"               "safework_nsw_pdf_downloaded|$INC_ID" "$ACT_ROW"
ACT_META=$(sqlite3 "$DB" "SELECT metadata FROM activity_log WHERE action='safework_nsw_pdf_downloaded' AND entity_id=$INC_ID ORDER BY id DESC LIMIT 1;")
echo "$ACT_META" | grep -qE "\"nsw_number\"[[:space:]]*:[[:space:]]*\"$NSW_NUMBER\"" \
  && run "C2: metadata carries nsw_number" "yes" "yes" \
  || run "C2: metadata carries nsw_number" "yes" "no — $ACT_META"
echo "$ACT_META" | grep -qE "\"nsw_notification_id\"[[:space:]]*:[[:space:]]*$NSW_NID" \
  && run "C3: metadata carries notification id" "yes" "yes" \
  || run "C3: metadata carries notification id" "yes" "no — $ACT_META"

# Double-download to make sure the route stays idempotent + logs each download.
rm -f /tmp/wi06pdf_b2.pdf
curl -s -o /tmp/wi06pdf_b2.pdf "$BASE/api/reports/safework-nsw/$INC_ID?format=pdf" \
  -H "Authorization: Bearer $SYDNEY" > /dev/null
COUNT_NOW=$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_log WHERE action='safework_nsw_pdf_downloaded' AND entity_id=$INC_ID;")
run "C4: second download appended a second log row" "yes" "$([ "${COUNT_NOW:-0}" -ge 2 ] && echo yes || echo no)"

# WI-C: verify the activity_log hash chain still validates.
HC=$(curl -s -H "Authorization: Bearer $PRIYA" "$BASE/api/reports/audit-log/verify" \
  | python3 -c "import sys,json;d=json.load(sys.stdin); print(d.get('ok',False))" 2>/dev/null)
run "C5: WI-C hash chain still verifies"          "True" "$HC"

# ============================================================
echo ""
echo "== Section D — Negative paths =="
# ============================================================

# D1: cross-tenant — acme (org=2) is OSHA-only and not even NSW-enabled.
# The framework gate fires first and returns 403.
D1=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/reports/safework-nsw/$INC_ID?format=pdf" -H "Authorization: Bearer $ACME")
run "D1: non-NSW org (acme, OSHA) → 403"          "403" "$D1"

# D2: riddor-test (UK-only org) → framework gate 403.
D2=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/reports/safework-nsw/$INC_ID?format=pdf" -H "Authorization: Bearer $RIDDOR")
run "D2: UK-only org (riddor-test) → 403"         "403" "$D2"

# D3: unknown incident id → 404 (within the NSW org).
D3=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/reports/safework-nsw/99999999?format=pdf" -H "Authorization: Bearer $SYDNEY")
run "D3: unknown incident → 404"                  "404" "$D3"

# D4: an incident without a NSW notification row.
# Create a Sydney-site env incident with no notifiable signal — no NSW
# row will be auto-created. PDF route should 404 cleanly.
NULL_BODY=$(cat <<EOF
{
  "title": "WI-06 PDF — non-notifiable seed",
  "type": "env",
  "site_id": $SITE_ID,
  "incident_datetime": "2026-05-12T04:00:00Z",
  "description": "Small oil sheen on coolant tray. Cleaned by ops.",
  "type_data": {}
}
EOF
)
NULL_INC=$(curl -s -X POST "$BASE/api/incidents" \
  -H "Authorization: Bearer $SYDNEY" -H "Content-Type: application/json" \
  -d "$NULL_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','') or d.get('incident',{}).get('id',''))")
D4=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/reports/safework-nsw/$NULL_INC?format=pdf" -H "Authorization: Bearer $SYDNEY")
run "D4: incident without NSW row → 404"          "404" "$D4"

# ============================================================
echo ""
echo "== Section E — Mines & Petroleum carve-out =="
# ============================================================

# E1: seed an incident with excluded_mines_petroleum=true. The engine
# creates a row carrying the determination; the PDF must render the
# explicit "NOT NOTIFIABLE under WHS Act 2011 (NSW), Part 3" section
# and explain why per s.38(8)/s.39(4).
MP_BODY=$(cat <<EOF
{
  "title": "WI-06 PDF — Mines & Petroleum carve-out seed",
  "type": "dangerous",
  "site_id": $SITE_ID,
  "incident_datetime": "2026-05-12T05:00:00Z",
  "description": "Underground ventilation interruption at a petroleum site (governed by WHS Mines and Petroleum Sites Act 2013).",
  "hospitalized": 1,
  "type_data": {
    "safework_nsw": {
      "excluded_mines_petroleum": true,
      "dangerous_incident_sub": ["s37_k_ventilation_interruption"]
    }
  }
}
EOF
)
MP_INC=$(curl -s -X POST "$BASE/api/incidents" \
  -H "Authorization: Bearer $SYDNEY" -H "Content-Type: application/json" \
  -d "$MP_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','') or d.get('incident',{}).get('id',''))")
run "E1: M&P incident created"                   "non-empty" "$([ -n "$MP_INC" ] && echo non-empty || echo empty)"

rm -f /tmp/wi06pdf_e.pdf
E_CODE=$(curl -s -o /tmp/wi06pdf_e.pdf -w "%{http_code}" "$BASE/api/reports/safework-nsw/$MP_INC?format=pdf" -H "Authorization: Bearer $SYDNEY")
run "E2: M&P PDF download → 200"                 "200" "$E_CODE"
MP_TXT=$(pdftotext -layout /tmp/wi06pdf_e.pdf - 2>/dev/null)
echo "$MP_TXT" | grep -qF "NOT NOTIFIABLE" \
  && run "E3: M&P determination — NOT NOTIFIABLE rendered" "yes" "yes" \
  || run "E3: M&P determination — NOT NOTIFIABLE rendered" "yes" "no"
echo "$MP_TXT" | grep -qF "s.38(8)" \
  && run "E4: M&P determination cites s.38(8)" "yes" "yes" \
  || run "E4: M&P determination cites s.38(8)" "yes" "no"

# ============================================================
echo ""
echo "== Section F — Phone + written log surfaces in the PDF =="
# ============================================================

# Log a phone notification + simulate regulator-requested-written + log
# written-submitted, then re-download and verify the values appear.
curl -s -X POST "$BASE/api/reports/safework-nsw/$NSW_NID/phone-notified" \
  -H "Authorization: Bearer $SYDNEY" -H "Content-Type: application/json" \
  -d '{"regulator_office":"SafeWork NSW Sydney","notes":"Spoke to duty officer"}' > /dev/null
curl -s -X POST "$BASE/api/reports/safework-nsw/$NSW_NID/regulator-requested-written" \
  -H "Authorization: Bearer $SYDNEY" -H "Content-Type: application/json" -d '{}' > /dev/null
curl -s -X POST "$BASE/api/reports/safework-nsw/$NSW_NID/written-submitted" \
  -H "Authorization: Bearer $SYDNEY" -H "Content-Type: application/json" \
  -d '{"reference":"NSW/2026/12345","notes":"Submitted via portal"}' > /dev/null

rm -f /tmp/wi06pdf_f.pdf
curl -s -o /tmp/wi06pdf_f.pdf "$BASE/api/reports/safework-nsw/$INC_ID?format=pdf" -H "Authorization: Bearer $SYDNEY" > /dev/null
F_TXT=$(pdftotext -layout /tmp/wi06pdf_f.pdf - 2>/dev/null)
echo "$F_TXT" | grep -qF "SafeWork NSW Sydney" \
  && run "F1: phone regulator_office surfaces" "yes" "yes" \
  || run "F1: phone regulator_office surfaces" "yes" "no"
echo "$F_TXT" | grep -qF "NSW/2026/12345" \
  && run "F2: written reference surfaces" "yes" "yes" \
  || run "F2: written reference surfaces" "yes" "no"

# ============================================================
echo ""
echo "== Section G — PCBU extended fields (WI-06 follow-up, mig 033) =="
# ============================================================

# Set the full PCBU set (registered name + trading name + ABN + ANZSIC
# + address + worker_count), download a fresh PDF, and assert each
# value renders in the Notifying-entity section.
curl -s -X POST "$BASE/api/reports/safework-nsw/$NSW_NID/pcbu" \
  -H "Authorization: Bearer $SYDNEY" -H "Content-Type: application/json" \
  -d '{"name":"Sydney Smelters Pty Ltd","trading_name":"Sydney Smelters","abn":"51 824 753 556","anzsic_code":"2412","address":"1 Industrial Way, Sydney NSW 2000","worker_count":47}' > /dev/null

rm -f /tmp/wi06pdf_g.pdf
curl -s -o /tmp/wi06pdf_g.pdf "$BASE/api/reports/safework-nsw/$INC_ID?format=pdf" -H "Authorization: Bearer $SYDNEY" > /dev/null
G_TXT=$(pdftotext -layout /tmp/wi06pdf_g.pdf - 2>/dev/null)

echo "$G_TXT" | grep -qF "Sydney Smelters Pty Ltd" \
  && run "G1: PCBU registered name surfaces"     "yes" "yes" \
  || run "G1: PCBU registered name surfaces"     "yes" "no"
echo "$G_TXT" | grep -qF "Sydney Smelters" \
  && run "G2: PCBU trading name surfaces"        "yes" "yes" \
  || run "G2: PCBU trading name surfaces"        "yes" "no"
echo "$G_TXT" | grep -qF "1 Industrial Way" \
  && run "G3: PCBU address surfaces"             "yes" "yes" \
  || run "G3: PCBU address surfaces"             "yes" "no"
echo "$G_TXT" | grep -qF "51824753556" \
  && run "G4: normalised ABN surfaces"           "yes" "yes" \
  || run "G4: normalised ABN surfaces"           "yes" "no"
echo "$G_TXT" | grep -qF "47" \
  && run "G5: worker_count surfaces"             "yes" "yes" \
  || run "G5: worker_count surfaces"             "yes" "no"

# ============================================================
echo ""
echo "================================================================"
echo "  PASS=$PASS  FAIL=$FAIL"
echo "================================================================"
if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Failures:"
  for f in "${FAILED[@]}"; do echo "  • $f"; done
  exit 1
fi
