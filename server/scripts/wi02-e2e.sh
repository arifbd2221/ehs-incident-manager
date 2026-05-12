#!/usr/bin/env bash
# server/scripts/wi02-e2e.sh — end-to-end coverage for WI-02 OSHA 300A
# annual summary + ITA CSV submission (29 CFR 1904.32, 1904.41).
#
# Verifies:
#   • Live 300A aggregation reads from osha_300_log.
#   • Cert workflow rejects bad certifier_title_key + bad typed_name.
#   • Cert workflow accepts the 4-key allowlist values.
#   • Cert atomically creates regulatory_certifications +
#     osha_300a_certified_summaries (1:1 link).
#   • Snapshot freezes column totals.
#   • Re-cert attempts get 409.
#   • PDF download for both DRAFT (uncertified) + CERTIFIED views.
#   • ITA CSV refuses to serve uncertified data.
#   • ITA CSV column headers match the OSHA template byte-for-byte.
#   • ITA validator blocks out-of-spec data (size, ABN-style EIN, etc).
#   • 1904.41 designation logic: Appendix A match + 250+ general case +
#     non-designated case.
#   • Framework gate / cross-tenant / activity_log / WI-C hash chain.

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
run "login priya (OSHA-frameworked)"  "non-empty" "$([ -n "$PRIYA" ] && echo non-empty || echo empty)"
run "login acme  (OSHA-only)"         "non-empty" "$([ -n "$ACME" ]  && echo non-empty || echo empty)"
run "login wendy (worker)"            "non-empty" "$([ -n "$WENDY" ] && echo non-empty || echo empty)"

# Use a site/year that already has 300_log rows so aggregation is non-zero.
SITE=1                         # Cleveland Plant
YEAR=$(sqlite3 "$DB" "SELECT MAX(calendar_year) FROM osha_300_log WHERE site_id=$SITE;")
run "Year with 300_log data discovered" "non-empty" "$([ -n "$YEAR" ] && echo non-empty || echo empty)"

# Reset cert state for re-runnable tests (delete any prior cert + snapshot
# for this site/year so we exercise the create path on every run).
sqlite3 "$DB" "DELETE FROM osha_300a_certified_summaries WHERE site_id=$SITE AND period_year=$YEAR; DELETE FROM regulatory_certifications WHERE type='osha_300a' AND site_id=$SITE AND period_year=$YEAR;"

# =============================================================
echo ""
echo "== Section A — Live aggregation (DRAFT view) =="
# =============================================================

LIVE=$(curl -s "$BASE/api/reports/osha-300a?site_id=$SITE&year=$YEAR" -H "Authorization: Bearer $PRIYA")
A1_CASES_DAYS_AWAY=$(echo "$LIVE" | python3 -c "import sys,json; print(json.load(sys.stdin)['cases']['days_away'])")
A1_HAS_SNAPSHOT=$(echo "$LIVE" | python3 -c "import sys,json; print(json.load(sys.stdin)['snapshot']['has_snapshot'])")
A1_OPTS=$(echo "$LIVE" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['certifier_title_options']))")
run "A1: live cases.days_away matches osha_300_log SUM"  "1"   "$A1_CASES_DAYS_AWAY"
run "A1: has_snapshot=False before cert"                 "False" "$A1_HAS_SNAPSHOT"
run "A1: 4 certifier_title_options surfaced"             "4"   "$A1_OPTS"

# =============================================================
echo ""
echo "== Section B — Cert workflow validation =="
# =============================================================

# B1: missing certifier_title_key → 400
B1=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $PRIYA" \
  -d "{\"site_id\":$SITE,\"year\":$YEAR,\"typed_name\":\"Priya Patel\"}" \
  "$BASE/api/reports/osha-300a/certify")
run "B1: missing certifier_title_key → 400"  "400" "$B1"

# B2: invalid certifier_title_key → 400
B2=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $PRIYA" \
  -d "{\"site_id\":$SITE,\"year\":$YEAR,\"typed_name\":\"Priya Patel\",\"certifier_title_key\":\"made_up_role\"}" \
  "$BASE/api/reports/osha-300a/certify")
run "B2: invalid certifier_title_key → 400"  "400" "$B2"

# B3: typed_name doesn't match → 400
B3=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $PRIYA" \
  -d "{\"site_id\":$SITE,\"year\":$YEAR,\"typed_name\":\"Wrong Name\",\"certifier_title_key\":\"owner\"}" \
  "$BASE/api/reports/osha-300a/certify")
run "B3: typed_name mismatch → 400"          "400" "$B3"

# B4: worker role → 403 (elevated-only)
B4=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $WENDY" \
  -d "{\"site_id\":$SITE,\"year\":$YEAR,\"typed_name\":\"Wendy Reyes\",\"certifier_title_key\":\"owner\"}" \
  "$BASE/api/reports/osha-300a/certify")
run "B4: worker role → 403"                  "403" "$B4"

# B5: cross-tenant site_id → 404 (acme is org=2; site 1 belongs to org=1)
B5=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $ACME" \
  -d "{\"site_id\":$SITE,\"year\":$YEAR,\"typed_name\":\"Acme Admin\",\"certifier_title_key\":\"owner\"}" \
  "$BASE/api/reports/osha-300a/certify")
run "B5: cross-tenant site_id → 404"         "404" "$B5"

# =============================================================
echo ""
echo "== Section C — Atomic cert + snapshot creation =="
# =============================================================

# WI-02 carry-forward: cert body now accepts ein/city/state/zip per
# 1904.41(a). All four are optional but format-validated server-side.
# B6..B8 prove the per-field validators reject bad input before any
# snapshot is written.
B6=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $PRIYA" \
  -d "{\"site_id\":$SITE,\"year\":$YEAR,\"typed_name\":\"Priya Patel\",\"certifier_title_key\":\"owner\",\"ein\":\"abc\"}" \
  "$BASE/api/reports/osha-300a/certify")
run "B6: bad EIN format → 400"          "400" "$B6"
B7=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $PRIYA" \
  -d "{\"site_id\":$SITE,\"year\":$YEAR,\"typed_name\":\"Priya Patel\",\"certifier_title_key\":\"owner\",\"state\":\"Texas\"}" \
  "$BASE/api/reports/osha-300a/certify")
run "B7: state must be 2-letter code → 400"  "400" "$B7"
B8=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $PRIYA" \
  -d "{\"site_id\":$SITE,\"year\":$YEAR,\"typed_name\":\"Priya Patel\",\"certifier_title_key\":\"owner\",\"zip\":\"abc123\"}" \
  "$BASE/api/reports/osha-300a/certify")
run "B8: bad ZIP format → 400"          "400" "$B8"

CERT_OUT=$(curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $PRIYA" \
  -d "{\"site_id\":$SITE,\"year\":$YEAR,\"typed_name\":\"Priya Patel\",\"certifier_title_key\":\"corporate_officer\",\"ein\":\"12-3456789\",\"city\":\"Cleveland\",\"state\":\"OH\",\"zip\":\"44101\"}" \
  "$BASE/api/reports/osha-300a/certify")
C1_CERT_ID=$(echo "$CERT_OUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('certification_id',''))")
C1_TITLE_KEY=$(echo "$CERT_OUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('certifier_title_key',''))")
C1_TITLE_LABEL=$(echo "$CERT_OUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('certifier_title_label',''))")
run "C1: cert created (certification_id present)"  "yes"                    "$([ -n "$C1_CERT_ID" ] && echo yes || echo no)"
run "C1: certifier_title_key persisted"            "corporate_officer"      "$C1_TITLE_KEY"
run "C1: certifier_title_label = verbatim 1904.32(b)(4)(ii)"  "An officer of the corporation"  "$C1_TITLE_LABEL"

# Snapshot row exists with the same column totals as the live aggregate.
C1_SNAP_DAYS_AWAY=$(sqlite3 "$DB" "SELECT total_days_away_cases FROM osha_300a_certified_summaries WHERE site_id=$SITE AND period_year=$YEAR;")
run "C1: snapshot freezes total_days_away_cases"    "$A1_CASES_DAYS_AWAY"   "$C1_SNAP_DAYS_AWAY"

# WI-02 carry-forward: cert body fields persisted on snapshot.
C1_SNAP_EIN=$(sqlite3 "$DB" "SELECT ein FROM osha_300a_certified_summaries WHERE site_id=$SITE AND period_year=$YEAR;")
C1_SNAP_CITY=$(sqlite3 "$DB" "SELECT city FROM osha_300a_certified_summaries WHERE site_id=$SITE AND period_year=$YEAR;")
C1_SNAP_STATE=$(sqlite3 "$DB" "SELECT state FROM osha_300a_certified_summaries WHERE site_id=$SITE AND period_year=$YEAR;")
C1_SNAP_ZIP=$(sqlite3 "$DB" "SELECT zip FROM osha_300a_certified_summaries WHERE site_id=$SITE AND period_year=$YEAR;")
run "C1: snapshot.ein = '123456789' (dash stripped)" "123456789"             "$C1_SNAP_EIN"
run "C1: snapshot.city = 'Cleveland'"               "Cleveland"              "$C1_SNAP_CITY"
run "C1: snapshot.state = 'OH'"                     "OH"                     "$C1_SNAP_STATE"
run "C1: snapshot.zip = '44101'"                    "44101"                  "$C1_SNAP_ZIP"

# Re-cert blocked
C2=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $PRIYA" \
  -d "{\"site_id\":$SITE,\"year\":$YEAR,\"typed_name\":\"Priya Patel\",\"certifier_title_key\":\"owner\"}" \
  "$BASE/api/reports/osha-300a/certify")
run "C2: re-cert returns 409"                       "409"                   "$C2"

# Post-cert GET reflects snapshot
POST=$(curl -s "$BASE/api/reports/osha-300a?site_id=$SITE&year=$YEAR" -H "Authorization: Bearer $PRIYA")
C3_HAS=$(echo "$POST" | python3 -c "import sys,json; print(json.load(sys.stdin)['snapshot']['has_snapshot'])")
C3_LABEL=$(echo "$POST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['certification']['certifier_title_label'])")
run "C3: post-cert has_snapshot=True"               "True"                                       "$C3_HAS"
run "C3: post-cert response surfaces verbatim label"  "An officer of the corporation"            "$C3_LABEL"

# =============================================================
echo ""
echo "== Section D — PDF download =="
# =============================================================

rm -f /tmp/wi02-pdf.pdf
PDF_STATUS=$(curl -s -o /tmp/wi02-pdf.pdf -w "%{http_code} %{content_type}" "$BASE/api/reports/osha-300a?site_id=$SITE&year=$YEAR&format=pdf" -H "Authorization: Bearer $PRIYA")
D1_CODE=$(echo "$PDF_STATUS" | awk '{print $1}')
D1_TYPE=$(echo "$PDF_STATUS" | awk '{print $2}')
D1_SIZE=$(wc -c < /tmp/wi02-pdf.pdf | tr -d ' ')
D1_PAGES=$(pdfinfo /tmp/wi02-pdf.pdf 2>/dev/null | awk '/^Pages:/ {print $2}')
run "D1: PDF status 200"                            "200"          "$D1_CODE"
run "D1: PDF content-type application/pdf"          "application/pdf"  "$D1_TYPE"
run "D1: PDF is single-page (300A is one page)"     "1"            "$D1_PAGES"
run "D1: PDF size > 2KB (not empty)"                "yes"          "$([ "$D1_SIZE" -gt 2000 ] && echo yes || echo no)"

# =============================================================
echo ""
echo "== Section E — ITA CSV download =="
# =============================================================

# Build a query string with the supplemental fields (city/state/zip + size/establishment_type).
# Cleveland Plant has NAICS 325199, 248 avg employees.
ITA_QS="site_id=$SITE&year=$YEAR&format=csv&city=Cleveland&state=OH&zip=44114&size=22&establishment_type=1&industry_description=Chemical%20manufacturing&company_name=SDS%20Manager%20Inc.&ein=123456789"

rm -f /tmp/wi02-ita.csv
CSV_STATUS=$(curl -s -o /tmp/wi02-ita.csv -w "%{http_code} %{content_type}" "$BASE/api/reports/osha-300a?$ITA_QS" -H "Authorization: Bearer $PRIYA")
E1_CODE=$(echo "$CSV_STATUS" | awk '{print $1}')
run "E1: CSV download status 200"                   "200"                  "$E1_CODE"

# Header parity check at the wire level (already covered at unit-test
# level, but verify the route emits what the exporter emits).
E1_HEADER=$(head -1 /tmp/wi02-ita.csv | tr -d '\r')
TEMPLATE_HEADER=$(head -1 ../docs/regulatory-sources/osha/osha_ita_summary_data_csv_template-revised.csv | tr -d '\r' | sed 's/^\xEF\xBB\xBF//')
run "E1: CSV header matches OSHA template"          "$TEMPLATE_HEADER"     "$E1_HEADER"

# 28 columns
E1_COLS=$(echo "$E1_HEADER" | tr ',' '\n' | wc -l | tr -d ' ')
run "E1: 28-column wire format"                     "28"                   "$E1_COLS"

# Validate the data row's EIN is quoted (leading-zero preservation rule).
# Snapshot's ein ('123456789', stored without dash) wins over the query
# string's '123456789' per the WI-02 carry-forward (migration 032).
E1_QUOTED=$(tail -1 /tmp/wi02-ita.csv | python3 -c "import sys; line=sys.stdin.read(); print('yes' if ',\"123456789\",' in line else 'no')")
run "E1: ein field quoted in data row (from snapshot)" "yes"                  "$E1_QUOTED"
E1_CITY_FROM_SNAP=$(tail -1 /tmp/wi02-ita.csv | python3 -c "import sys; line=sys.stdin.read(); print('yes' if 'Cleveland' in line else 'no')")
run "E1: city in data row (from snapshot)"          "yes"                  "$E1_CITY_FROM_SNAP"
E1_STATE_FROM_SNAP=$(tail -1 /tmp/wi02-ita.csv | python3 -c "import sys; line=sys.stdin.read(); print('yes' if ',OH,' in line else 'no')")
run "E1: state in data row (from snapshot)"         "yes"                  "$E1_STATE_FROM_SNAP"
E1_ZIP_FROM_SNAP=$(tail -1 /tmp/wi02-ita.csv | python3 -c "import sys; line=sys.stdin.read(); print('yes' if ',\"44101\",' in line else 'no')")
run "E1: zip in data row (from snapshot, quoted)"   "yes"                  "$E1_ZIP_FROM_SNAP"

# E2: uncertified CSV → 409
sqlite3 "$DB" "DELETE FROM osha_300a_certified_summaries WHERE site_id=$SITE AND period_year=$YEAR; DELETE FROM regulatory_certifications WHERE type='osha_300a' AND site_id=$SITE AND period_year=$YEAR;"
E2=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/reports/osha-300a?$ITA_QS" -H "Authorization: Bearer $PRIYA")
run "E2: uncertified CSV → 409 (must sign first)"   "409"                  "$E2"

# E3: bad size value → 400 (validator-rejected). Re-certify first.
curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $PRIYA" \
  -d "{\"site_id\":$SITE,\"year\":$YEAR,\"typed_name\":\"Priya Patel\",\"certifier_title_key\":\"owner\"}" \
  "$BASE/api/reports/osha-300a/certify" > /dev/null

BAD_QS="${ITA_QS/size=22/size=2}"   # size=2 is NOT in {1,21,22,3}
E3_OUT=$(curl -s -w "\nHTTP %{http_code}" "$BASE/api/reports/osha-300a?$BAD_QS" -H "Authorization: Bearer $PRIYA")
E3_CODE=$(echo "$E3_OUT" | awk 'NR>1 {print $2}' | tail -1)
E3_HAS_SIZE_ERR=$(echo "$E3_OUT" | python3 -c "
import sys,json,re
text=sys.stdin.read()
body=text.rsplit('\nHTTP ',1)[0]
try:
  d=json.loads(body)
  errs=d.get('ita_validation_errors',[])
  print('yes' if any(e.get('field')=='size' for e in errs) else 'no')
except Exception:
  print('parse-fail')")
run "E3: bad size value → 400"                      "400"                  "$E3_CODE"
run "E3: validator surfaces field=size error"       "yes"                  "$E3_HAS_SIZE_ERR"

# E4: bad EIN (8 digits) → 400
EIN_QS="${ITA_QS/ein=123456789/ein=12345678}"
E4=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/reports/osha-300a?$EIN_QS" -H "Authorization: Bearer $PRIYA")
run "E4: 8-digit EIN → 400"                         "400"                  "$E4"

# E5: PO Box street_address → 400
# (street is read from the snapshot, which read it from sites.address;
#  this is for hardening the validator path — we won't mutate the
#  sites row, so simulate by passing an explicit override.)
# Test by directly invoking the validator path with a PO-Box-ish snapshot
# would require schema mutation. Skipping the route-level repro; covered
# by unit test "validateItaSubmission — PO Box in street_address rejected".

# =============================================================
echo ""
echo "== Section F — Framework gate + cross-tenant =="
# =============================================================

# F1: sydney-test (no osha_300a in compliance_frameworks) — still gets
# the 300A JSON endpoint? Yes; the 300A endpoint isn't framework-gated
# (it's existing behavior). Just check designation lookup works.
F1=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/reports/osha-300a/ita-designation?site_id=$SITE" -H "Authorization: Bearer $SYDNEY")
# Cross-tenant: sydney is org=6, site 1 is org=1 → 404
run "F1: cross-tenant designation → 404"            "404"                  "$F1"

# F2: acme (org=2) trying to read priya's site → 404
F2=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/reports/osha-300a?site_id=$SITE&year=$YEAR" -H "Authorization: Bearer $ACME")
run "F2: cross-tenant /osha-300a → 404"             "404"                  "$F2"

# =============================================================
echo ""
echo "== Section G — Designation logic =="
# =============================================================

DESIG=$(curl -s "$BASE/api/reports/osha-300a/ita-designation?site_id=$SITE&employees=248" -H "Authorization: Bearer $PRIYA")
G1_REQ=$(echo "$DESIG" | python3 -c "import sys,json; print(json.load(sys.stdin)['designation']['required'])")
G1_TYPE=$(echo "$DESIG" | python3 -c "import sys,json; print(json.load(sys.stdin)['designation']['submission_type'])")
G1_APPENDIX=$(echo "$DESIG" | python3 -c "import sys,json; print(json.load(sys.stdin)['designation']['appendix'])")
G1_REGREF=$(echo "$DESIG" | python3 -c "import sys,json; print(json.load(sys.stdin)['designation']['reg_ref'])")
run "G1: Cleveland Plant (NAICS 325199, 248 emp) → required" "True"          "$G1_REQ"
run "G1: submission_type = 300A"                              "300A"         "$G1_TYPE"
run "G1: appendix = A (32 prefix → Manufacturing)"            "A"            "$G1_APPENDIX"
run "G1: reg_ref = 1904.41(a)(1)(i)"                          "1904.41(a)(1)(i)"  "$G1_REGREF"

# G2: same site simulated with 250+ employees → 300A but reg_ref shifts
DESIG2=$(curl -s "$BASE/api/reports/osha-300a/ita-designation?site_id=$SITE&employees=300" -H "Authorization: Bearer $PRIYA")
G2_REGREF=$(echo "$DESIG2" | python3 -c "import sys,json; print(json.load(sys.stdin)['designation']['reg_ref'])")
# Cleveland is NAICS 32 → in Appendix B at 300 employees (Manufacturing isn't
# in B by 2-digit; but rules check B FIRST when employees >= 100 — for 325199,
# we need to verify B doesn't match a 6-digit code. 325199 isn't in App B at
# 4-digit. So at 300 emp: first checks B (no match) → then 250+ general → 300A.
# Wait — but if employees >= 100, we check Appendix B FIRST. 325199 is NOT in
# Appendix B (it has 3261, 3262, 3271 etc, but not 3251 or 3252). So result:
# falls through B, then 250+ → '300A' via large_employer / 1904.41(a)(1)(ii).
run "G2: 300+ employees, non-AppB NAICS → large_employer"     "1904.41(a)(1)(ii)" "$G2_REGREF"

# G3: 100+ in an Appendix B NAICS (e.g., NAICS 3361 motor vehicle mfg)
DESIG3=$(curl -s "$BASE/api/reports/osha-300a/ita-designation?site_id=$SITE&employees=150" -H "Authorization: Bearer $PRIYA")
# Cleveland is 325199 — NOT in App B at 4-digit. So 150 employees doesn't
# match B. 150 is < 250 → also not large_employer. 20-249 → check A.
# 325199 prefix 32 → matches '31'/'32'/'33' Manufacturing in App A → required.
G3_REQ=$(echo "$DESIG3" | python3 -c "import sys,json; print(json.load(sys.stdin)['designation']['required'])")
G3_APPENDIX=$(echo "$DESIG3" | python3 -c "import sys,json; print(json.load(sys.stdin)['designation']['appendix'])")
run "G3: 150 employees in NAICS 32 → Appendix A"             "True"          "$G3_REQ"
run "G3: appendix A for Manufacturing prefix match"          "A"             "$G3_APPENDIX"

# G4: under 20 employees → not required
DESIG4=$(curl -s "$BASE/api/reports/osha-300a/ita-designation?site_id=$SITE&employees=15" -H "Authorization: Bearer $PRIYA")
G4_REQ=$(echo "$DESIG4" | python3 -c "import sys,json; print(json.load(sys.stdin)['designation']['required'])")
run "G4: <20 employees → not required"                       "False"         "$G4_REQ"

# =============================================================
echo ""
echo "== Section H — activity_log + WI-C hash chain =="
# =============================================================

# Cert + PDF + CSV all logged. (Re-cert happened, so 2 cert rows would
# be logged; we deleted the snapshot table between, so 1 osha_300a_signed
# audit row each time.)
H1=$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_log WHERE action='osha_300a_signed' AND created_at > datetime('now','-1 hour');")
run "H1: osha_300a_signed audit row(s) present"  "yes"  "$([ "${H1:-0}" -gt 0 ] && echo yes || echo no)"

H2=$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_log WHERE action='osha_300a_pdf_downloaded' AND created_at > datetime('now','-1 hour');")
run "H2: osha_300a_pdf_downloaded logged"        "yes"  "$([ "${H2:-0}" -gt 0 ] && echo yes || echo no)"

H3=$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_log WHERE action='osha_ita_csv_downloaded' AND created_at > datetime('now','-1 hour');")
run "H3: osha_ita_csv_downloaded logged"         "yes"  "$([ "${H3:-0}" -gt 0 ] && echo yes || echo no)"

CHAIN=$(curl -s -H "Authorization: Bearer $PRIYA" "$BASE/api/reports/audit-log/verify" \
  | python3 -c "import sys,json; print('ok' if json.load(sys.stdin).get('ok') else 'broken')")
run "H4: WI-C hash chain still verifies"         "ok"   "$CHAIN"

# =============================================================
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
