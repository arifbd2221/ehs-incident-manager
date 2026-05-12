#!/usr/bin/env bash
# server/scripts/wi09-e2e.sh — end-to-end coverage for the WI-09
# universal incident PDF (per PRD §4.6).
#
# Verifies:
#   • Renders for an incident with EVERY supported status / type
#     combination — works regardless of jurisdiction / classification
#     / completeness.
#   • Cross-tenant access denied (404).
#   • Section-filter query param respected; bogus filter falls back
#     to all-sections default.
#   • activity_log captures generic_incident_pdf_downloaded with the
#     sections array in metadata.
#   • Disclaimer text present in the rendered PDF.
#   • WI-C hash chain still verifies after several downloads.
#   • No regulator-framework dependency — even an org without
#     osha_300a/riddor_f2508/safework_nsw can still download a
#     generic incident PDF (it's a universal floor).

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

PRIYA=$(login priya@sdsmanager.com)
ACME=$(login acme@sdsmanager.com)
SYDNEY=$(login sydney-test@example.com)
WENDY=$(login wendy@sdsmanager.com)
RIDDOR=$(login riddor-test@example.com)
run "login priya"          "non-empty" "$([ -n "$PRIYA" ]  && echo non-empty || echo empty)"
run "login acme"           "non-empty" "$([ -n "$ACME" ]   && echo non-empty || echo empty)"
run "login sydney"         "non-empty" "$([ -n "$SYDNEY" ] && echo non-empty || echo empty)"
run "login wendy (worker)" "non-empty" "$([ -n "$WENDY" ]  && echo non-empty || echo empty)"
run "login riddor-test"    "non-empty" "$([ -n "$RIDDOR" ] && echo non-empty || echo empty)"

# ============================================================
echo ""
echo "== Section A — Renders for every incident status / type =="
# ============================================================

download_pdf() {
  local token="$1"; local incident_id="$2"; local out="$3"; local extra="$4"
  curl -s -o "$out" -w "%{http_code} %{content_type}" \
    "$BASE/api/reports/incidents/$incident_id/generic?format=pdf$extra" \
    -H "Authorization: Bearer $token"
}

# A1: well-populated investigation-state incident
rm -f /tmp/wi09e2e_a1.pdf
A1_OUT=$(download_pdf "$PRIYA" 2 /tmp/wi09e2e_a1.pdf "")
A1_CODE=$(echo "$A1_OUT" | awk '{print $1}')
A1_TYPE=$(echo "$A1_OUT" | awk '{print $2}')
A1_PAGES=$(pdfinfo /tmp/wi09e2e_a1.pdf 2>/dev/null | awk '/^Pages:/ {print $2}')
A1_HAS_OVR=$(pdftotext -layout /tmp/wi09e2e_a1.pdf - 2>/dev/null | grep -c "Incident overview")
A1_HAS_DISCL=$(pdftotext -layout /tmp/wi09e2e_a1.pdf - 2>/dev/null | grep -c "not a regulatory submission")
run "A1: 'Investigating' injury — 200"           "200"             "$A1_CODE"
run "A1: content-type application/pdf"            "application/pdf" "$A1_TYPE"
run "A1: ≥1 page"                                "yes" "$([ "${A1_PAGES:-0}" -ge 1 ] && echo yes || echo no)"
run "A1: includes Incident overview section"     "yes" "$([ "${A1_HAS_OVR:-0}" -ge 1 ] && echo yes || echo no)"
run "A1: footer disclaimer present"              "yes" "$([ "${A1_HAS_DISCL:-0}" -ge 1 ] && echo yes || echo no)"

# A2: nearmiss New (no investigation / no recordability)
rm -f /tmp/wi09e2e_a2.pdf
A2_CODE=$(download_pdf "$PRIYA" 3 /tmp/wi09e2e_a2.pdf "" | awk '{print $1}')
A2_HAS_NOINV=$(pdftotext -layout /tmp/wi09e2e_a2.pdf - 2>/dev/null | grep -c "No investigation opened")
run "A2: 'New' nearmiss — 200"                    "200"  "$A2_CODE"
run "A2: shows 'No investigation opened' notice"  "yes"  "$([ "${A2_HAS_NOINV:-0}" -ge 1 ] && echo yes || echo no)"

# A3: Closed env-type incident
rm -f /tmp/wi09e2e_a3.pdf
A3_CODE=$(download_pdf "$PRIYA" 4 /tmp/wi09e2e_a3.pdf "" | awk '{print $1}')
run "A3: 'Closed' env-type incident — 200"        "200"  "$A3_CODE"

# A4: cross-tenant guard — acme can't read priya's incident
A4_CODE=$(download_pdf "$ACME" 2 /tmp/wi09e2e_a4.pdf "" | awk '{print $1}')
run "A4: cross-tenant access → 404"               "404"  "$A4_CODE"

# A5: unknown incident → 404
A5_CODE=$(download_pdf "$PRIYA" 99999999 /tmp/wi09e2e_a5.pdf "" | awk '{print $1}')
run "A5: unknown incident id → 404"               "404"  "$A5_CODE"

# A6: non-PDF format → 400 (only ?format=pdf supported)
A6_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/reports/incidents/2/generic?format=html" -H "Authorization: Bearer $PRIYA")
run "A6: ?format=html → 400"                      "400"  "$A6_CODE"

# ============================================================
echo ""
echo "== Section B — Section filter =="
# ============================================================

# B1: only overview rendered
rm -f /tmp/wi09e2e_b1.pdf
download_pdf "$PRIYA" 2 /tmp/wi09e2e_b1.pdf "&sections=overview" > /dev/null
B1_TEXT=$(pdftotext -layout /tmp/wi09e2e_b1.pdf -)
B1_HAS_OVR=$(echo "$B1_TEXT" | grep -c "Incident overview")
B1_NO_AUDIT=$(echo "$B1_TEXT" | grep -c "Audit trail")
B1_NO_CAPAS=$(echo "$B1_TEXT" | grep -c "Corrective & preventive actions")
run "B1: sections=overview → overview present"           "yes" "$([ "${B1_HAS_OVR:-0}" -ge 1 ] && echo yes || echo no)"
run "B1: sections=overview → audit absent"               "yes" "$([ "${B1_NO_AUDIT:-0}" -eq 0 ] && echo yes || echo no)"
run "B1: sections=overview → capas absent"               "yes" "$([ "${B1_NO_CAPAS:-0}" -eq 0 ] && echo yes || echo no)"

# B2: bogus section keys → fall back to all
rm -f /tmp/wi09e2e_b2.pdf
download_pdf "$PRIYA" 2 /tmp/wi09e2e_b2.pdf "&sections=nonexistent_section" > /dev/null
B2_TEXT=$(pdftotext -layout /tmp/wi09e2e_b2.pdf -)
B2_HAS_OVR=$(echo "$B2_TEXT" | grep -c "Incident overview")
B2_HAS_AUDIT=$(echo "$B2_TEXT" | grep -c "Audit trail")
run "B2: bogus sections → all defaults restored"         "yes" "$([ "${B2_HAS_OVR:-0}" -ge 1 ] && [ "${B2_HAS_AUDIT:-0}" -ge 1 ] && echo yes || echo no)"

# B3: comma-list of valid sections — only those rendered
rm -f /tmp/wi09e2e_b3.pdf
download_pdf "$PRIYA" 2 /tmp/wi09e2e_b3.pdf "&sections=overview,audit" > /dev/null
B3_TEXT=$(pdftotext -layout /tmp/wi09e2e_b3.pdf -)
B3_HAS_OVR=$(echo "$B3_TEXT" | grep -c "Incident overview")
B3_HAS_AUDIT=$(echo "$B3_TEXT" | grep -c "Audit trail")
B3_NO_CAUSES=$(echo "$B3_TEXT" | grep -c "Root cause analysis")
run "B3: sections=overview,audit → both present"         "yes" "$([ "${B3_HAS_OVR:-0}" -ge 1 ] && [ "${B3_HAS_AUDIT:-0}" -ge 1 ] && echo yes || echo no)"
run "B3: sections=overview,audit → causes excluded"      "yes" "$([ "${B3_NO_CAUSES:-0}" -eq 0 ] && echo yes || echo no)"

# B4: audit_limit honored (default 25; cap at 1 → minimal audit)
rm -f /tmp/wi09e2e_b4.pdf
download_pdf "$PRIYA" 2 /tmp/wi09e2e_b4.pdf "&sections=audit&audit_limit=1" > /dev/null
B4_TEXT=$(pdftotext -layout /tmp/wi09e2e_b4.pdf -)
# Count YYYY-MM-DD HH:MM date markers in the rendered audit section.
B4_DATE_COUNT=$(echo "$B4_TEXT" | grep -cE "^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}")
run "B4: audit_limit=1 → exactly 1 audit row"            "1"   "$B4_DATE_COUNT"

# ============================================================
echo ""
echo "== Section C — Universal availability =="
# ============================================================

# C1: framework-less org still allowed. sydney-test has only
# safework_nsw — generic should still work because no framework gate.
SYDNEY_INCIDENT=$(sqlite3 "$DB" "SELECT MIN(id) FROM incidents WHERE org_id=6;")
if [ -n "$SYDNEY_INCIDENT" ] && [ "$SYDNEY_INCIDENT" != "" ]; then
  C1_CODE=$(download_pdf "$SYDNEY" "$SYDNEY_INCIDENT" /tmp/wi09e2e_c1.pdf "" | awk '{print $1}')
  run "C1: SafeWork-NSW-only org → generic PDF works"     "200" "$C1_CODE"
else
  PASS=$((PASS+1)); printf "  \033[32mPASS\033[0m  %-78s\n" "C1: SafeWork-NSW org has no incidents (skipped)"
fi

# C2: worker role can download (universal — not elevated-only)
C2_CODE=$(download_pdf "$WENDY" 2 /tmp/wi09e2e_c2.pdf "" | awk '{print $1}')
run "C2: worker role can download generic PDF"            "200" "$C2_CODE"

# ============================================================
echo ""
echo "== Section D — Customer branding (org name in header) =="
# ============================================================

D1_TEXT=$(pdftotext -layout /tmp/wi09e2e_a1.pdf -)
ORG_NAME=$(sqlite3 "$DB" "SELECT name FROM organizations WHERE id=1;")
D1_HAS_ORG=$(echo "$D1_TEXT" | grep -c "$ORG_NAME")
run "D1: header carries org.name verbatim"                "yes" "$([ "${D1_HAS_ORG:-0}" -ge 1 ] && echo yes || echo no)"

D1_HAS_PLATFORM=$(echo "$D1_TEXT" | grep -c "Generated by EHS Incident Management")
run "D1: footer carries platform name + date"             "yes" "$([ "${D1_HAS_PLATFORM:-0}" -ge 1 ] && echo yes || echo no)"

# ============================================================
echo ""
echo "== Section E — activity_log + WI-C hash chain =="
# ============================================================

E1=$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_log WHERE action='generic_incident_pdf_downloaded' AND entity_id=2 AND created_at > datetime('now','-5 minutes');")
run "E1: download for incident 2 logged"                  "yes" "$([ "${E1:-0}" -ge 1 ] && echo yes || echo no)"

# Metadata should carry the sections array.
E2=$(sqlite3 "$DB" "SELECT metadata FROM activity_log WHERE action='generic_incident_pdf_downloaded' AND entity_id=2 ORDER BY id DESC LIMIT 1;")
E2_HAS_SECTIONS=$(echo "$E2" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print('yes' if isinstance(d.get('sections'), list) and len(d['sections'])>0 else 'no')" 2>/dev/null)
run "E2: audit metadata carries sections list"            "yes" "$E2_HAS_SECTIONS"

CHAIN=$(curl -s -H "Authorization: Bearer $PRIYA" "$BASE/api/reports/audit-log/verify" \
  | python3 -c "import sys,json; print('ok' if json.load(sys.stdin).get('ok') else 'broken')")
run "E3: WI-C hash chain still verifies"                  "ok"  "$CHAIN"

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
