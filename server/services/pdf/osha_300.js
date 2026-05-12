// server/services/pdf/osha_300.js — OSHA Form 300 (Rev. 04/2004) PDF renderer.
//
// Renders the "Log of Work-Related Injuries and Illnesses" per 29 CFR 1904.29.
// Reads `osha_300_log` rows + site / org context already loaded by the route.
//
// Layout reference: OSHA-RK-Forms-Package.pdf, Form 300 page.
// Column source: 29 CFR 1904.29(b)(1)+(7) (privacy concern cases — substitute
// "privacy case" for the employee's name).
//
// Form 300 is a 13-column landscape grid:
//   Step 1 — Identify the person
//     (A) Case no.   (B) Employee's name   (C) Job title
//   Step 2 — Describe the case
//     (D) Date of injury / onset of illness (month/day)
//     (E) Where the event occurred
//     (F) Describe injury or illness, body parts, object/substance
//   Step 3 — Classify the case (check exactly one G..J)
//     (G) Death  (H) Days away from work  (I) Job transfer or restriction
//     (J) Other recordable cases
//   Step 4 — Enter the number of days
//     (K) Away from work (days)  (L) On job transfer or restriction (days)
//   Step 5 — Select one column M:
//     (M1) Injury  (M2) Skin disorder  (M3) Respiratory condition
//     (M4) Poisoning  (M5) Hearing loss  (M6) All other illnesses
//
// First PDF chunk on this project — pdfkit landed here so WI-02/03/09 reuse it.

import PDFDocument from 'pdfkit';
import { embedOrgLogo } from './logo.js';

// US Letter landscape, 0.4" margins. Gives ~10.2" usable width for the column
// grid which is what the official form fits into.
//
// `bottom: 0` is intentional: every text() call is placed at an absolute (x,y)
// and constrained by an explicit `height` + `lineBreak: false`. With a
// non-zero bottom margin pdfkit's internal cursor logic spawns a fresh page
// every time doc.y crosses `page.height - margins.bottom`, even though we're
// not actually overflowing the page bounds. Setting bottom=0 disables that
// auto-pagination — we manage pages explicitly via doc.addPage() in
// renderOsha300Pdf.
const PAGE_OPTS = {
  layout: 'landscape',
  size: 'LETTER',
  margins: { top: 28, bottom: 0, left: 28, right: 28 },
};

// Column widths (points) — sum must equal usable width (~10.2 inches = 734 pt).
// Tuned to roughly match the official form proportions: wide F (description),
// medium B/C/E, narrow G..J/M1..M6 checkbox cells, narrow numeric K/L.
const COLS = [
  { key: 'A',  label: 'Case\nno.',                width:  32, align: 'center' },
  { key: 'B',  label: "Employee's name",          width:  90, align: 'left'   },
  { key: 'C',  label: 'Job title',                width:  72, align: 'left'   },
  { key: 'D',  label: 'Date of\ninjury/illness',  width:  46, align: 'center' },
  { key: 'E',  label: 'Where the event occurred', width:  82, align: 'left'   },
  { key: 'F',  label: 'Describe injury/illness',  width: 160, align: 'left'   },
  { key: 'G',  label: 'Death',                    width:  26, align: 'center' },
  { key: 'H',  label: 'Days\naway',               width:  26, align: 'center' },
  { key: 'I',  label: 'Job\ntransfer',            width:  26, align: 'center' },
  { key: 'J',  label: 'Other',                    width:  26, align: 'center' },
  { key: 'K',  label: 'Days\naway',               width:  28, align: 'center' },
  { key: 'L',  label: 'Days\nrestr.',             width:  28, align: 'center' },
  { key: 'M1', label: 'Inj.',                     width:  20, align: 'center' },
  { key: 'M2', label: 'Skin',                     width:  20, align: 'center' },
  { key: 'M3', label: 'Resp.',                    width:  20, align: 'center' },
  { key: 'M4', label: 'Pois.',                    width:  20, align: 'center' },
  { key: 'M5', label: 'Hear.',                    width:  20, align: 'center' },
  { key: 'M6', label: 'Other',                    width:  20, align: 'center' },
];

const HEADER_HEIGHT  = 36;   // column-header band height
const ROW_HEIGHT     = 32;   // body row height
const TOTALS_HEIGHT  = 18;   // page-totals strip height
// Tuned so header (28..104) + grid header + rows + totals + footer fits inside
// US-Letter landscape (612pt tall) without triggering pdfkit auto-pagination.
const ROWS_PER_PAGE  = 12;
const FONT_REG       = 'Helvetica';
const FONT_BOLD      = 'Helvetica-Bold';

// Map a 300-log row's classification booleans → which Step-3 column gets the X.
function classifyMark(e) {
  if (e.classification_death) return 'G';
  if (e.classification_days_away) return 'H';
  if (e.classification_job_transfer) return 'I';
  if (e.classification_other) return 'J';
  return null;
}

// Map injury_type → which Step-5 (M1..M6) column gets the X. Mirrors the
// buckets in services/osha_300_helpers.js (column M values it produces).
const M_BUCKETS = {
  injury:              'M1',
  skin_disorder:       'M2',
  respiratory:         'M3',
  poisoning:           'M4',
  hearing_loss:        'M5',
  all_other_illness:   'M6',
};

// Format injury_date as "month/day" to match Form 300 column D wording.
function formatDateMD(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 29 CFR 1904.29(b)(7): when is_privacy_case=1, "privacy case" goes in column
// B and column C must be blank (the route layer already substitutes; this
// helper is defensive in case the renderer is called directly).
function applyPrivacy(entry) {
  if (entry.is_privacy_case) {
    return { ...entry, employee_name: 'Privacy Case', job_title: '' };
  }
  return entry;
}

function drawGridHeader(doc, x0, y, totalWidth) {
  // Top "Step 1..5" band: a single dark-tinted strip describing the column
  // groupings, matching the official Form 300 visual hierarchy.
  doc.save();
  doc.lineWidth(0.5).strokeColor('#000000');
  doc.font(FONT_BOLD).fontSize(6.5).fillColor('#000000');

  // Column-header row (the per-column labels).
  let cx = x0;
  doc.rect(x0, y, totalWidth, HEADER_HEIGHT).fillAndStroke('#F2F2F2', '#000000');
  doc.fillColor('#000000');

  for (const col of COLS) {
    doc.rect(cx, y, col.width, HEADER_HEIGHT).stroke();
    // height + lineBreak:false prevent text from triggering pdfkit
    // auto-pagination when a header label is taller than the cell.
    doc.text(
      `(${col.key}) ${col.label}`,
      cx + 2,
      y + 3,
      { width: col.width - 4, height: HEADER_HEIGHT - 6, align: 'center', lineGap: 0, ellipsis: true, lineBreak: false }
    );
    cx += col.width;
  }
  doc.restore();
}

function drawRow(doc, x0, y, entry, totalWidth) {
  doc.save();
  doc.lineWidth(0.4).strokeColor('#000000');
  doc.font(FONT_REG).fontSize(7).fillColor('#000000');

  // Outer rectangle + per-column vertical separators.
  doc.rect(x0, y, totalWidth, ROW_HEIGHT).stroke();

  const e = applyPrivacy(entry);
  const classMark = classifyMark(e);
  const mMark = M_BUCKETS[e.injury_type] || null;

  // Map column key → printable value.
  const valueFor = (key) => {
    switch (key) {
      case 'A':  return e.case_number ?? '';
      case 'B':  return e.employee_name || '';
      case 'C':  return e.job_title || '';
      case 'D':  return formatDateMD(e.injury_date);
      case 'E':  return e.location || '';
      case 'F':  return e.description || '';
      case 'G':  return classMark === 'G' ? 'X' : '';
      case 'H':  return classMark === 'H' ? 'X' : '';
      case 'I':  return classMark === 'I' ? 'X' : '';
      case 'J':  return classMark === 'J' ? 'X' : '';
      case 'K':  return e.days_away_count > 0 ? String(e.days_away_count) : '';
      case 'L':  return e.days_restricted_count > 0 ? String(e.days_restricted_count) : '';
      case 'M1': return mMark === 'M1' ? 'X' : '';
      case 'M2': return mMark === 'M2' ? 'X' : '';
      case 'M3': return mMark === 'M3' ? 'X' : '';
      case 'M4': return mMark === 'M4' ? 'X' : '';
      case 'M5': return mMark === 'M5' ? 'X' : '';
      case 'M6': return mMark === 'M6' ? 'X' : '';
      default:   return '';
    }
  };

  let cx = x0;
  for (const col of COLS) {
    if (cx > x0) {
      doc.moveTo(cx, y).lineTo(cx, y + ROW_HEIGHT).stroke();
    }
    const v = valueFor(col.key);
    if (v !== '') {
      // Step-3 / Step-5 X marks rendered bigger + centered.
      const isMark = v === 'X';
      doc.font(isMark ? FONT_BOLD : FONT_REG)
         .fontSize(isMark ? 10 : 6.5);
      // ellipsis + height keep long descriptions from wrapping past the
      // row bottom (which would trigger pdfkit auto-pagination).
      doc.text(
        String(v),
        cx + 2,
        y + (isMark ? (ROW_HEIGHT - 11) / 2 : 2),
        { width: col.width - 4, align: col.align, lineGap: 0, height: ROW_HEIGHT - 4, ellipsis: true }
      );
    }
    cx += col.width;
  }
  doc.restore();
}

function drawTotalsRow(doc, x0, y, totals, totalWidth) {
  doc.save();
  doc.lineWidth(0.5).strokeColor('#000000');
  doc.rect(x0, y, totalWidth, TOTALS_HEIGHT).fillAndStroke('#F2F2F2', '#000000');
  doc.fillColor('#000000').font(FONT_BOLD).fontSize(7);

  let cx = x0;
  const numericFor = (key) => {
    switch (key) {
      case 'G':  return totals.G || 0;
      case 'H':  return totals.H || 0;
      case 'I':  return totals.I || 0;
      case 'J':  return totals.J || 0;
      case 'K':  return totals.K || 0;
      case 'L':  return totals.L || 0;
      case 'M1': return totals.M1 || 0;
      case 'M2': return totals.M2 || 0;
      case 'M3': return totals.M3 || 0;
      case 'M4': return totals.M4 || 0;
      case 'M5': return totals.M5 || 0;
      case 'M6': return totals.M6 || 0;
      default:   return null;
    }
  };

  for (const col of COLS) {
    if (cx > x0) {
      doc.moveTo(cx, y).lineTo(cx, y + TOTALS_HEIGHT).stroke();
    }
    const n = numericFor(col.key);
    if (n !== null) {
      doc.text(String(n), cx + 2, y + 4, {
        width: col.width - 4, align: 'center', height: TOTALS_HEIGHT - 2, lineGap: 0, ellipsis: true,
      });
    } else if (col.key === 'F') {
      doc.text('Page totals ▶', cx + 2, y + 4, {
        width: col.width - 4, align: 'right', height: TOTALS_HEIGHT - 2, lineGap: 0,
      });
    }
    cx += col.width;
  }
  doc.restore();
}

// Build the row-level totals for the Step-3, Step-4, Step-5 columns (the only
// ones that have totals on Form 300).
function computeTotals(entries) {
  const t = { G:0, H:0, I:0, J:0, K:0, L:0, M1:0, M2:0, M3:0, M4:0, M5:0, M6:0 };
  for (const raw of entries) {
    const e = applyPrivacy(raw);
    if (e.classification_death) t.G += 1;
    if (e.classification_days_away) t.H += 1;
    if (e.classification_job_transfer) t.I += 1;
    if (e.classification_other) t.J += 1;
    t.K += Number(e.days_away_count) || 0;
    t.L += Number(e.days_restricted_count) || 0;
    const m = M_BUCKETS[e.injury_type];
    if (m) t[m] += 1;
  }
  return t;
}

function drawHeader(doc, { year, establishmentName, address, orgName, orgLogoPath }) {
  // Title block — matches the official "OSHA's Form 300 (Rev. 04/2004) — Log
  // of Work-Related Injuries and Illnesses" header.
  doc.font(FONT_BOLD).fontSize(11).fillColor('#000000');
  doc.text("OSHA's Form 300 (Rev. 04/2004)", 28, 28, { lineBreak: false });
  doc.font(FONT_BOLD).fontSize(14);
  doc.text('Log of Work-Related Injuries and Illnesses', 28, 44, { lineBreak: false });

  // Optional org logo, sized small enough not to compromise the 1904.29(b)(4)
  // equivalent-form claim (form-mandated text remains primary). Top-centre,
  // between the title block and the right-hand info column.
  embedOrgLogo(doc, orgLogoPath, 470, 26, 100, 38);

  doc.font(FONT_REG).fontSize(8).fillColor('#333333');
  doc.text(
    'Attention: This form contains information relating to employee health and must be used in a manner ' +
    'that protects the confidentiality of employees to the extent possible while the information is being ' +
    'used for occupational safety and health purposes.',
    28, 64, { width: 540, lineGap: 1, height: 26 }
  );

  // Right-hand info column — Year + establishment + address + org name.
  // Form 300 shows City + State separately; the schema stores a single
  // free-text address line on `sites.address`, so we render it as one block
  // here (Form 300 is "equivalent form" — 29 CFR 1904.29(b)(4) — so the
  // important thing is that the same info is present, not the exact split).
  const rightX = 580;
  doc.font(FONT_BOLD).fontSize(9).fillColor('#000000');
  doc.text(`Year ${year}`, rightX, 28, { lineBreak: false });
  doc.font(FONT_REG).fontSize(8);
  doc.text(`Establishment name: ${establishmentName || '—'}`, rightX, 44, { width: 220, height: 12, lineBreak: false, ellipsis: true });
  doc.text(`Address: ${address || '—'}`, rightX, 56, { width: 220, height: 12, lineBreak: false, ellipsis: true });
  if (orgName) doc.text(`Organization: ${orgName}`, rightX, 76, { width: 220, height: 12, lineBreak: false, ellipsis: true });

  // Form OMB stamp — mirrored from the official form's footer.
  doc.font(FONT_REG).fontSize(7).fillColor('#666666');
  doc.text('U.S. Department of Labor — Occupational Safety and Health Administration · Form approved OMB no. 1218-0176',
    28, 92, { width: 760, lineBreak: false });
}

function drawFooter(doc, pageIndex, pageCount) {
  // Page X of Y at bottom-center; reminder to transfer totals to Form 300A.
  const pageWidth = doc.page.width;
  const y = doc.page.height - 20;
  doc.font(FONT_REG).fontSize(7).fillColor('#444444');
  // lineBreak:false + tight height keep these lines from pushing pdfkit's
  // internal cursor past the bottom margin (which would force a new page).
  doc.text(
    'Be sure to transfer these totals to the Summary page (Form 300A) before you post it.',
    28, y, { width: pageWidth - 56, align: 'center', lineBreak: false }
  );
  doc.text(
    `Page ${pageIndex + 1} of ${pageCount}`,
    28, y + 9, { width: pageWidth - 56, align: 'center', lineBreak: false }
  );
}

/**
 * Stream the OSHA Form 300 PDF to the given writable response (`res`).
 *
 *   renderOsha300Pdf(res, {
 *     year,                  // 4-digit calendar year
 *     entries,               // osha_300_log rows (privacy-substituted)
 *     site: { name, city, state, establishment_id, address },
 *     orgName,               // organization display name (for the header)
 *   })
 *
 * The route layer is responsible for setting Content-Type / Content-Disposition
 * before calling this (so error responses can stay JSON when prep fails).
 */
export function renderOsha300Pdf(res, { year, entries, site, orgName, orgLogoPath }) {
  const doc = new PDFDocument(PAGE_OPTS);
  doc.pipe(res);

  const safeEntries = (entries || []).map(applyPrivacy);
  const pageCount = Math.max(1, Math.ceil(safeEntries.length / ROWS_PER_PAGE));
  const totals = computeTotals(safeEntries);

  const x0 = 28;
  const totalWidth = COLS.reduce((s, c) => s + c.width, 0);

  for (let p = 0; p < pageCount; p++) {
    if (p > 0) doc.addPage(PAGE_OPTS);
    drawHeader(doc, {
      year,
      establishmentName: site?.name || (site?.establishment_id ? `Establishment ${site.establishment_id}` : ''),
      address: site?.address || '',
      orgName,
      orgLogoPath,
    });

    const gridTop = 110;
    drawGridHeader(doc, x0, gridTop, totalWidth);

    const slice = safeEntries.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE);
    for (let r = 0; r < ROWS_PER_PAGE; r++) {
      const rowY = gridTop + HEADER_HEIGHT + r * ROW_HEIGHT;
      const entry = slice[r] || { case_number: '' };
      drawRow(doc, x0, rowY, entry, totalWidth);
    }

    // Per-form convention, totals print only on the final page.
    if (p === pageCount - 1) {
      const totalsY = gridTop + HEADER_HEIGHT + ROWS_PER_PAGE * ROW_HEIGHT + 2;
      drawTotalsRow(doc, x0, totalsY, totals, totalWidth);
    }

    drawFooter(doc, p, pageCount);
  }

  doc.end();
}
