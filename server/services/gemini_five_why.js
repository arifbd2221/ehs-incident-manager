import { GoogleGenerativeAI } from '@google/generative-ai';

const ROOT_CAUSE_CATEGORIES = [
  'human_factors',
  'equipment_failure',
  'procedure_gap',
  'training_gap',
  'management_oversight',
  'design_flaw',
  'environmental',
  'communication',
];

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    next_question: {
      type: 'string',
      description: 'The next probing "Why" question. Be specific — reference the previous answer directly. 8–25 words. Vary phrasing: "Why…", "What caused…", "Why was there no…".',
    },
    likely_root_cause: {
      type: 'boolean',
      description: 'True only if the latest answer identifies a systemic root cause (process/training/management/design gap) rather than a proximate cause. Never true before level 3.',
    },
    root_cause_category: {
      type: 'string',
      nullable: true,
      enum: ROOT_CAUSE_CATEGORIES,
      description: 'Most applicable EHS root cause category when likely_root_cause is true. Null otherwise.',
    },
    reasoning: {
      type: 'string',
      description: 'Brief 1–2 sentence reasoning for the question choice or root cause flag. Stored for audit, not shown to user.',
    },
  },
  required: ['next_question', 'likely_root_cause', 'reasoning'],
};

function buildPrompt({ incidentTitle, incidentDescription, incidentType, previousWhys }) {
  const whyChain = previousWhys
    .map(w => `Why ${w.level}: Q: ${w.question}\n  A: ${w.answer}`)
    .join('\n');

  return [
    'You are an EHS (Environmental Health & Safety) root cause analyst conducting a 5-Why investigation.',
    'Your job is to generate the next probing question that drives the investigator deeper toward the true systemic root cause.',
    '',
    'INCIDENT CONTEXT:',
    `- Type: ${incidentType}`,
    `- Title: ${incidentTitle}`,
    `- Description: ${incidentDescription || '(not provided)'}`,
    '',
    'PREVIOUS WHY CHAIN:',
    whyChain || '(none yet)',
    '',
    'INSTRUCTIONS:',
    '- Generate a targeted question that probes the LAST answer. Reference specific details from that answer.',
    '- Do NOT generate vague questions like "Why did that happen?" or "What went wrong?" — be concrete and specific.',
    '- A good root cause is systemic: management system gap, missing procedure, inadequate training, design flaw, or cultural issue.',
    '- Never blame individuals. Frame questions around systems, processes, and controls.',
    '- Only set likely_root_cause to true when the latest answer clearly points to a systemic gap AND the chain has at least 3 levels.',
    '- Keep the question under 25 words.',
    '',
    'ROOT CAUSE CATEGORIES (use only when likely_root_cause is true):',
    '- human_factors: skills, attention, fatigue, workload',
    '- equipment_failure: mechanical, electrical, wear, calibration',
    '- procedure_gap: SOP missing, outdated, inadequate, not followed',
    '- training_gap: insufficient training, competency, awareness',
    '- management_oversight: supervision, resource allocation, scheduling',
    '- design_flaw: engineering, ergonomic, layout, guarding',
    '- environmental: workplace conditions, lighting, noise, temperature',
    '- communication: information flow, handover, signage, language',
  ].join('\n');
}

export async function suggestNextWhy({ incidentTitle, incidentDescription, incidentType, previousWhys }) {
  if (!process.env.GEMINI_API_KEY) {
    const err = new Error('AI suggestion unavailable — GEMINI_API_KEY not configured');
    err.statusCode = 503;
    throw err;
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const prompt = buildPrompt({ incidentTitle, incidentDescription, incidentType, previousWhys });

  let result;
  try {
    result = await model.generateContent(prompt);
  } catch (e) {
    const err = new Error('Gemini 5-Why suggestion failed: ' + (e.message || 'unknown error'));
    err.statusCode = 502;
    throw err;
  }

  const responseText = result.response.text();
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    const err = new Error('5-Why suggestion returned invalid JSON');
    err.statusCode = 502;
    throw err;
  }

  return {
    next_question: parsed.next_question || 'Why did this happen?',
    likely_root_cause: !!parsed.likely_root_cause,
    root_cause_category: parsed.likely_root_cause ? (parsed.root_cause_category || null) : null,
    reasoning: parsed.reasoning || null,
  };
}
