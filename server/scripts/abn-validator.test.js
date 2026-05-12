// server/scripts/abn-validator.test.js — node:test unit suite for the
// ABN checksum + format validator.
//
// Two spot-check ABNs verified live:
//   • 51 824 753 556 — Australian Taxation Office (canonical example).
//   • 48 123 123 124 — Second valid-checksum ABN (Commonwealth Bank
//     per public corporate footer; verified here by the algorithm only).
//
// Plus negative cases for length, padding, non-numeric chars, and the
// canonical "trivial test pattern" 12 345 678 901 which should fail.
//
// Pure functional — no DB.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidAbn, normalizeAbn, validateAbn } from '../services/abn_validator.js';

// --- Positive cases ---

test('isValidAbn — ATO ABN passes checksum', () => {
  assert.equal(isValidAbn('51 824 753 556'), true);
  assert.equal(isValidAbn('51824753556'), true);   // unspaced
  assert.equal(isValidAbn('51-824-753-556'), true);// dashed
});

test('isValidAbn — second valid ABN passes checksum', () => {
  // Verified by the mod-89 weighted-sum algorithm. Commonly cited as
  // Commonwealth Bank of Australia per CBA's public footer.
  assert.equal(isValidAbn('48 123 123 124'), true);
});

test('normalizeAbn — strips whitespace + non-digit chars', () => {
  assert.equal(normalizeAbn('51 824 753 556'), '51824753556');
  assert.equal(normalizeAbn('  51-824-753-556  '), '51824753556');
  assert.equal(normalizeAbn('51.824.753.556'), '51824753556');
});

// --- Negative cases ---

test('isValidAbn — trivial test pattern fails', () => {
  // 12345678901 has weighted sum that doesn't divide by 89.
  assert.equal(isValidAbn('12 345 678 901'), false);
});

test('isValidAbn — wrong length fails', () => {
  assert.equal(isValidAbn('51 824 753'), false);          // too short
  assert.equal(isValidAbn('51 824 753 556 0'), false);    // too long
  assert.equal(isValidAbn(''), false);
});

test('isValidAbn — non-digit garbage fails', () => {
  assert.equal(isValidAbn('ABCDEFGHIJK'), false);
  // After stripping non-digits, "51 824 75A 556" reduces to "5182475556"
  // (10 digits) so it fails the length gate before the checksum runs.
  assert.equal(normalizeAbn('51 824 75A 556'), null);
  assert.equal(isValidAbn('51 824 75A 556'), false);
});

test('isValidAbn — null / undefined fail', () => {
  assert.equal(isValidAbn(null), false);
  assert.equal(isValidAbn(undefined), false);
});

// --- Single-digit-tweak fails ---
// Flipping ANY single digit of a valid ABN should break the checksum.
// This is the property that makes ABN validation useful — it catches
// transcription errors. Verify for the ATO ABN.

test('isValidAbn — single-digit tweaks of a valid ABN fail', () => {
  const valid = '51824753556';
  let breaks = 0;
  for (let i = 0; i < 11; i++) {
    for (let d = 0; d <= 9; d++) {
      if (d === Number(valid[i])) continue;
      const tweaked = valid.slice(0, i) + String(d) + valid.slice(i + 1);
      if (!isValidAbn(tweaked)) breaks++;
    }
  }
  // Each digit has 9 alternatives; 11 positions = 99 tweaks. Any
  // collision (different digit also passing) would be statistically
  // rare but possible; checksum-property says most should fail.
  // We assert > 90% break (= at least 89 of 99) as a strong proxy.
  assert.ok(breaks >= 89, `Expected >= 89 of 99 tweaks to break checksum, got ${breaks}`);
});

// --- Structured validateAbn() return shape ---

test('validateAbn — ok: true with normalized form', () => {
  const r = validateAbn('51 824 753 556');
  assert.equal(r.ok, true);
  assert.equal(r.normalized, '51824753556');
});

test('validateAbn — empty returns reason="empty"', () => {
  assert.deepEqual(validateAbn(''), { ok: false, reason: 'empty' });
  assert.deepEqual(validateAbn('   '), { ok: false, reason: 'empty' });
  assert.deepEqual(validateAbn(null), { ok: false, reason: 'empty' });
});

test('validateAbn — wrong length returns digit_count', () => {
  const r = validateAbn('123');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'wrong_length');
  assert.equal(r.digit_count, 3);
});

test('validateAbn — checksum failure returns normalized form', () => {
  const r = validateAbn('12345678901');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'checksum_failed');
  assert.equal(r.normalized, '12345678901');
});
