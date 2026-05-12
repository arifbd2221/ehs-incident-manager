// server/services/pdf/osha_300a.js — OSHA Form 300A annual summary PDF.
//
// 29 CFR 1904.32. Layout reference: OSHA-RK-Forms-Package.pdf Form 300A
// page. Reuses the pdfkit pattern from services/pdf/osha_300.js
// (margins.bottom: 0 + lineBreak: false on every text() call) — see
// memory feedback_pdfkit_autopagination for why.
//
// Two render modes:
//   • Certified: reads from osha_300a_certified_summaries snapshot.
//     The verbatim 1904.32(b)(3) affirmation text appears in the sign-
//     here block above the certifier's name/title/date. The PDF is the
//     posted-summary artifact per 1904.32(b)(5).
//   • Draft: reads from the live aggregate300A() result. Header is
//     stamped "DRAFT — Not Certified" in red. Sign-here block shows
//     "(awaiting certification)".
//
// 1904.29(b)(4) equivalent-form clause: rendering differs visually from
// the OSHA-fillable PDF but preserves the same information set.

import PDFDocument from 'pdfkit';
import { embedOrgLogo } from './logo.js';

const PAGE_OPTS = {
  layout: 'portrait',
  size: 'LETTER',
  margins: { top: 36, bottom: 0, left: 36, right: 36 },
};

const FONT_REG  = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';
const USABLE_W = 612 - 72;
const LEFT_X = 36;

// Verbatim 1904.32(b)(3) affirmation text. Kept in sync with
// OSHA_300A_AFFIRMATION_TEXT in services/osha_300a.js.
const AFFIRMATION_HEADER = 'By signing, you affirm the following statement, made under 29 CFR 1904.32(b)(3):';
const AFFIRMATION_TEXT =
  'A company executive must certify that he or she has examined the OSHA 300 Log ' +
  'and that he or she reasonably believes, based on his or her knowledge of the ' +
  'process by which the information was recorded, that the annual summary is ' +
  'correct and complete.';

// Employee-access + employer-penalty statements per 1904.32(b)(2)(iii).
// Verbatim from the OSHA Form 300A.
const EMPLOYEE_ACCESS_STATEMENT =
  'Employees, former employees, and their representatives have the right to review the OSHA Form 300 in its entirety. ' +
  'They also have limited access to the OSHA Form 301 or its equivalent. See 29 CFR Part 1904.35, in OSHA’s ' +
  'recordkeeping rule, for further details on the access provisions for these forms.';
const EMPLOYER_PENALTY_STATEMENT =
  'Public reporting burden for this collection of information is estimated to average 50 minutes per response, ' +
  'including time to review the instruction, search and gather the data needed, and complete and review the ' +
  'collection of information. Knowingly falsifying this document may result in a fine.';

function drawHeader(doc, { year, certified, orgLogoPath }) {
  doc.font(FONT_BOLD).fontSize(11).fillColor('#000000');
  doc.text('OSHA’s Form 300A (Rev. 04/2004)', LEFT_X, 36, { lineBreak: false });
  doc.font(FONT_BOLD).fontSize(16);
  doc.text('Summary of Work-Related Injuries and Illnesses', LEFT_X, 50, { lineBreak: false });

  // Optional org logo, between the title block and the Year/CERTIFIED column.
  embedOrgLogo(doc, orgLogoPath, 380, 32, 80, 32);

  // Right-side: Year + cert status badge.
  doc.font(FONT_BOLD).fontSize(11).fillColor('#000000');
  doc.text(`Year ${year}`, 480, 36, { width: 100, align: 'right', lineBreak: false });
  if (certified) {
    // Plain-text 'CERTIFIED' — Helvetica's Latin-1 encoding doesn't
    // include U+2713 ✓ and renders it as an apostrophe. Word alone is
    // unambiguous against the green colour.
    doc.font(FONT_BOLD).fontSize(9).fillColor('#2E7D32');
    doc.text('CERTIFIED', 480, 52, { width: 100, align: 'right', lineBreak: false });
  } else {
    doc.font(FONT_BOLD).fontSize(9).fillColor('#D32F2F');
    doc.text('DRAFT — Not Certified', 420, 52, { width: 160, align: 'right', lineBreak: false });
  }

  doc.font(FONT_REG).fontSize(7).fillColor('#444444');
  doc.text(
    'U.S. Department of Labor — Occupational Safety and Health Administration · Form approved OMB no. 1218-0176',
    LEFT_X, 72, { width: USABLE_W, lineBreak: false }
  );

  // Employee-access statement per 1904.32(b)(2)(iii).
  doc.font(FONT_REG).fontSize(7).fillColor('#333333');
  doc.text(EMPLOYEE_ACCESS_STATEMENT, LEFT_X, 86, { width: USABLE_W, lineGap: 1, height: 24 });
}

function drawSectionHeader(doc, x, y, w, text) {
  doc.save();
  doc.lineWidth(0.6).strokeColor('#000000');
  doc.rect(x, y, w, 14).fillAndStroke('#E8E8EE', '#000000');
  doc.fillColor('#000000').font(FONT_BOLD).fontSize(9);
  doc.text(text, x + 4, y + 3, { width: w - 8, lineBreak: false });
  doc.restore();
}

// Boxed numeric value: small grey label + the number underneath in a
// thin-bordered rectangle. Matches the visual style of Form 300A.
function drawBoxedTotal(doc, x, y, w, label, value, opts = {}) {
  doc.save();
  doc.font(FONT_REG).fontSize(7).fillColor('#444444');
  doc.text(label, x + 2, y, { width: w - 4, lineBreak: false, ellipsis: true });
  doc.lineWidth(0.5).strokeColor('#000000');
  doc.rect(x, y + 10, w, 20).stroke();
  doc.font(FONT_BOLD).fontSize(opts.large ? 14 : 12).fillColor('#000000');
  doc.text(
    String(value ?? 0),
    x + 2, y + (opts.large ? 12 : 13),
    { width: w - 4, align: 'center', lineBreak: false },
  );
  doc.restore();
}

function drawLabeledLine(doc, x, y, label, value, opts = {}) {
  const w = opts.width || USABLE_W;
  doc.save();
  doc.font(FONT_BOLD).fontSize(8).fillColor('#000000');
  doc.text(label, x, y, { width: w, lineBreak: false, ellipsis: true });
  doc.font(FONT_REG).fontSize(9);
  doc.text(value || '', x, y + 11, { width: w, lineBreak: false, ellipsis: true });
  doc.lineWidth(0.4).strokeColor('#000000');
  doc.moveTo(x, y + 22).lineTo(x + w, y + 22).stroke();
  doc.restore();
}

// Greedy word-wrap with explicit line emission. Same pattern as
// services/pdf/osha_301.js drawWrappedField — sidesteps pdfkit's
// auto-pagination on wrapped text by emitting each line with
// lineBreak: false.
function drawWrappedText(doc, x, y, w, h, text, fontSize = 9) {
  doc.save();
  doc.font(FONT_REG).fontSize(fontSize).fillColor('#000000');
  const lineH = fontSize + 2;
  const maxLines = Math.max(1, Math.floor(h / lineH));
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let cur = '';
  for (const word of words) {
    const tentative = cur ? `${cur} ${word}` : word;
    if (doc.widthOfString(tentative) <= w) {
      cur = tentative;
    } else {
      if (cur) lines.push(cur);
      cur = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length > maxLines) lines.length = maxLines;
  for (let i = 0; i < lines.length; i++) {
    doc.text(lines[i], x, y + i * lineH, { width: w, lineBreak: false });
  }
  doc.restore();
}

function drawFooter(doc, { certified }) {
  doc.save();
  const y = doc.page.height - 38;
  doc.font(FONT_REG).fontSize(7).fillColor('#444444');
  doc.text(EMPLOYER_PENALTY_STATEMENT, LEFT_X, y, { width: USABLE_W, lineGap: 1, height: 22 });
  doc.font(FONT_REG).fontSize(6).fillColor('#888888');
  doc.text(
    certified
      ? `Certified record copy generated from the OSHA 300A snapshot. Per 29 CFR 1904.33(a), retain for 5 years.`
      : `DRAFT — not yet certified per 29 CFR 1904.32(b)(3). Not for posting.`,
    LEFT_X, doc.page.height - 10, { width: USABLE_W, align: 'center', lineBreak: false }
  );
  doc.restore();
}

/**
 * Stream the OSHA Form 300A PDF for one establishment / calendar year.
 *
 *   renderOsha300APdf(res, {
 *     year,
 *     establishmentName, establishmentAddress, naicsCode, ein,
 *     annualAvgEmployees, totalHoursWorked,
 *     totals: { total_deaths, total_days_away_cases, ... },
 *     certified: bool,
 *     cert: { signed_at, certifier_name, certifier_title_label } | null,
 *     companyName,
 *   })
 *
 * The route layer sets Content-Type / Content-Disposition before
 * calling.
 */
export function renderOsha300APdf(res, payload) {
  const doc = new PDFDocument(PAGE_OPTS);
  doc.pipe(res);

  drawHeader(doc, { year: payload.year, certified: !!payload.certified, orgLogoPath: payload.orgLogoPath || null });

  let y = 116;

  // ─── Number of Cases (G–J) ─────────────────────────────────────
  drawSectionHeader(doc, LEFT_X, y, USABLE_W, 'Number of Cases');
  y += 18;
  const colW = (USABLE_W - 3 * 8) / 4;
  drawBoxedTotal(doc, LEFT_X,                       y, colW, '(G) Total number of deaths',                  payload.totals.total_deaths);
  drawBoxedTotal(doc, LEFT_X + (colW + 8),          y, colW, '(H) Cases with days away from work',          payload.totals.total_days_away_cases);
  drawBoxedTotal(doc, LEFT_X + 2 * (colW + 8),      y, colW, '(I) Cases with job transfer or restriction',  payload.totals.total_job_transfer_cases);
  drawBoxedTotal(doc, LEFT_X + 3 * (colW + 8),      y, colW, '(J) Other recordable cases',                  payload.totals.total_other_recordable_cases);
  y += 38;

  // ─── Number of Days (K–L) ───────────────────────────────────────
  drawSectionHeader(doc, LEFT_X, y, USABLE_W, 'Number of Days');
  y += 18;
  const halfW = (USABLE_W - 8) / 2;
  drawBoxedTotal(doc, LEFT_X,                       y, halfW, '(K) Total days away from work',               payload.totals.total_days_away);
  drawBoxedTotal(doc, LEFT_X + halfW + 8,           y, halfW, '(L) Total days of job transfer or restriction', payload.totals.total_days_restricted);
  y += 38;

  // ─── Injury and Illness Types (M1–M6) ──────────────────────────
  drawSectionHeader(doc, LEFT_X, y, USABLE_W, 'Injury and Illness Types');
  y += 18;
  const mW = (USABLE_W - 5 * 6) / 6;
  drawBoxedTotal(doc, LEFT_X,                       y, mW, '(M1) Injuries',                payload.totals.total_injuries);
  drawBoxedTotal(doc, LEFT_X + (mW + 6),            y, mW, '(M2) Skin disorders',          payload.totals.total_skin_disorders);
  drawBoxedTotal(doc, LEFT_X + 2 * (mW + 6),        y, mW, '(M3) Respiratory conditions',  payload.totals.total_respiratory);
  drawBoxedTotal(doc, LEFT_X + 3 * (mW + 6),        y, mW, '(M4) Poisonings',              payload.totals.total_poisonings);
  drawBoxedTotal(doc, LEFT_X + 4 * (mW + 6),        y, mW, '(M5) Hearing loss',            payload.totals.total_hearing_loss);
  drawBoxedTotal(doc, LEFT_X + 5 * (mW + 6),        y, mW, '(M6) All other illnesses',     payload.totals.total_other_illnesses);
  y += 38;

  // ─── Establishment information (1904.32(b)(2)(ii)) ─────────────
  drawSectionHeader(doc, LEFT_X, y, USABLE_W, 'Establishment information');
  y += 18;
  drawLabeledLine(doc, LEFT_X, y,                          'Your establishment name', payload.establishmentName, { width: USABLE_W });
  y += 28;
  drawLabeledLine(doc, LEFT_X, y,                          'Street address',          payload.establishmentAddress || '', { width: USABLE_W });
  y += 28;
  drawLabeledLine(doc, LEFT_X, y,                          'Company name',            payload.companyName || '', { width: (USABLE_W - 8) / 2 });
  drawLabeledLine(doc, LEFT_X + (USABLE_W - 8) / 2 + 8, y, 'NAICS code',              payload.naicsCode || '', { width: (USABLE_W - 8) / 2 });
  y += 28;
  drawLabeledLine(doc, LEFT_X, y,                          'Employer Identification Number (EIN) · 1904.41(a)(4)', payload.ein || '', { width: (USABLE_W - 8) / 2 });
  drawLabeledLine(doc, LEFT_X + (USABLE_W - 8) / 2 + 8, y, 'Calendar year covered',   String(payload.year), { width: (USABLE_W - 8) / 2 });
  y += 28;
  drawLabeledLine(doc, LEFT_X, y,                          'Annual average number of employees', String(payload.annualAvgEmployees ?? 0), { width: (USABLE_W - 8) / 2 });
  drawLabeledLine(doc, LEFT_X + (USABLE_W - 8) / 2 + 8, y, 'Total hours worked by all employees', String(payload.totalHoursWorked ?? 0), { width: (USABLE_W - 8) / 2 });
  y += 36;

  // ─── Sign here block ───────────────────────────────────────────
  drawSectionHeader(doc, LEFT_X, y, USABLE_W, 'Sign here');
  y += 18;
  doc.font(FONT_BOLD).fontSize(8).fillColor('#000000');
  doc.text(AFFIRMATION_HEADER, LEFT_X, y, { width: USABLE_W, lineBreak: false, ellipsis: true });
  y += 12;
  drawWrappedText(doc, LEFT_X, y, USABLE_W, 36, AFFIRMATION_TEXT, 8);
  y += 38;

  if (payload.certified && payload.cert) {
    drawLabeledLine(doc, LEFT_X, y, 'Company executive (name)',           payload.cert.certifier_name || '', { width: (USABLE_W - 8) / 2 });
    drawLabeledLine(doc, LEFT_X + (USABLE_W - 8) / 2 + 8, y, 'Title · 1904.32(b)(4)', payload.cert.certifier_title_label || '', { width: (USABLE_W - 8) / 2 });
    y += 28;
    const signedDate = payload.cert.signed_at ? new Date(payload.cert.signed_at).toISOString().slice(0, 10) : '';
    drawLabeledLine(doc, LEFT_X, y, 'Date signed', signedDate, { width: (USABLE_W - 8) / 2 });
    drawLabeledLine(doc, LEFT_X + (USABLE_W - 8) / 2 + 8, y, 'Post by Feb. 1 · 1904.32(b)(6)', `${payload.year + 1}-02-01`, { width: (USABLE_W - 8) / 2 });
  } else {
    doc.font(FONT_REG).fontSize(9).fillColor('#666666');
    doc.text('(awaiting certification by a company executive per 29 CFR 1904.32(b)(3))',
      LEFT_X, y, { width: USABLE_W, lineBreak: false });
  }

  drawFooter(doc, { certified: !!payload.certified });
  doc.end();
}
