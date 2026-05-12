// server/services/pdf/safework_nsw.js — WI-06 SafeWork NSW notifiable
// incident record copy.
//
// Per owner directive (2026-05-12):
//   • Government-document styling. NO SafeWork NSW logo, NO impersonation
//     of an official regulator form. Plain Helvetica, monochrome rule
//     lines, conservative type. The header reads "Notifiable Incident
//     Record (Internal Record Copy)" so an inspector cannot mistake this
//     PDF for the actual regulator-issued submission receipt.
//   • Footer carries an explicit disclaimer: notifications to SafeWork
//     NSW are submitted via the regulator's phone line (13 10 50) or
//     online portal (notifyform.safework.nsw.gov.au); this PDF is the
//     organisation's internal record copy of what was notified.
//   • Verbatim Act labels for every s.36 / s.37 sub-category are pulled
//     from the seeded lookup tables so the PDF can never drift from the
//     Act wording.
//
// Architecture: mirrors services/pdf/generic_incident.js — pdfkit with
// margins.bottom:0, lineBreak:false on every text() call, manual
// pagination via nextPageIfNeeded(). The osha_300a renderer's section-
// banner styling is reused for the WHS Act section dividers.
//
// US-Letter portrait is intentional — every other PDF the platform emits
// is Letter; mixing Letter + A4 would surprise the operator. The Act
// itself doesn't prescribe a form layout (s.38 says "by telephone OR in
// writing" with no further constraint), so the format is the
// organisation's choice.

import PDFDocument from 'pdfkit';
import { embedOrgLogo } from './logo.js';

const PAGE_OPTS = {
  layout: 'portrait',
  size: 'LETTER',
  margins: { top: 36, bottom: 0, left: 36, right: 36 },
};

const FONT_REG  = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';
const FONT_ITAL = 'Helvetica-Oblique';

const PAGE_W = 612;
const PAGE_H = 792;
const USABLE_W = PAGE_W - 72;
const LEFT_X = 36;

const FOOTER_RESERVE = 78;   // larger than the generic renderer because the
                             // s.38 disclaimer + submission-channel note
                             // run to three lines.

const INTERNAL_TITLE = 'Notifiable Incident Record';
const INTERNAL_SUBTITLE = 'Internal record copy — Work Health and Safety Act 2011 (NSW), Part 3';

// Submission channels surfaced in the footer. SafeWork NSW phone line +
// online portal per current SafeWork NSW guidance. These are not the
// Act itself; they're operational channels the regulator publishes.
const SUBMISSION_DISCLAIMER_LINE_1 =
  'Notifiable incidents are reported to SafeWork NSW by telephone (13 10 50) or online portal (notifyform.safework.nsw.gov.au).';
const SUBMISSION_DISCLAIMER_LINE_2 =
  'This document is the organisation’s internal record copy of the notification and is not a substitute for that submission.';

// Lookup table for s.39 site preservation. The keys mirror the CHECK
// constraint in migration 028; the labels include the Act paragraph
// reference verbatim so an inspector reading the PDF can map back to
// the Act without an external decoder.
const SITE_PRESERVATION_LABELS = {
  preserved: 'Preserved — site undisturbed pending inspector arrival',
  disturbed_to_assist_injured: 'Disturbed to assist an injured person (s.39(3)(a))',
  disturbed_to_remove_deceased: 'Disturbed to remove a deceased person (s.39(3)(b))',
  disturbed_to_make_safe: 'Disturbed to make the site safe / prevent further injury (s.39(3)(c))',
  disturbed_for_police: 'Disturbed for the purposes of a police investigation (s.39(3)(d))',
  disturbed_with_inspector_permission: 'Disturbed with inspector permission (s.39(3)(e))',
  released_by_inspector: 'Released by inspector — site preservation duty discharged',
};

// ---------------------------------------------------------------------------
// Low-level helpers — copied wholesale from generic_incident.js to keep
// the two renderers visually consistent.
// ---------------------------------------------------------------------------

function fmt(v) {
  if (v === null || v === undefined || v === '') return 'Not recorded';
  return String(v);
}

function fmtDate(iso) {
  if (!iso) return 'Not recorded';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toISOString().slice(0, 10);
}

function fmtDateTime(iso) {
  if (!iso) return 'Not recorded';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

function wrapLines(doc, text, width, font, fontSize) {
  if (!text) return [];
  doc.font(font).fontSize(fontSize);
  const paragraphs = String(text).split(/\r?\n/);
  const lines = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) { lines.push(''); continue; }
    let cur = '';
    for (const word of words) {
      const tentative = cur ? `${cur} ${word}` : word;
      if (doc.widthOfString(tentative) <= width) {
        cur = tentative;
      } else {
        if (cur) lines.push(cur);
        cur = word;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

function drawWrapped(doc, x, y, width, text, fontSize = 9, color = '#000000', font = FONT_REG) {
  const lineH = fontSize + 3;
  const lines = wrapLines(doc, text, width, font, fontSize);
  doc.font(font).fontSize(fontSize).fillColor(color);
  for (let i = 0; i < lines.length; i++) {
    doc.text(lines[i], x, y + i * lineH, { width, lineBreak: false });
  }
  return y + Math.max(lineH, lines.length * lineH);
}

function nextPageIfNeeded(doc, y, neededHeight, ctx) {
  if (y + neededHeight <= PAGE_H - FOOTER_RESERVE) return y;
  doc.addPage(PAGE_OPTS);
  ctx.pageIndex += 1;
  drawCompactHeader(doc, ctx);
  return 66;
}

function drawSectionHeader(doc, x, y, w, text, ctx) {
  y = nextPageIfNeeded(doc, y, 30, ctx);
  doc.save();
  doc.lineWidth(0.6).strokeColor('#000000');
  doc.rect(x, y, w, 16).fillAndStroke('#E8E8EE', '#000000');
  doc.fillColor('#000000').font(FONT_BOLD).fontSize(10);
  doc.text(text, x + 4, y + 4, { width: w - 8, lineBreak: false });
  doc.restore();
  return y + 18;
}

function drawFieldRow(doc, x, y, w, label, value, ctx) {
  y = nextPageIfNeeded(doc, y, 22, ctx);
  doc.save();
  doc.font(FONT_BOLD).fontSize(8).fillColor('#444444');
  doc.text(label, x, y, { width: w * 0.34, lineBreak: false, ellipsis: true });
  doc.font(FONT_REG).fontSize(9).fillColor('#000000');
  const valueX = x + w * 0.36;
  const valueW = w * 0.64;
  const lines = wrapLines(doc, fmt(value), valueW, FONT_REG, 9);
  for (let i = 0; i < lines.length; i++) {
    doc.text(lines[i], valueX, y + i * 12, { width: valueW, lineBreak: false });
  }
  doc.restore();
  return y + Math.max(14, lines.length * 12) + 2;
}

function drawCategoryBox(doc, x, y, w, label, checked) {
  doc.save();
  doc.lineWidth(0.5).strokeColor('#000000');
  doc.rect(x, y, 10, 10).stroke();
  if (checked) {
    // Draw the X mark with two line strokes (Helvetica Latin-1 doesn't
    // render U+2713 reliably; X is unambiguous and renders crisply).
    doc.moveTo(x + 1.5, y + 1.5).lineTo(x + 8.5, y + 8.5).stroke();
    doc.moveTo(x + 8.5, y + 1.5).lineTo(x + 1.5, y + 8.5).stroke();
  }
  doc.font(checked ? FONT_BOLD : FONT_REG).fontSize(9).fillColor('#000000');
  doc.text(label, x + 16, y, { width: w - 16, lineBreak: false, ellipsis: true });
  doc.restore();
  return y + 14;
}

function drawSubsectionLabel(doc, x, y, text, ctx) {
  y = nextPageIfNeeded(doc, y, 16, ctx);
  doc.font(FONT_BOLD).fontSize(8).fillColor('#444444');
  doc.text(text, x, y, { width: USABLE_W, lineBreak: false });
  return y + 12;
}

function drawSeparator(doc, x, y, w) {
  doc.save();
  doc.lineWidth(0.3).strokeColor('#CCCCCC');
  doc.moveTo(x, y).lineTo(x + w, y).stroke();
  doc.restore();
  return y + 4;
}

// ---------------------------------------------------------------------------
// Page chrome
// ---------------------------------------------------------------------------

function drawFirstPageHeader(doc, ctx) {
  const { orgName, notification, orgLogoPath } = ctx;
  doc.save();

  // Title block — left-aligned, conservative weight. The intention is
  // "professional internal document", not "regulator-issued
  // certificate". The org logo (if configured) embeds to the right of
  // the title block at a deliberately small size; the regulator's
  // identity is conveyed by the title text, not the logo.
  doc.font(FONT_BOLD).fontSize(14).fillColor('#000000');
  doc.text(INTERNAL_TITLE, LEFT_X, 36, { width: USABLE_W * 0.55, lineBreak: false });
  doc.font(FONT_REG).fontSize(8).fillColor('#444444');
  doc.text(INTERNAL_SUBTITLE, LEFT_X, 54, { width: USABLE_W * 0.55, lineBreak: false });

  // Logo slot between the title and the reference column (top-centre,
  // 40px tall). No-op when not configured.
  embedOrgLogo(doc, orgLogoPath, LEFT_X + USABLE_W * 0.56, 34, USABLE_W * 0.14, 38);

  // Right-side reference column — NSW number + event date stamped like
  // a control number on a government form.
  doc.font(FONT_BOLD).fontSize(9).fillColor('#000000');
  doc.text('Reference', LEFT_X + USABLE_W * 0.72, 36, { width: USABLE_W * 0.28, align: 'right', lineBreak: false });
  doc.font(FONT_REG).fontSize(11);
  doc.text(notification.nsw_number || '', LEFT_X + USABLE_W * 0.72, 48,
    { width: USABLE_W * 0.28, align: 'right', lineBreak: false });
  doc.font(FONT_BOLD).fontSize(7).fillColor('#444444');
  doc.text('Event date (UTC)', LEFT_X + USABLE_W * 0.72, 62, { width: USABLE_W * 0.28, align: 'right', lineBreak: false });
  doc.font(FONT_REG).fontSize(8);
  doc.text(fmtDateTime(notification.event_date), LEFT_X + USABLE_W * 0.72, 72,
    { width: USABLE_W * 0.28, align: 'right', lineBreak: false });

  // Organisation byline — small, under the title block.
  doc.font(FONT_BOLD).fontSize(8).fillColor('#444444');
  doc.text('Prepared by', LEFT_X, 76, { width: USABLE_W * 0.7, lineBreak: false });
  doc.font(FONT_REG).fontSize(9).fillColor('#000000');
  doc.text(orgName || 'Organisation', LEFT_X, 86, { width: USABLE_W * 0.7, lineBreak: false, ellipsis: true });

  // Thin rule under the header to separate it from the body.
  doc.lineWidth(0.6).strokeColor('#000000');
  doc.moveTo(LEFT_X, 104).lineTo(LEFT_X + USABLE_W, 104).stroke();

  doc.restore();
}

function drawCompactHeader(doc, ctx) {
  const { orgName, notification, pageIndex } = ctx;
  doc.save();
  doc.font(FONT_BOLD).fontSize(9).fillColor('#444444');
  doc.text(`${INTERNAL_TITLE} — ${notification.nsw_number}`, LEFT_X, 28,
    { width: USABLE_W * 0.75, lineBreak: false, ellipsis: true });
  doc.font(FONT_REG).fontSize(8).fillColor('#666666');
  doc.text(`${orgName || ''}  ·  Page ${pageIndex}`, LEFT_X, 28,
    { width: USABLE_W, align: 'right', lineBreak: false });
  doc.lineWidth(0.4).strokeColor('#CCCCCC');
  doc.moveTo(LEFT_X, 42).lineTo(LEFT_X + USABLE_W, 42).stroke();
  doc.restore();
}

function drawFooter(doc, generatedAt) {
  doc.save();
  const y = PAGE_H - 60;
  doc.lineWidth(0.4).strokeColor('#000000');
  doc.moveTo(LEFT_X, y).lineTo(LEFT_X + USABLE_W, y).stroke();

  doc.font(FONT_BOLD).fontSize(7).fillColor('#000000');
  doc.text('Submission channels — Work Health and Safety Act 2011 (NSW) s.38',
    LEFT_X, y + 6, { width: USABLE_W, lineBreak: false });

  doc.font(FONT_REG).fontSize(7).fillColor('#222222');
  doc.text(SUBMISSION_DISCLAIMER_LINE_1, LEFT_X, y + 17, { width: USABLE_W, lineBreak: false });
  doc.font(FONT_ITAL).fontSize(7).fillColor('#444444');
  doc.text(SUBMISSION_DISCLAIMER_LINE_2, LEFT_X, y + 28, { width: USABLE_W, lineBreak: false });

  doc.font(FONT_REG).fontSize(6).fillColor('#666666');
  doc.text(`Generated ${generatedAt}`, LEFT_X, y + 42, { width: USABLE_W, align: 'right', lineBreak: false });
  doc.restore();
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function sectionNotifyingEntity(doc, y, ctx) {
  const { notification, incident, site, orgName } = ctx;
  y = drawSectionHeader(doc, LEFT_X, y, USABLE_W, '1. Notifying entity (PCBU)', ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'Organisation',     orgName, ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'PCBU name',        notification.pcbu_name, ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'PCBU trading name', notification.pcbu_trading_name, ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'PCBU address',     notification.pcbu_address, ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'ABN',              notification.pcbu_abn, ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'ANZSIC code',      notification.pcbu_anzsic_code, ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'Worker count',
    notification.pcbu_worker_count != null ? String(notification.pcbu_worker_count) : null, ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'Site',             site?.name, ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'Site address',     site?.address, ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'Incident number (linked)', incident?.incident_number, ctx);
  return y + 6;
}

function sectionMinesPetroleumCarveout(doc, y, ctx) {
  // Only renders when the carve-out flag is set. When it is, the NSW
  // notification duty doesn't arise — but we still record the
  // determination so the audit trail is complete.
  const { notification } = ctx;
  if (!notification.excluded_mines_petroleum) return y;
  y = drawSectionHeader(doc, LEFT_X, y, USABLE_W, 'Determination — Mines & Petroleum exclusion', ctx);
  y = drawWrapped(doc, LEFT_X, y, USABLE_W,
    'This incident has been determined NOT NOTIFIABLE under the Work Health and Safety ' +
    'Act 2011 (NSW), Part 3, in accordance with the carve-outs at s.38(8) and s.39(4) ' +
    '(mines and petroleum sites are governed by the Work Health and Safety (Mines and ' +
    'Petroleum Sites) Act 2013 (NSW) instead).', 9, '#000000', FONT_REG);
  return y + 8;
}

function sectionS35Categories(doc, y, ctx) {
  const { notification } = ctx;
  y = drawSectionHeader(doc, LEFT_X, y, USABLE_W, '2. Notifiable category — WHS Act s.35', ctx);
  y = drawCategoryBox(doc, LEFT_X, y, USABLE_W, 'Death of a person (s.35(a))', !!notification.is_fatality);
  y = drawCategoryBox(doc, LEFT_X, y, USABLE_W, 'Serious injury or illness (s.35(b))', !!notification.is_serious_injury);
  y = drawCategoryBox(doc, LEFT_X, y, USABLE_W, 'Dangerous incident (s.35(c))', !!notification.is_dangerous_incident);
  return y + 4;
}

function sectionS36SubCategories(doc, y, ctx) {
  const { notification, seriousInjuryLookup } = ctx;
  if (!notification.is_serious_injury) return y;
  const subs = Array.isArray(notification.serious_injury_sub_categories)
    ? notification.serious_injury_sub_categories : [];
  y = drawSectionHeader(doc, LEFT_X, y, USABLE_W, '3. Serious injury / illness — WHS Act s.36', ctx);
  if (subs.length === 0) {
    y = drawWrapped(doc, LEFT_X, y, USABLE_W,
      'Top-level s.35(b) category is marked but no s.36 sub-category was selected. ' +
      'Update the notification with the specific s.36 paragraph before submission.',
      9, '#444444', FONT_ITAL);
    return y + 6;
  }
  for (const key of subs) {
    const row = seriousInjuryLookup.get(key);
    const label = row ? row.label : key;
    const section = row ? row.section_ref : '';
    y = nextPageIfNeeded(doc, y, 26, ctx);
    y = drawCategoryBox(doc, LEFT_X, y, USABLE_W, label, true);
    if (section) {
      doc.font(FONT_REG).fontSize(7).fillColor('#666666');
      doc.text(section, LEFT_X + 16, y, { width: USABLE_W - 16, lineBreak: false });
      y += 10;
    }
  }
  return y + 4;
}

function sectionS37SubCategories(doc, y, ctx) {
  const { notification, dangerousIncidentLookup } = ctx;
  if (!notification.is_dangerous_incident) return y;
  const subs = Array.isArray(notification.dangerous_incident_sub_categories)
    ? notification.dangerous_incident_sub_categories : [];
  y = drawSectionHeader(doc, LEFT_X, y, USABLE_W, '4. Dangerous incident — WHS Act s.37', ctx);
  if (subs.length === 0) {
    y = drawWrapped(doc, LEFT_X, y, USABLE_W,
      'Top-level s.35(c) category is marked but no s.37 sub-category was selected. ' +
      'Update the notification with the specific s.37 paragraph before submission.',
      9, '#444444', FONT_ITAL);
    return y + 6;
  }
  for (const key of subs) {
    const row = dangerousIncidentLookup.get(key);
    const label = row ? row.label : key;
    const section = row ? row.section_ref : '';
    y = nextPageIfNeeded(doc, y, 26, ctx);
    y = drawCategoryBox(doc, LEFT_X, y, USABLE_W, label, true);
    if (section) {
      doc.font(FONT_REG).fontSize(7).fillColor('#666666');
      doc.text(section, LEFT_X + 16, y, { width: USABLE_W - 16, lineBreak: false });
      y += 10;
    }
  }
  return y + 4;
}

function sectionNarrative(doc, y, ctx) {
  const { incident, primaryAffected } = ctx;
  y = drawSectionHeader(doc, LEFT_X, y, USABLE_W, '5. Incident narrative', ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'Incident title', incident?.title, ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'Area / location',
    [incident?.area, incident?.specific_location].filter(Boolean).join(' · ') || null, ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'Department', incident?.department, ctx);
  if (primaryAffected) {
    y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'Affected person',
      [primaryAffected.name, primaryAffected.job_title].filter(Boolean).join(' · ') || null, ctx);
  }
  if (incident?.description) {
    y = drawSubsectionLabel(doc, LEFT_X, y + 4, 'Description of what happened', ctx);
    y = nextPageIfNeeded(doc, y, 36, ctx);
    y = drawWrapped(doc, LEFT_X, y, USABLE_W, incident.description, 9, '#000000', FONT_REG);
  }
  if (incident?.immediate_actions_taken) {
    y = drawSubsectionLabel(doc, LEFT_X, y + 6, 'Immediate actions taken', ctx);
    y = drawWrapped(doc, LEFT_X, y, USABLE_W, incident.immediate_actions_taken, 9, '#000000', FONT_REG);
  }
  return y + 8;
}

function sectionSitePreservation(doc, y, ctx) {
  const { notification } = ctx;
  y = drawSectionHeader(doc, LEFT_X, y, USABLE_W, '6. Site preservation — WHS Act s.39', ctx);
  const statusLabel = notification.site_preservation_status
    ? (SITE_PRESERVATION_LABELS[notification.site_preservation_status] || notification.site_preservation_status)
    : null;
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'Status', statusLabel, ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'Inspector arrived', fmtDateTime(notification.inspector_arrived_at), ctx);
  if (notification.site_preservation_notes) {
    y = drawSubsectionLabel(doc, LEFT_X, y + 2, 'Notes', ctx);
    y = drawWrapped(doc, LEFT_X, y, USABLE_W, notification.site_preservation_notes, 9, '#000000', FONT_REG);
  }
  return y + 6;
}

function sectionNotificationLog(doc, y, ctx) {
  const { notification, phoneNotifierName, writtenSubmitterName } = ctx;
  y = drawSectionHeader(doc, LEFT_X, y, USABLE_W, '7. Notification log — WHS Act s.38', ctx);

  y = drawSubsectionLabel(doc, LEFT_X, y, 's.38(1)(3) Telephone notification ("immediately, by the fastest possible means")', ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'Phone notified at',  fmtDateTime(notification.phone_notified_at), ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'Logged by',          phoneNotifierName, ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'Regulator office',   notification.phone_regulator_office, ctx);
  if (notification.phone_notes) {
    y = drawSubsectionLabel(doc, LEFT_X, y + 2, 'Phone notes', ctx);
    y = drawWrapped(doc, LEFT_X, y, USABLE_W, notification.phone_notes, 9, '#000000', FONT_REG);
  }

  y = drawSeparator(doc, LEFT_X, y + 4, USABLE_W);

  y = drawSubsectionLabel(doc, LEFT_X, y + 4, 's.38(4)(b) Written notice (only when requested by the regulator; 48-hour clock)', ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'Regulator requested', fmtDateTime(notification.regulator_requested_written_at), ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'Written deadline',    fmtDateTime(notification.written_deadline), ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'Written submitted at', fmtDateTime(notification.written_submitted_at), ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'Submitted by',        writtenSubmitterName, ctx);
  y = drawFieldRow(doc, LEFT_X, y, USABLE_W, 'Regulator reference', notification.written_reference, ctx);
  if (notification.written_notes) {
    y = drawSubsectionLabel(doc, LEFT_X, y + 2, 'Written notes', ctx);
    y = drawWrapped(doc, LEFT_X, y, USABLE_W, notification.written_notes, 9, '#000000', FONT_REG);
  }
  return y + 6;
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

/**
 * Stream the SafeWork NSW notification record-copy PDF to `res`.
 *
 *   payload = {
 *     orgName,
 *     notification,            // safework_nsw_notifications row, inflated
 *     incident,                // incidents row (used for narrative)
 *     site,                    // sites row (name + address)
 *     primaryAffected,         // optional affected_persons row, primary
 *     seriousInjuryTypes,      // array from listSeriousInjuryTypes()
 *     dangerousIncidentTypes,  // array from listDangerousIncidentTypes()
 *     phoneNotifierName,       // resolved users.name or null
 *     writtenSubmitterName,    // resolved users.name or null
 *     generatedAt,             // ISO string for the footer
 *   }
 *
 * The route layer sets Content-Type / Content-Disposition before
 * calling.
 */
export function renderSafeworkNswPdf(res, payload) {
  const doc = new PDFDocument(PAGE_OPTS);
  doc.pipe(res);

  // Lookup maps keyed by `key` so the section helpers can render
  // verbatim Act labels + section refs in O(1).
  const seriousInjuryLookup = new Map(
    (payload.seriousInjuryTypes || []).map(r => [r.key, r]),
  );
  const dangerousIncidentLookup = new Map(
    (payload.dangerousIncidentTypes || []).map(r => [r.key, r]),
  );

  const ctx = {
    orgName: payload.orgName || '',
    orgLogoPath: payload.orgLogoPath || null,
    notification: payload.notification,
    incident: payload.incident,
    site: payload.site,
    primaryAffected: payload.primaryAffected,
    seriousInjuryLookup,
    dangerousIncidentLookup,
    phoneNotifierName: payload.phoneNotifierName,
    writtenSubmitterName: payload.writtenSubmitterName,
    pageIndex: 1,
  };

  drawFirstPageHeader(doc, ctx);
  let y = 116;

  y = sectionMinesPetroleumCarveout(doc, y, ctx);
  y = sectionNotifyingEntity(doc, y, ctx);
  y = sectionS35Categories(doc, y, ctx);
  y = sectionS36SubCategories(doc, y, ctx);
  y = sectionS37SubCategories(doc, y, ctx);
  y = sectionNarrative(doc, y, ctx);
  y = sectionSitePreservation(doc, y, ctx);
  y = sectionNotificationLog(doc, y, ctx);

  drawFooter(doc, payload.generatedAt || new Date().toISOString().slice(0, 10));

  doc.end();
}
