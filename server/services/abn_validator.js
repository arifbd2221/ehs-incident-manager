// server/services/abn_validator.js — ABN format + checksum validation.
//
// Australian Business Number format: 11 digits, typically displayed in
// 2-3-3-3 grouping (e.g., "51 824 753 556"). Algorithm per the
// Australian Business Register published at:
//   https://abr.business.gov.au/Help/AbnFormat
//
// Algorithm:
//   1. Subtract 1 from the first (leftmost) digit.
//   2. Multiply each of the 11 digits by the weighting factor at the
//      corresponding position: [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19].
//   3. Sum all of the resulting products.
//   4. If the sum is divisible by 89 (remainder = 0), the ABN is valid.
//
// Spot-check ABNs used in unit tests:
//   • 51 824 753 556 — Australian Taxation Office (canonical worked
//                       example in ATO documentation; verified entity
//                       attribution).
//   • 48 123 123 124 — Checksum-verified by the algorithm in this file.
//                       Commonly cited as Commonwealth Bank of Australia
//                       per CBA's public corporate footer; owner should
//                       confirm against current ASIC records if attribution
//                       matters. For our purposes here, what matters is
//                       that two distinct 11-digit inputs both pass the
//                       mod-89 weighted-sum check (proves the algorithm
//                       isn't trivially saying "yes" to one specific
//                       digit pattern).
//
// Used by:
//   • POST /reports/safework-nsw/... when capturing PCBU ABN on a
//     SafeWork NSW notification.
//   • Future invoicing / contractor onboarding work.

const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

/**
 * Strip whitespace + non-digit characters, returning the 11-digit
 * canonical form. Returns null if the input doesn't reduce to 11
 * digits (caller decides whether that's an error or a soft no-op).
 */
export function normalizeAbn(raw) {
  if (raw == null) return null;
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (digits.length !== 11) return null;
  return digits;
}

/**
 * Run the ATO weighted-sum + mod-89 checksum on an 11-digit ABN.
 * Returns true only when both the format AND the checksum pass.
 * Use validateAbn() for caller-facing reasons (this is the boolean
 * fast path).
 */
export function isValidAbn(raw) {
  const digits = normalizeAbn(raw);
  if (!digits) return false;
  // Per ATO: subtract 1 from the leftmost digit before weighting.
  const adjusted = [Number(digits[0]) - 1, ...digits.slice(1).split('').map(Number)];
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += adjusted[i] * ABN_WEIGHTS[i];
  }
  return sum % 89 === 0;
}

/**
 * Detailed validation that returns a structured result for routes
 * that want to differentiate "wrong length" from "checksum failed".
 *
 * { ok: true, normalized: '51824753556' }
 * { ok: false, reason: 'wrong_length' | 'checksum_failed' | 'empty' }
 */
export function validateAbn(raw) {
  if (raw == null || String(raw).trim() === '') {
    return { ok: false, reason: 'empty' };
  }
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (digits.length !== 11) {
    return { ok: false, reason: 'wrong_length', digit_count: digits.length };
  }
  if (!isValidAbn(digits)) {
    return { ok: false, reason: 'checksum_failed', normalized: digits };
  }
  return { ok: true, normalized: digits };
}
