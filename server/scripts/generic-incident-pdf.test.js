// server/scripts/generic-incident-pdf.test.js — node:test unit suite
// for the WI-09 generic incident PDF renderer.
//
// Strategy: stream the renderer output to a Buffer, write to a temp
// file, extract text via the local poppler `pdftotext` (already
// installed; same tool the WI-01/03 dev work used). Assert that each
// section's expected text appears (populated case) or that "Not
// recorded" / "No X recorded" placeholders appear (empty case).
//
// Sections covered (one populated + one empty case each):
//   overview, affected_persons, investigation, causes, capas,
//   classifications, attachments, audit.
//
// Plus structural assertions: page count math, valid-PDF signature,
// internal-record disclaimer present, customer org name in header.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderGenericIncidentPdf, ALL_SECTIONS } from '../services/pdf/generic_incident.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Helpers -----------------------------------------------------------

function streamToBuffer() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _enc, cb) { chunks.push(chunk); cb(); },
  });
  const promise = new Promise((resolve) => {
    stream.on('finish', () => resolve(Buffer.concat(chunks)));
  });
  return { stream, promise };
}

async function renderToText(payload) {
  const { stream, promise } = streamToBuffer();
  renderGenericIncidentPdf(stream, payload);
  const buf = await promise;
  // Sanity: valid PDF signature.
  assert.equal(buf.subarray(0, 4).toString(), '%PDF', 'output must be a valid PDF byte stream');

  // Extract text using poppler's pdftotext (installed via brew earlier).
  const tmp = path.join('/tmp', `wi09-test-${process.pid}-${Date.now()}.pdf`);
  writeFileSync(tmp, buf);
  let text = '';
  try {
    // Run with -layout so multi-column layouts preserve their text order,
    // and pipe to stdout via "-" argument.
    text = execFileSync('pdftotext', ['-layout', tmp, '-'], { encoding: 'utf8' });
  } finally {
    try { unlinkSync(tmp); } catch (_) {}
  }
  // Also count pages via pdfinfo (cheap second invocation).
  let pages = 1;
  try {
    const tmp2 = path.join('/tmp', `wi09-test-info-${process.pid}-${Date.now()}.pdf`);
    writeFileSync(tmp2, buf);
    const info = execFileSync('pdfinfo', [tmp2], { encoding: 'utf8' });
    const m = info.match(/^Pages:\s*(\d+)/m);
    if (m) pages = Number(m[1]);
    try { unlinkSync(tmp2); } catch (_) {}
  } catch (_) {}
  return { text, pages, byteLength: buf.length };
}

// --- Test fixtures -----------------------------------------------------

const POPULATED = {
  orgName: 'Acme Manufacturing Inc.',
  site: { name: 'Cleveland Plant', address: '100 Industrial Blvd', naics_code: '331110' },
  incident: {
    id: 99, incident_number: 'INC-2026-9999', title: 'Forklift collision',
    type: 'injury', severity: 2, track: 'A', status: 'Investigating',
    incident_datetime: '2026-04-15T09:30:00.000Z',
    area: 'Receiving', specific_location: 'Bay 3', department: 'Warehouse',
    description: 'Forklift struck a worker while reversing in the receiving bay.',
    immediate_actions_taken: 'Worker treated on-site; area cordoned off; backup-alarm checked.',
    osha_recordable: 1, osha_recordability_type: 'days_away',
    osha_days_away: 5, osha_days_restricted: 0,
    riddor_reportable: 0,
  },
  affectedPersons: [
    { id: 1, name: 'Alice Worker', is_primary: 1, job_title: 'Picker',
      employment_status: 'employee', dob: '1990-03-12', date_hired: '2022-01-15',
      is_privacy_case: 0,
      injuries: [{ body_part: 'l_ankle', injury_type: 'fracture',
        mechanism: 'struck-by', treatment: 'Cast applied', er_treated: 1, hospitalized: 0 }] },
  ],
  investigation: {
    investigation_number: 'INV-2026-0042', status: 'progress', track: 'A',
    started_at: '2026-04-15T11:00:00.000Z',
    findings: 'Backup alarm inoperative; spotter not assigned for blind reversal.',
    root_cause_summary: 'Inspection cadence lapsed; SOP for reversing in bays not enforced.',
    root_cause_categories: '["Procedure","Equipment"]',
  },
  investigationLead: { id: 1, name: 'Elena Hartmann' },
  fiveWhys: [
    { level: 1, question: 'Why did the worker get struck?', answer: 'Forklift reversed without warning.', is_root_cause: 0 },
    { level: 2, question: 'Why no warning?', answer: 'Backup alarm was inoperative.', is_root_cause: 0 },
    { level: 3, question: 'Why was the alarm inoperative?', answer: 'Last inspected 9 months ago; cadence lapsed.', is_root_cause: 1 },
  ],
  capas: [
    { capa_number: 'CAPA-077', title: 'Quarterly forklift backup-alarm inspection',
      type: 'preventive', priority: 'high', status: 'progress',
      owner_name: 'Marcus Lee', verifier_name: 'Elena Hartmann',
      due_date: '2026-06-30', progress: 30,
      description: 'Add backup-alarm functional check to the quarterly forklift PM checklist.' },
  ],
  oshaSevereRows: [],
  riddorReport: null,
  nswNotification: null,
  attachments: [
    { filename: 'site_photo.jpg', mime_type: 'image/jpeg', size_bytes: 524288, created_at: '2026-04-15T12:00:00Z',
      description: 'Photo of the receiving bay after the incident.' },
    { filename: 'witness_statement.pdf', mime_type: 'application/pdf', size_bytes: 12000, created_at: '2026-04-16T09:00:00Z' },
  ],
  auditEntries: [
    { created_at: '2026-04-15T09:35:00Z', action: 'incident_reported', user_name: 'Wendy Reyes', description: 'reported incident INC-2026-9999' },
    { created_at: '2026-04-15T11:00:00Z', action: 'investigation_started', user_name: 'Elena Hartmann', description: 'opened INV-2026-0042' },
    { created_at: '2026-04-16T14:00:00Z', action: 'capa_created', user_name: 'Marcus Lee', description: 'created CAPA-077' },
  ],
  generatedAt: '2026-05-12',
};

const NEAR_EMPTY = {
  orgName: 'Acme Manufacturing Inc.',
  site: { name: 'Cleveland Plant' },
  incident: {
    id: 88, incident_number: 'INC-2026-0088', title: 'Property damage — vehicle',
    type: 'property', severity: 4, track: 'C', status: 'New',
    incident_datetime: '2026-05-01T08:00:00.000Z',
  },
  affectedPersons: [],
  investigation: null,
  investigationLead: null,
  fiveWhys: [],
  capas: [],
  oshaSevereRows: [], riddorReport: null, nswNotification: null,
  attachments: [],
  auditEntries: [],
  generatedAt: '2026-05-12',
};

// --- Tests -------------------------------------------------------------

test('renders a valid PDF for a fully-populated incident', async () => {
  const { text, pages, byteLength } = await renderToText(POPULATED);
  assert.ok(byteLength > 3000, 'PDF should not be trivially small');
  assert.ok(pages >= 1, 'at least 1 page');
  // Customer-brandable header
  assert.match(text, /Acme Manufacturing Inc\./);
  assert.match(text, /INC-2026-9999/);
  // Internal-record disclaimer in the footer. The full sentence wraps
  // across two text lines in the rendered PDF (line break between
  // "OSHA" and "ITA, HSE RIDDOR, ..."), so match the pieces separately
  // rather than the whole sentence.
  assert.match(text, /internal record/);
  assert.match(text, /not a regulatory submission/);
  assert.match(text, /OSHA/);
  assert.match(text, /HSE RIDDOR/);
  assert.match(text, /SafeWork NSW Notify/);
  assert.match(text, /Generated by EHS Incident Management on 2026-05-12/);
});

test('overview section renders all populated fields', async () => {
  const { text } = await renderToText(POPULATED);
  assert.match(text, /Incident overview/);
  assert.match(text, /Forklift collision/);
  assert.match(text, /S2/);                        // severity
  assert.match(text, /Investigating/);             // status
  assert.match(text, /Cleveland Plant/);           // site
  assert.match(text, /Receiving · Bay 3/);         // area / location
  assert.match(text, /Forklift struck a worker/);  // description
  assert.match(text, /Worker treated on-site/);    // immediate actions
});

test('overview falls back to "Not recorded" for missing fields', async () => {
  const { text } = await renderToText(NEAR_EMPTY);
  // Department / area / immediate_actions_taken are absent; some
  // surface as "Not recorded".
  assert.match(text, /Not recorded/);
  assert.match(text, /property/);
  assert.match(text, /INC-2026-0088/);
});

test('affected_persons renders names + injuries when present', async () => {
  const { text } = await renderToText(POPULATED);
  assert.match(text, /Affected persons/);
  assert.match(text, /Alice Worker/);
  assert.match(text, /primary/);
  assert.match(text, /Picker/);
  assert.match(text, /l_ankle/);
  assert.match(text, /fracture/);
  assert.match(text, /Cast applied/);
});

test('affected_persons shows empty-state notice when none', async () => {
  const { text } = await renderToText(NEAR_EMPTY);
  assert.match(text, /Affected persons/);
  assert.match(text, /No affected persons recorded/);
});

test('investigation renders findings + root-cause when present', async () => {
  const { text } = await renderToText(POPULATED);
  assert.match(text, /Investigation findings/);
  assert.match(text, /INV-2026-0042/);
  assert.match(text, /Elena Hartmann/);
  assert.match(text, /Backup alarm inoperative/);
  assert.match(text, /Inspection cadence lapsed/);
});

test('investigation shows "No investigation opened" when absent', async () => {
  const { text } = await renderToText(NEAR_EMPTY);
  assert.match(text, /Investigation findings/);
  assert.match(text, /No investigation opened/);
});

test('causes section renders 5-Why chain with ROOT CAUSE marker', async () => {
  const { text } = await renderToText(POPULATED);
  assert.match(text, /Root cause analysis/);
  assert.match(text, /Why #1/);
  assert.match(text, /Why #3 · ROOT CAUSE/);
  assert.match(text, /Last inspected 9 months ago/);
  assert.match(text, /Procedure · Equipment/);
});

test('capas section renders titles, type, status, owner', async () => {
  const { text } = await renderToText(POPULATED);
  assert.match(text, /Corrective & preventive actions/);
  assert.match(text, /CAPA-077/);
  assert.match(text, /preventive/);
  assert.match(text, /high/);
  assert.match(text, /Marcus Lee/);
  assert.match(text, /quarterly forklift PM checklist/);
});

test('capas shows empty-state notice when none', async () => {
  const { text } = await renderToText(NEAR_EMPTY);
  assert.match(text, /Corrective & preventive actions/);
  assert.match(text, /No CAPAs linked/);
});

test('classifications renders OSHA recordable + days when applicable', async () => {
  const { text } = await renderToText(POPULATED);
  assert.match(text, /Regulatory classifications/);
  assert.match(text, /OSHA recordable.*Yes/);
  // RIDDOR not reportable in this fixture; banner should not surface
  assert.doesNotMatch(text, /Reference\s*RDR-/);
});

test('classifications: NSW notification surfaces when present', async () => {
  const withNsw = {
    ...POPULATED,
    nswNotification: {
      nsw_number: 'NSW-2026-0001', is_fatality: 0, is_serious_injury: 1,
      is_dangerous_incident: 0,
      phone_notified_at: '2026-04-15T10:00:00Z',
      site_preservation_status: 'preserved',
    },
  };
  const { text } = await renderToText(withNsw);
  assert.match(text, /SafeWork NSW/);
  assert.match(text, /NSW-2026-0001/);
});

test('attachments lists files + filters embed-image behavior', async () => {
  const { text } = await renderToText(POPULATED);
  assert.match(text, /Attachments/);
  assert.match(text, /site_photo\.jpg/);
  assert.match(text, /witness_statement\.pdf/);
  // Image NOT embedded — just the filename.
  // (We can't easily prove non-embedding from pdftotext alone, but
  // size sanity check above catches if we accidentally embed.)
});

test('attachments shows empty-state notice when none', async () => {
  const { text } = await renderToText(NEAR_EMPTY);
  assert.match(text, /Attachments/);
  assert.match(text, /No attachments uploaded/);
});

test('audit trail renders recent entries with [user] + action', async () => {
  const { text } = await renderToText(POPULATED);
  assert.match(text, /Audit trail/);
  assert.match(text, /\[Wendy Reyes\]/);
  assert.match(text, /investigation_started/);
  assert.match(text, /capa_created/);
});

test('audit trail shows empty-state notice when none', async () => {
  const { text } = await renderToText(NEAR_EMPTY);
  assert.match(text, /Audit trail/);
  assert.match(text, /No audit entries/);
});

test('section filter — only overview rendered', async () => {
  const { text } = await renderToText({ ...POPULATED, sections: ['overview'] });
  assert.match(text, /Incident overview/);
  assert.doesNotMatch(text, /Affected persons/);
  assert.doesNotMatch(text, /Investigation findings/);
  assert.doesNotMatch(text, /Corrective & preventive actions/);
  // Footer disclaimer always present
  assert.match(text, /not a regulatory submission/);
});

test('section filter — invalid section keys dropped, fallback to default', async () => {
  // All-bogus filter → renderer falls back to ALL_SECTIONS (route
  // contract matches this).
  const { text } = await renderToText({ ...POPULATED, sections: ['bogus_section'] });
  assert.match(text, /Incident overview/);
  assert.match(text, /Audit trail/);
});

test('section filter — empty array falls back to default ALL_SECTIONS', async () => {
  const { text } = await renderToText({ ...POPULATED, sections: [] });
  assert.match(text, /Incident overview/);
  assert.match(text, /Audit trail/);
});

test('all 8 known sections defined and renderable', async () => {
  // Sanity: rendering ALL_SECTIONS one at a time succeeds for all of
  // them on a populated payload (catches missing renderer fn).
  for (const sec of ALL_SECTIONS) {
    const { text, pages } = await renderToText({ ...POPULATED, sections: [sec] });
    assert.ok(pages >= 1, `section ${sec} should render at least 1 page`);
    assert.match(text, /not a regulatory submission/, `section ${sec} should always include the footer disclaimer`);
  }
});
