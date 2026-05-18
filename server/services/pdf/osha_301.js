// server/services/pdf/osha_301.js — OSHA Form 301 (Rev. 04/2004) PDF renderer.
//
// "Injury and Illness Incident Report" — one per recordable case
// per 29 CFR 1904.29(b)(2). Layout reference: OSHA-RK-Forms-Package.pdf
// Form 301 page. Field numbering matches the official form.
//
// Three sections + signature block:
//
//   Information about the employee
//     1) Full name
//     2) Street / City / State / ZIP
//     3) Date of birth
//     4) Date hired
//     5) Male / Female
//
//   Information about the physician or other health care professional
//     6) Name of physician or other health care professional
//     7) If treatment was given away from the worksite, where was it given?
//        — Facility / Street / City / State / ZIP
//     8) Was employee treated in an emergency room?  Yes / No
//     9) Was employee hospitalized overnight as an in-patient?  Yes / No
//
//   Information about the case
//     10) Case number from the Log
//     11) Date of injury or illness
//     12) Time employee began work (HH:MM)  AM/PM
//     13) Time of event (HH:MM)  AM/PM
//     14) What was the employee doing just before the incident? (no PII)
//     15) What happened? (no PII)
//     16) What was the injury or illness? (body part + how it was affected) (no PII)
//     17) What object or substance directly harmed the employee? (no PII)
//     18) If the employee died, when did death occur?  Date of death
//
//   Completed by: name / title / phone / date
//
// 29 CFR 1904.29(b)(4) lets us serve an "equivalent form" so long as the
// same information is present; we keep the OSHA field numbers verbatim so
// inspectors can map this to the official form line-by-line.
//
// Auto-pagination disabled via `margins.bottom: 0` + `lineBreak: false` on
// every text() — see memory feedback_pdfkit_autopagination.md for the
// reason and the WI-01 precedent.

import PDFDocument from 'pdfkit';
import { embedOrgLogo } from './logo.js';

const PAGE_OPTS = {
  layout: 'portrait',
  size: 'LETTER',
  margins: { top: 36, bottom: 0, left: 36, right: 36 },
};

const FONT_REG  = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';

// Page width = 612pt; usable = 612 - 72 = 540pt.
const PAGE_W = 612;
const USABLE_W = PAGE_W - 72;
const COL_LEFT_X  = 36;
const COL_RIGHT_X = 318;   // start of the right column
const COL_W       = 258;   // each column = ~258pt

// Format an ISO date as "MM / DD / YYYY" matching the boxed date fields on
// the official form. Returns blank for null/undefined/invalid input.
function fmtDateBoxes(iso) {
  if (!iso) return { mm: '', dd: '', yyyy: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    // Maybe already "YYYY-MM-DD" — try a direct split.
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { mm: m[2], dd: m[3], yyyy: m[1] };
    return { mm: '', dd: '', yyyy: '' };
  }
  const pad = (n) => String(n).padStart(2, '0');
  return { mm: pad(d.getMonth() + 1), dd: pad(d.getDate()), yyyy: String(d.getFullYear()) };
}

// Format an ISO timestamp into "HH:MM" 24h + an AM/PM derivation.
function fmtTime(iso) {
  if (!iso) return { hhmm: '', ampm: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { hhmm: '', ampm: '' };
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const hh12 = ((h + 11) % 12) + 1;
  return { hhmm: `${hh12}:${m}`, ampm: h < 12 ? 'AM' : 'PM' };
}

// Draw a prominent X inside a checkbox by stroking two diagonals. PDFKit's
// bundled Helvetica lacks a glyph for U+2717 (✗), so a `doc.text('✗', …)`
// silently drops the mark and the box renders empty — exactly the bug the
// 2026-05-18 review caught. Lines are font-independent and always visible.
function drawCheckmark(doc, x, y, size = 8) {
  doc.save();
  doc.lineWidth(1.5).strokeColor('#000000');
  doc.moveTo(x + 1.5, y + 1.5).lineTo(x + size - 1.5, y + size - 1.5).stroke();
  doc.moveTo(x + size - 1.5, y + 1.5).lineTo(x + 1.5, y + size - 1.5).stroke();
  doc.restore();
}

// Yes / No checkbox pair — used for 8) ER and 9) hospitalized.
function drawYesNo(doc, x, y, value) {
  const yes = value === 1 || value === true || value === 'yes' || value === 'Yes';
  const no  = value === 0 || value === false || value === 'no' || value === 'No';
  doc.save();
  doc.lineWidth(0.6).strokeColor('#000000');
  // Yes
  doc.rect(x, y, 8, 8).stroke();
  doc.font(FONT_REG).fontSize(8).fillColor('#000000');
  doc.text('Yes', x + 12, y, { lineBreak: false });
  if (yes) drawCheckmark(doc, x, y);
  // No
  doc.rect(x + 36, y, 8, 8).stroke();
  doc.font(FONT_REG).fontSize(8).text('No', x + 48, y, { lineBreak: false });
  if (no) drawCheckmark(doc, x + 36, y);
  doc.restore();
}

// Underlined value row — label on its own line, value below with a single
// underline. Used for the free-text fields (1, 2, 4, 6, 7, 10, 14..17).
function drawLabeledLine(doc, x, y, label, value, opts = {}) {
  const w = opts.width || COL_W;
  const labelFont = opts.boldLabel === false ? FONT_REG : FONT_BOLD;
  doc.save();
  doc.font(labelFont).fontSize(8).fillColor('#000000');
  doc.text(label, x, y, { width: w, lineBreak: false, ellipsis: true });
  doc.font(FONT_REG).fontSize(opts.valueSize || 9);
  doc.text(value || '', x, y + 11, { width: w, lineBreak: false, ellipsis: true });
  // Underline
  doc.lineWidth(0.4).strokeColor('#000000');
  doc.moveTo(x, y + 22).lineTo(x + w, y + 22).stroke();
  doc.restore();
}

// Multi-line wrapped value (no underline; for 14, 15, 16, 17).
//
// pdfkit's text() with wrap (lineBreak: true) advances doc.y and triggers
// addPage() when the cursor passes the page bottom — even when `height`
// clips the visual output. To stay on a single page we manually split the
// value into lines using `widthOfString` + `lineHeight` and render each line
// with `lineBreak: false`. This bypasses pdfkit's pagination entirely.
// See memory feedback_pdfkit_autopagination for the precedent.
function drawWrappedField(doc, x, y, label, value, opts = {}) {
  const w = opts.width || (USABLE_W);
  const h = opts.height || 36;
  doc.save();
  doc.font(FONT_BOLD).fontSize(8).fillColor('#000000');
  doc.text(label, x, y, { width: w, lineBreak: false, ellipsis: true });
  // Bounding box for the wrapped value.
  doc.lineWidth(0.4).strokeColor('#000000');
  doc.rect(x, y + 11, w, h).stroke();
  doc.font(FONT_REG).fontSize(9);

  const innerW = w - 6;
  const lineH = 11;
  const maxLines = Math.max(1, Math.floor((h - 4) / lineH));
  const lines = wrapValueLines(doc, String(value || ''), innerW, maxLines);
  for (let i = 0; i < lines.length; i++) {
    doc.text(lines[i], x + 3, y + 14 + i * lineH, { lineBreak: false, width: innerW, ellipsis: true });
  }
  doc.restore();
}

// Greedy word-wrap that respects pdfkit's currently-set font + size.
// Trims to `maxLines` lines (last line ellipsized if more content remains).
function wrapValueLines(doc, text, width, maxLines) {
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const tentative = cur ? `${cur} ${w}` : w;
    if (doc.widthOfString(tentative) <= width) {
      cur = tentative;
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length > maxLines) lines.length = maxLines;
  // If we truncated, ellipsize the last line.
  const joined = lines.join(' ');
  if (joined.length < text.length && lines.length > 0) {
    let last = lines[lines.length - 1];
    while (last.length > 0 && doc.widthOfString(`${last}…`) > width) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = `${last}…`;
  }
  return lines.length > 0 ? lines : [''];
}

// Date in three small boxes (Month / Day / Year). Mirrors the boxed visual
// layout on the official form.
function drawDateBoxes(doc, x, y, iso) {
  const { mm, dd, yyyy } = fmtDateBoxes(iso);
  doc.save();
  doc.lineWidth(0.5).strokeColor('#000000');
  doc.font(FONT_REG).fontSize(8).fillColor('#444444');
  // Three little boxes labeled below
  const drawCell = (cx, label, val, w) => {
    doc.rect(cx, y, w, 14).stroke();
    doc.font(FONT_BOLD).fontSize(10).fillColor('#000000');
    doc.text(val, cx + 2, y + 2, { width: w - 4, align: 'center', lineBreak: false });
    doc.font(FONT_REG).fontSize(7).fillColor('#666666');
    doc.text(label, cx, y + 16, { width: w, align: 'center', lineBreak: false });
  };
  drawCell(x,       'Month', mm,   24);
  drawCell(x + 28,  'Day',   dd,   24);
  drawCell(x + 56,  'Year',  yyyy, 40);
  doc.restore();
}

function drawSectionHeader(doc, x, y, w, text) {
  doc.save();
  doc.lineWidth(0.6).strokeColor('#000000');
  doc.rect(x, y, w, 14).fillAndStroke('#E8E8EE', '#000000');
  doc.fillColor('#000000').font(FONT_BOLD).fontSize(9);
  doc.text(text, x + 4, y + 3, { width: w - 8, lineBreak: false });
  doc.restore();
}

function drawHeader(doc, { incidentNumber, year, orgLogoPath }) {
  doc.font(FONT_BOLD).fontSize(11).fillColor('#000000');
  doc.text("OSHA's Form 301 (Rev. 04/2004)", 36, 36, { lineBreak: false });
  doc.font(FONT_BOLD).fontSize(16);
  doc.text('Injury and Illness Incident Report', 36, 50, { lineBreak: false });

  // Optional org logo — top-right corner, conservative size to preserve
  // the form-equivalent claim under 1904.29(b)(4).
  embedOrgLogo(doc, orgLogoPath, 470, 32, 100, 38);

  doc.font(FONT_REG).fontSize(7).fillColor('#444444');
  doc.text(
    'Attention: This form contains information relating to employee health and must be used in a manner that ' +
    'protects the confidentiality of employees to the extent possible while the information is being used for ' +
    'occupational safety and health purposes.',
    36, 72, { width: USABLE_W, lineGap: 1, height: 22 }
  );

  doc.font(FONT_BOLD).fontSize(9).fillColor('#000000');
  doc.text(`Incident: ${incidentNumber || '—'}`, 36, 96, { width: USABLE_W, lineBreak: false });
  if (year) doc.text(`Calendar year ${year}`, 36, 108, { width: USABLE_W, lineBreak: false });

  doc.font(FONT_REG).fontSize(7).fillColor('#666666');
  doc.text('U.S. Department of Labor — Occupational Safety and Health Administration · Form approved OMB no. 1218-0176',
    36, 122, { width: USABLE_W, lineBreak: false });
}

function drawFooter(doc) {
  const y = doc.page.height - 24;
  doc.font(FONT_REG).fontSize(7).fillColor('#666666');
  doc.text(
    'According to 29 CFR 1904, OSHA\'s recordkeeping rule, you must keep this form on file for 5 years following ' +
    'the year to which it pertains.',
    36, y, { width: USABLE_W, align: 'center', lineBreak: false }
  );
}

// Compose the three info sections.
function drawEmployeeSection(doc, x, y, w, employee) {
  drawSectionHeader(doc, x, y, w, 'Information about the employee');
  let cy = y + 22;

  drawLabeledLine(doc, x, cy, '1)  Full name', employee?.name || '', { width: w });
  cy += 28;

  drawLabeledLine(doc, x, cy, '2)  Street', employee?.address || '', { width: w });
  cy += 28;
  // No separate City/State/ZIP in the schema — address is a single line.
  // Per 29 CFR 1904.29(b)(4) "equivalent form" rule, keeping the same
  // information present satisfies the requirement.

  // 3) DOB
  doc.font(FONT_BOLD).fontSize(8).fillColor('#000000');
  doc.text('3)  Date of birth', x, cy, { lineBreak: false });
  drawDateBoxes(doc, x + 96, cy - 2, employee?.dob);
  cy += 26;

  // 4) Date hired
  doc.font(FONT_BOLD).fontSize(8).fillColor('#000000');
  doc.text('4)  Date hired', x, cy, { lineBreak: false });
  drawDateBoxes(doc, x + 96, cy - 2, employee?.hire_date);
  cy += 26;

  // 5) Gender
  doc.font(FONT_BOLD).fontSize(8).fillColor('#000000');
  doc.text('5)  Sex', x, cy, { lineBreak: false });
  const gender = (employee?.gender || '').toLowerCase();
  doc.lineWidth(0.6).strokeColor('#000000');
  doc.rect(x + 60, cy, 8, 8).stroke();
  doc.font(FONT_REG).fontSize(8).text('Male', x + 72, cy, { lineBreak: false });
  if (gender === 'male' || gender === 'm') drawCheckmark(doc, x + 60, cy);
  doc.rect(x + 110, cy, 8, 8).stroke();
  doc.font(FONT_REG).fontSize(8).text('Female', x + 122, cy, { lineBreak: false });
  if (gender === 'female' || gender === 'f') drawCheckmark(doc, x + 110, cy);
  cy += 14;

  return cy;
}

function drawPhysicianSection(doc, x, y, w, physician, erTreated, hospitalized) {
  drawSectionHeader(doc, x, y, w, 'Information about the physician or other health care professional');
  let cy = y + 22;

  drawLabeledLine(doc, x, cy, '6)  Name of physician or other health care professional', physician?.name || '', { width: w });
  cy += 28;

  doc.font(FONT_BOLD).fontSize(8).fillColor('#000000');
  doc.text('7)  If treatment was given away from the worksite, where was it given?', x, cy, { width: w, lineBreak: false, ellipsis: true });
  cy += 12;
  drawLabeledLine(doc, x, cy, 'Facility', physician?.facility_name || '', { width: w });
  cy += 26;
  drawLabeledLine(doc, x, cy, 'Address', physician?.facility_address || '', { width: w });
  cy += 28;

  doc.font(FONT_BOLD).fontSize(8).fillColor('#000000');
  doc.text('8)  Was employee treated in an emergency room?', x, cy, { width: w, lineBreak: false });
  drawYesNo(doc, x + w - 80, cy - 2, erTreated);
  cy += 18;

  doc.font(FONT_BOLD).fontSize(8).fillColor('#000000');
  doc.text('9)  Was employee hospitalized overnight as an in-patient?', x, cy, { width: w, lineBreak: false });
  drawYesNo(doc, x + w - 80, cy - 2, hospitalized);
  cy += 14;

  return cy;
}

function drawCaseSection(doc, x, y, w, caseInfo) {
  drawSectionHeader(doc, x, y, w, 'Information about the case');
  let cy = y + 18;

  // Compact two-column row for 10) + 11) so the long form fits on 1 page.
  doc.font(FONT_BOLD).fontSize(8).fillColor('#000000');
  doc.text('10)  Case number from the Log', x, cy, { lineBreak: false });
  doc.font(FONT_REG).fontSize(9);
  doc.text(caseInfo.case_number != null ? String(caseInfo.case_number) : '', x + 165, cy, { width: 80, lineBreak: false });
  doc.font(FONT_BOLD).fontSize(8);
  doc.text('11)  Date of injury or illness', x + 260, cy, { lineBreak: false });
  drawDateBoxes(doc, x + 390, cy - 2, caseInfo.event_date);
  cy += 22;

  // 12 / 13 time fields on one row.
  const t12 = fmtTime(caseInfo.time_began_work);
  const t13 = fmtTime(caseInfo.event_date);
  doc.font(FONT_BOLD).fontSize(8).fillColor('#000000');
  doc.text('12)  Time employee began work', x, cy, { lineBreak: false });
  doc.font(FONT_REG).fontSize(9);
  doc.text(t12.hhmm || '—', x + 150, cy, { lineBreak: false });
  doc.text(t12.ampm, x + 195, cy, { lineBreak: false });
  doc.font(FONT_BOLD).fontSize(8);
  doc.text('13)  Time of event', x + 260, cy, { lineBreak: false });
  doc.font(FONT_REG).fontSize(9);
  doc.text(t13.hhmm || '—', x + 380, cy, { lineBreak: false });
  doc.text(t13.ampm, x + 420, cy, { lineBreak: false });
  cy += 14;

  // PII reminder per the official form, fields 14-17.
  doc.font(FONT_REG).fontSize(7).fillColor('#444444');
  doc.text(
    'Re fields 14 to 17: Please do not include any personally identifiable information (PII) pertaining ' +
    'to worker(s) involved in the incident (e.g., no names, phone numbers, or Social Security numbers).',
    x, cy, { width: w, lineBreak: false, ellipsis: true }
  );
  cy += 14;

  drawWrappedField(doc, x, cy,
    '14)  What was the employee doing just before the incident occurred?',
    caseInfo.activity_before || '',
    { width: w, height: 24 });
  cy += 40;

  drawWrappedField(doc, x, cy,
    '15)  What happened?',
    caseInfo.what_happened || caseInfo.description || '',
    { width: w, height: 28 });
  cy += 44;

  drawWrappedField(doc, x, cy,
    '16)  What was the injury or illness? Tell us the part of the body that was affected and how.',
    caseInfo.injury_summary || '',
    { width: w, height: 24 });
  cy += 40;

  drawWrappedField(doc, x, cy,
    '17)  What object or substance directly harmed the employee?',
    caseInfo.object_substance || '',
    { width: w, height: 18 });
  cy += 34;

  // 18) Date of death
  doc.font(FONT_BOLD).fontSize(8).fillColor('#000000');
  doc.text('18)  If the employee died, when did death occur?', x, cy, { lineBreak: false });
  drawDateBoxes(doc, x + 220, cy - 2, caseInfo.date_of_death);
  cy += 22;

  return cy;
}

function drawCompletedBy(doc, x, y, w, completedBy) {
  drawSectionHeader(doc, x, y, w, 'Completed by');
  let cy = y + 18;
  // Two compact two-column rows: Name + Title; Phone + Date.
  const half = (w - 12) / 2;
  drawLabeledLine(doc, x, cy, 'Name',  completedBy?.name  || '', { width: half });
  drawLabeledLine(doc, x + half + 12, cy, 'Title', completedBy?.title || '', { width: half });
  cy += 24;
  drawLabeledLine(doc, x, cy, 'Phone', completedBy?.phone || '', { width: half });
  doc.font(FONT_BOLD).fontSize(8).fillColor('#000000');
  doc.text('Date', x + half + 12, cy, { lineBreak: false });
  drawDateBoxes(doc, x + half + 12 + 32, cy - 2, completedBy?.date || new Date().toISOString().slice(0, 10));
  cy += 22;
  return cy;
}

/**
 * Stream the OSHA Form 301 PDF for one incident to `res`.
 *
 *   renderOsha301Pdf(res, {
 *     incidentNumber, year, caseNumber,
 *     employee: { name, address, dob, hire_date, gender },
 *     physician: { name, facility_name, facility_address },
 *     erTreated, hospitalized,
 *     case: { event_date, time_began_work, activity_before, what_happened,
 *             description, injury_summary, object_substance, date_of_death },
 *     completedBy: { name, title, phone, date },
 *   })
 *
 * The route layer sets Content-Type / Content-Disposition before calling.
 */
export function renderOsha301Pdf(res, payload) {
  const doc = new PDFDocument(PAGE_OPTS);
  doc.pipe(res);

  drawHeader(doc, {
    incidentNumber: payload.incidentNumber,
    year: payload.year,
    orgLogoPath: payload.orgLogoPath || null,
  });

  let y = 140;

  // Single-column letter-portrait layout — the official form fits on one
  // page so we honor that. Sections stack vertically.
  y = drawEmployeeSection(doc, COL_LEFT_X, y, USABLE_W, payload.employee);
  y += 8;
  y = drawPhysicianSection(doc, COL_LEFT_X, y, USABLE_W, payload.physician, payload.erTreated, payload.hospitalized);
  y += 8;
  y = drawCaseSection(doc, COL_LEFT_X, y, USABLE_W, {
    case_number: payload.caseNumber,
    event_date: payload.case?.event_date,
    time_began_work: payload.case?.time_began_work,
    activity_before: payload.case?.activity_before,
    what_happened: payload.case?.what_happened,
    description: payload.case?.description,
    injury_summary: payload.case?.injury_summary,
    object_substance: payload.case?.object_substance,
    date_of_death: payload.case?.date_of_death,
  });
  y += 8;
  drawCompletedBy(doc, COL_LEFT_X, y, USABLE_W, payload.completedBy);

  drawFooter(doc);
  doc.end();
}
