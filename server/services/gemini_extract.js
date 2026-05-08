import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';
import db from '../db/connection.js';
import { PART_LABELS, VALID_REGION_IDS } from './body_parts.js';

const VALID_TYPES = ['injury', 'illness', 'nearmiss', 'property', 'env', 'unsafe', 'observation', 'dangerous'];

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: VALID_TYPES,
      description: 'Incident category.',
    },
    title: {
      type: 'string',
      description: 'Short summary, 8-12 words.',
    },
    description: {
      type: 'string',
      description: 'Cleaned narrative. Strip filler words but preserve every concrete fact.',
    },
    body_parts_affected: {
      type: 'array',
      items: { type: 'string', enum: Array.from(VALID_REGION_IDS) },
      description: 'Affected body region IDs from the canonical list.',
    },
    treatment_choice: {
      type: 'string',
      description: 'OSHA first-aid label if mentioned, or "medical_beyond_first_aid".',
    },
    severity_hint: {
      type: 'integer',
      description: "Reporter's sense of severity 1=catastrophic to 5=insignificant. Omit if unstated.",
    },
    asset_match: {
      type: 'string',
      description: 'Closest matching asset name from candidates. Omit if no clear match.',
    },
    site_match: {
      type: 'string',
      description: 'Closest matching site name from candidates. Omit if no clear match.',
    },
    area: {
      type: 'string',
      description: 'Specific area within the site if mentioned.',
    },
    is_imminent_danger: {
      type: 'boolean',
      description: 'True only if speaker explicitly indicated immediate life-threatening conditions.',
    },
    injured_name: {
      type: 'string',
      description: 'Full name of the injured person if mentioned (for injury type).',
    },
    affected_name: {
      type: 'string',
      description: 'Full name of the affected person if mentioned (for illness type).',
    },
    primary_hazard: {
      type: 'string',
      description: 'Primary hazard type if mentioned (for nearmiss/unsafe types).',
    },
    equipment_name: {
      type: 'string',
      description: 'Name of damaged equipment if mentioned (for property type).',
    },
    substance_name: {
      type: 'string',
      description: 'Name of released substance if mentioned (for environmental type).',
    },
    illness_category: {
      type: 'string',
      description: 'Illness category if mentioned (for illness type).',
    },
    witnesses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          contact: { type: 'string' },
        },
        required: ['name'],
      },
      description: 'Witnesses named in the transcript.',
    },
    suggested_followups: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific clarifying questions the EHS team should ask.',
    },
    missing_required: {
      type: 'array',
      items: { type: 'string' },
      description: 'Required fields that could not be extracted.',
    },
  },
  required: ['type'],
};

function buildPrompt({ transcript, siteCandidates, assetCandidates }) {
  const partList = Object.entries(PART_LABELS)
    .map(([id, label]) => `${id} (${label})`)
    .join(', ');

  return [
    'You extract structured incident fields from a verbal report by a frontline worker.',
    'You will receive a transcript and must return a single JSON object matching the schema.',
    '',
    'Rules:',
    '- Be conservative. If a field is not clearly stated, omit it and add a clarifying question to suggested_followups.',
    '- Never invent witnesses, body parts, asset names, or quantities.',
    '- Treat the transcript as informal speech — strip "uh"/"um"/repeats, but preserve every concrete fact.',
    '- For injury incidents, extract the injured person\'s name into injured_name if mentioned.',
    '- For illness incidents, extract the affected person\'s name into affected_name and illness category into illness_category.',
    '- For nearmiss/unsafe incidents, extract the hazard type into primary_hazard.',
    '- For property damage, extract equipment name into equipment_name.',
    '- For environmental releases, extract substance name into substance_name.',
    '',
    'Body region IDs (use only these, exact spelling):',
    partList,
    '',
    'Site candidates for site_match (must match exactly one of these names, or omit):',
    siteCandidates.length > 0 ? siteCandidates.join(' | ') : '(none)',
    '',
    'Asset candidates for asset_match (must match exactly one of these names, or omit):',
    assetCandidates.length > 0 ? assetCandidates.join(' | ') : '(none)',
    '',
    `Transcript:\n"""\n${transcript}\n"""`,
  ].join('\n');
}

export async function extractFromTranscriptGemini({ transcript, orgId, userId }) {
  if (!process.env.GEMINI_API_KEY) {
    const err = new Error('Voice intake unavailable — GEMINI_API_KEY not configured');
    err.statusCode = 503;
    throw err;
  }
  const text = (transcript || '').trim();
  if (!text) {
    const err = new Error('transcript is required and must be non-empty');
    err.statusCode = 400;
    throw err;
  }

  const sites = db.prepare('SELECT name FROM sites WHERE org_id = ?').all(orgId).map(s => s.name);
  const assets = db.prepare('SELECT name FROM assets WHERE org_id = ? AND active = 1').all(orgId).map(a => a.name);

  const transcript_hash = crypto.createHash('sha256').update(text).digest('hex');

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const prompt = buildPrompt({ transcript: text, siteCandidates: sites, assetCandidates: assets });

  let result;
  try {
    result = await model.generateContent(prompt);
  } catch (e) {
    const err = new Error('Gemini extraction failed: ' + (e.message || 'unknown error'));
    err.statusCode = 502;
    throw err;
  }

  const responseText = result.response.text();
  let raw;
  try {
    raw = JSON.parse(responseText);
  } catch {
    const err = new Error('Voice extraction returned invalid JSON. Try again.');
    err.statusCode = 502;
    throw err;
  }

  let site_id = null;
  let asset_id = null;
  if (raw.site_match) {
    const row = db.prepare('SELECT id FROM sites WHERE org_id = ? AND name = ?').get(orgId, raw.site_match);
    if (row) site_id = row.id;
  }
  if (raw.asset_match) {
    const row = db.prepare('SELECT id FROM assets WHERE org_id = ? AND active = 1 AND LOWER(name) = LOWER(?)').get(orgId, raw.asset_match);
    if (row) asset_id = row.id;
  }

  const cleanedParts = Array.isArray(raw.body_parts_affected)
    ? raw.body_parts_affected.filter(id => VALID_REGION_IDS.has(id))
    : [];

  const validType = VALID_TYPES.includes(raw.type) ? raw.type : null;

  const extracted = {
    type: validType,
    title: raw.title || null,
    description: raw.description || null,
    body_parts_affected: cleanedParts,
    treatment_choice: raw.treatment_choice || null,
    severity_hint: raw.severity_hint || null,
    asset_match: raw.asset_match || null,
    asset_id,
    site_match: raw.site_match || null,
    site_id,
    area: raw.area || null,
    is_imminent_danger: !!raw.is_imminent_danger,
    witnesses: Array.isArray(raw.witnesses) ? raw.witnesses : [],
    injured_name: raw.injured_name || null,
    affected_name: raw.affected_name || null,
    primary_hazard: raw.primary_hazard || null,
    equipment_name: raw.equipment_name || null,
    substance_name: raw.substance_name || null,
    illness_category: raw.illness_category || null,
  };

  const dbResult = db.prepare(`
    INSERT INTO voice_extractions (transcript_hash, ai_extracted_json, created_by)
    VALUES (?, ?, ?)
  `).run(transcript_hash, JSON.stringify(extracted), userId);

  return {
    extraction_id: dbResult.lastInsertRowid,
    transcript_hash,
    extracted_fields: extracted,
    suggested_followups: Array.isArray(raw.suggested_followups) ? raw.suggested_followups : [],
    missing_required: Array.isArray(raw.missing_required) ? raw.missing_required : [],
  };
}
