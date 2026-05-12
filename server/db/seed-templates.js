// server/db/seed-templates.js — Seed ISO standard inspection templates.
//
// Seeds three ISO-aligned inspection templates (ISO 45001, ISO 14001, ISO 9001)
// for the first organization. Publishes each as v1 with version snapshots.
//
// Run: node server/db/seed-templates.js
// Re-run safe: skips if templates already exist for the org.

import db from './connection.js';

const orgRow = db.prepare('SELECT id FROM organizations ORDER BY id LIMIT 1').get();
if (!orgRow) { console.log('No organization found. Run seed.js first.'); process.exit(1); }
const orgId = orgRow.id;

const existing = db.prepare("SELECT COUNT(*) as c FROM templates WHERE org_id = ? AND name LIKE 'ISO %'").get(orgId).c;
if (existing > 0) {
  console.log(`Organization already has ${existing} ISO template(s). Skipping.`);
  process.exit(0);
}

const elenaRow = db.prepare("SELECT id FROM users WHERE email = 'elena@sdsmanager.com'").get();
if (!elenaRow) { console.log('Elena user not found. Run seed.js first.'); process.exit(1); }
const createdBy = elenaRow.id;

const yesNo = db.prepare("SELECT id FROM answer_sets WHERE org_id = ? AND name = 'Yes / No'").get(orgId);
const passFail = db.prepare("SELECT id FROM answer_sets WHERE org_id = ? AND name = 'Pass / Fail / N/A'").get(orgId);
if (!yesNo || !passFail) { console.log('Default answer sets not found. Check migration 008.'); process.exit(1); }

const complianceSet = db.prepare(
  "INSERT INTO answer_sets (org_id, name) VALUES (?, 'Compliant / Non-Compliant / N/A')"
).run(orgId);
const complianceSetId = complianceSet.lastInsertRowid;
const optIns = db.prepare(
  'INSERT INTO answer_set_options (answer_set_id, label, score, color, is_failed, position) VALUES (?, ?, ?, ?, ?, ?)'
);
optIns.run(complianceSetId, 'Compliant', 1, '#2E7D32', 0, 0);
optIns.run(complianceSetId, 'Non-Compliant', 0, '#D32F2F', 1, 1);
optIns.run(complianceSetId, 'N/A', 0, '#90A4AE', 0, 2);

const conditionSet = db.prepare(
  "INSERT INTO answer_sets (org_id, name) VALUES (?, 'Good / Acceptable / Poor')"
).run(orgId);
const conditionSetId = conditionSet.lastInsertRowid;
optIns.run(conditionSetId, 'Good', 2, '#2E7D32', 0, 0);
optIns.run(conditionSetId, 'Acceptable', 1, '#ED6C02', 0, 1);
optIns.run(conditionSetId, 'Poor', 0, '#D32F2F', 1, 2);

// -- Template definitions --

const ISO_TEMPLATES = [
  {
    name: 'ISO 45001 — Occupational Health & Safety Audit',
    description: 'Comprehensive audit checklist aligned with ISO 45001:2018 requirements for occupational health and safety management systems.',
    sections: [
      {
        label: '4. Context of the Organization',
        questions: [
          { label: 'Are internal and external issues relevant to OH&S identified and monitored?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are the needs and expectations of workers and interested parties determined?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Is the scope of the OH&S management system defined and documented?', answer_set_id: yesNo.id, required: 1 },
        ],
      },
      {
        label: '5. Leadership & Worker Participation',
        questions: [
          { label: 'Does top management demonstrate leadership and commitment to the OH&S system?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Is there an OH&S policy that is appropriate, communicated, and available?', answer_set_id: yesNo.id, required: 1 },
          { label: 'Are roles, responsibilities, and authorities assigned and communicated?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Is there evidence of worker consultation and participation in OH&S decisions?', answer_set_id: yesNo.id, required: 1 },
        ],
      },
      {
        label: '6. Planning',
        questions: [
          { label: 'Are hazards systematically identified on an ongoing basis?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are OH&S risks and opportunities assessed using a defined methodology?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are legal and other compliance requirements identified and tracked?', answer_set_id: yesNo.id, required: 1 },
          { label: 'Are measurable OH&S objectives established and documented?', answer_set_id: complianceSetId, required: 1 },
        ],
      },
      {
        label: '7. Support',
        questions: [
          { label: 'Are adequate resources provided for the OH&S management system?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Is worker competence determined, and training provided where needed?', answer_set_id: yesNo.id, required: 1 },
          { label: 'Are workers aware of the OH&S policy, objectives, and their contribution?', answer_set_id: complianceSetId, required: 0 },
          { label: 'Are internal and external communication processes established?', answer_set_id: yesNo.id, required: 0 },
          { label: 'Is documented information controlled and maintained as required?', answer_set_id: complianceSetId, required: 1 },
        ],
      },
      {
        label: '8. Operation',
        questions: [
          { label: 'Is the hierarchy of controls applied to eliminate hazards and reduce risks?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are management of change processes in place for planned changes?', answer_set_id: yesNo.id, required: 1 },
          { label: 'Are procurement and contractor processes addressing OH&S requirements?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are emergency preparedness and response procedures established and tested?', answer_set_id: complianceSetId, required: 1 },
        ],
      },
      {
        label: '9. Performance Evaluation',
        questions: [
          { label: 'Is OH&S performance monitored, measured, analyzed, and evaluated?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Is compliance with legal and other requirements periodically evaluated?', answer_set_id: yesNo.id, required: 1 },
          { label: 'Are internal audits conducted at planned intervals?', answer_set_id: yesNo.id, required: 1 },
          { label: 'Does top management review the OH&S system at planned intervals?', answer_set_id: complianceSetId, required: 1 },
        ],
      },
      {
        label: '10. Improvement',
        questions: [
          { label: 'Are incidents and nonconformities investigated with corrective actions taken?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Is the OH&S management system continually improved?', answer_set_id: complianceSetId, required: 1 },
        ],
      },
    ],
  },
  {
    name: 'ISO 14001 — Environmental Management Audit',
    description: 'Audit checklist aligned with ISO 14001:2015 for environmental management systems, covering all clauses from context to continual improvement.',
    sections: [
      {
        label: '4. Context of the Organization',
        questions: [
          { label: 'Are internal and external issues relevant to the EMS identified?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are the needs and expectations of interested parties (regulators, community) determined?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Is the scope of the EMS clearly defined, considering environmental conditions?', answer_set_id: yesNo.id, required: 1 },
        ],
      },
      {
        label: '5. Leadership',
        questions: [
          { label: 'Does top management demonstrate commitment to environmental protection?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Is the environmental policy appropriate to the nature and scale of impacts?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are environmental roles, responsibilities, and authorities communicated?', answer_set_id: yesNo.id, required: 1 },
        ],
      },
      {
        label: '6. Planning',
        questions: [
          { label: 'Are significant environmental aspects and impacts identified using a life-cycle perspective?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are compliance obligations (legal and voluntary) identified and accessible?', answer_set_id: yesNo.id, required: 1 },
          { label: 'Are environmental risks and opportunities addressed in planning?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are measurable environmental objectives established where practicable?', answer_set_id: complianceSetId, required: 1 },
        ],
      },
      {
        label: '7. Support',
        questions: [
          { label: 'Are adequate resources provided for the EMS?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are persons doing work with significant environmental impact competent?', answer_set_id: yesNo.id, required: 1 },
          { label: 'Are awareness and communication processes established for environmental issues?', answer_set_id: complianceSetId, required: 0 },
          { label: 'Is documented information for the EMS controlled and maintained?', answer_set_id: complianceSetId, required: 1 },
        ],
      },
      {
        label: '8. Operation',
        questions: [
          { label: 'Are operational controls in place for significant environmental aspects?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are environmental requirements addressed in procurement and outsourced processes?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are emergency preparedness and response procedures addressing potential environmental impacts?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Is waste management practiced according to regulatory and organizational requirements?', answer_set_id: passFail.id, required: 1 },
          { label: 'Are spill containment and prevention measures in place?', answer_set_id: passFail.id, required: 1 },
        ],
      },
      {
        label: '9. Performance Evaluation',
        questions: [
          { label: 'Is environmental performance monitored and measured against objectives?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Is compliance with environmental obligations periodically evaluated?', answer_set_id: yesNo.id, required: 1 },
          { label: 'Are internal audits of the EMS conducted at planned intervals?', answer_set_id: yesNo.id, required: 1 },
          { label: 'Does management review include environmental performance trends and improvement opportunities?', answer_set_id: complianceSetId, required: 1 },
        ],
      },
      {
        label: '10. Improvement',
        questions: [
          { label: 'Are nonconformities investigated and corrective actions taken to address root causes?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Is the EMS continually improved to enhance environmental performance?', answer_set_id: complianceSetId, required: 1 },
        ],
      },
    ],
  },
  {
    name: 'ISO 9001 — Quality Management System Audit',
    description: 'Internal audit checklist aligned with ISO 9001:2015 for quality management systems, covering process approach, risk-based thinking, and continual improvement.',
    sections: [
      {
        label: '4. Context of the Organization',
        questions: [
          { label: 'Are internal and external issues relevant to the QMS determined and monitored?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are the needs and expectations of relevant interested parties identified?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Is the scope of the QMS defined, considering products, services, and applicability?', answer_set_id: yesNo.id, required: 1 },
          { label: 'Are QMS processes and their interactions determined (process approach)?', answer_set_id: complianceSetId, required: 1 },
        ],
      },
      {
        label: '5. Leadership',
        questions: [
          { label: 'Does top management demonstrate leadership and commitment to the QMS?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Is the quality policy appropriate and communicated throughout the organization?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Is the organization customer-focused, with customer requirements consistently met?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are quality roles, responsibilities, and authorities clearly defined?', answer_set_id: yesNo.id, required: 1 },
        ],
      },
      {
        label: '6. Planning',
        questions: [
          { label: 'Are risks and opportunities addressed to ensure QMS achieves intended results?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are quality objectives established and plans to achieve them defined?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are changes to the QMS planned and carried out in a controlled manner?', answer_set_id: yesNo.id, required: 1 },
        ],
      },
      {
        label: '7. Support',
        questions: [
          { label: 'Are resources (people, infrastructure, environment) adequate for QMS processes?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are monitoring and measuring resources calibrated or verified at planned intervals?', answer_set_id: passFail.id, required: 1 },
          { label: 'Is organizational knowledge determined, maintained, and made available?', answer_set_id: complianceSetId, required: 0 },
          { label: 'Are persons affecting quality performance competent based on education, training, or experience?', answer_set_id: yesNo.id, required: 1 },
          { label: 'Is documented information created, updated, and controlled as required by the QMS?', answer_set_id: complianceSetId, required: 1 },
        ],
      },
      {
        label: '8. Operation',
        questions: [
          { label: 'Are requirements for products and services determined and communicated to customers?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are design and development processes planned and controlled?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are externally provided processes, products, and services controlled?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Is production and service provision carried out under controlled conditions?', answer_set_id: passFail.id, required: 1 },
          { label: 'Are nonconforming outputs identified, controlled, and corrected?', answer_set_id: complianceSetId, required: 1 },
        ],
      },
      {
        label: '9. Performance Evaluation',
        questions: [
          { label: 'Is customer satisfaction monitored and analyzed?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are QMS processes monitored, measured, and analyzed for effectiveness?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Are internal audits conducted at planned intervals?', answer_set_id: yesNo.id, required: 1 },
          { label: 'Does management review address quality performance, customer feedback, and improvement needs?', answer_set_id: complianceSetId, required: 1 },
        ],
      },
      {
        label: '10. Improvement',
        questions: [
          { label: 'Are nonconformities addressed with appropriate corrective actions?', answer_set_id: complianceSetId, required: 1 },
          { label: 'Is the QMS continually improved to enhance customer satisfaction?', answer_set_id: complianceSetId, required: 1 },
        ],
      },
    ],
  },
];

// -- Seeding logic --

const tplIns = db.prepare(
  `INSERT INTO templates (org_id, name, description, status, published_at, created_by, latest_version)
   VALUES (?, ?, ?, 'published', datetime('now'), ?, 1)`
);
const itemIns = db.prepare(
  `INSERT INTO template_items (template_id, item_key, parent_key, type, label, region, sort_order, required, meta)
   VALUES (?, ?, ?, ?, ?, 'body', ?, ?, ?)`
);
const verIns = db.prepare(
  `INSERT INTO template_versions (template_id, version_number, published_by)
   VALUES (?, 1, ?)`
);
const verItemIns = db.prepare(
  `INSERT INTO template_version_items (version_id, item_key, parent_key, type, label, region, sort_order, required, meta)
   VALUES (?, ?, ?, ?, ?, 'body', ?, ?, ?)`
);

let keyCounter = 0;
const nextKey = () => `item_${++keyCounter}`;

db.transaction(() => {
  for (const tpl of ISO_TEMPLATES) {
    const tplId = tplIns.run(orgId, tpl.name, tpl.description, createdBy).lastInsertRowid;
    const verId = verIns.run(tplId, createdBy).lastInsertRowid;

    let sectionOrder = 0;
    for (const section of tpl.sections) {
      const sectionKey = nextKey();
      itemIns.run(tplId, sectionKey, null, 'section', section.label, sectionOrder, 0, null);
      verItemIns.run(verId, sectionKey, null, 'section', section.label, sectionOrder, 0, null);
      sectionOrder++;

      let qOrder = 0;
      for (const q of section.questions) {
        const qKey = nextKey();
        const meta = JSON.stringify({ answer_set_id: q.answer_set_id });
        itemIns.run(tplId, qKey, sectionKey, 'question', q.label, qOrder, q.required, meta);
        verItemIns.run(verId, qKey, sectionKey, 'question', q.label, qOrder, q.required, meta);
        qOrder++;
      }
    }
  }
})();

console.log('ISO template seed complete.');
console.log('Templates created:');
for (const tpl of ISO_TEMPLATES) {
  console.log(`  ✓ ${tpl.name}`);
}
console.log(`\nAnswer sets added: "Compliant / Non-Compliant / N/A", "Good / Acceptable / Poor"`);
