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
      description: 'Incident category. injury=person physically hurt, illness=work-related sickness, nearmiss=no harm but could have been, property=equipment/property damaged, env=spill/emission, unsafe=hazardous condition, observation=safety note, dangerous=high-risk event.',
    },
    title: {
      type: 'string',
      nullable: true,
      description: 'Short factual summary, 8-12 words. Example: "Hydraulic fluid burn to left hand from forklift".',
    },
    description: {
      type: 'string',
      nullable: true,
      description: 'Cleaned narrative of what happened. Strip filler words (uh/um/so/like) but preserve every concrete fact: times, names, body parts, equipment, quantities, locations.',
    },
    body_parts_affected: {
      type: 'array',
      items: { type: 'string', enum: Array.from(VALID_REGION_IDS) },
      nullable: true,
      description: 'All affected body region IDs from the canonical list. Map "hand" to l_hand or r_hand based on context. Map "forearm" to l_forearm or r_forearm. Include every body part mentioned.',
    },
    treatment_choice: {
      type: 'string',
      nullable: true,
      description: 'Treatment given. Use "first_aid" for bandages/cold water/ice/cleaning. Use "medical_beyond_first_aid" for hospital/stitches/prescription. Use the specific treatment description if stated.',
    },
    severity_hint: {
      type: 'integer',
      nullable: true,
      description: "Reporter's sense of severity 1=catastrophic 2=major 3=moderate 4=minor 5=insignificant. Only set if the speaker clearly indicated severity.",
    },
    asset_match: {
      type: 'string',
      nullable: true,
      description: 'If equipment is named in the transcript, the closest matching asset name from the candidate list. Must be an exact match from the list or null.',
    },
    site_match: {
      type: 'string',
      nullable: true,
      description: 'If a site/plant/facility is named, the closest matching site name from the candidate list. Must be an exact match from the list or null.',
    },
    area: {
      type: 'string',
      nullable: true,
      description: 'Specific area/zone/bay/room within the site. Examples: "warehouse B", "bay 3", "loading dock", "lab 2".',
    },
    is_imminent_danger: {
      type: 'boolean',
      nullable: true,
      description: 'True only if the speaker explicitly said there is immediate, ongoing danger. Never infer this.',
    },
    injured_name: {
      type: 'string',
      nullable: true,
      description: 'Full name of the injured/affected person if mentioned in the transcript.',
    },
    affected_name: {
      type: 'string',
      nullable: true,
      description: 'Full name of the affected person for illness-type incidents.',
    },
    primary_hazard: {
      type: 'string',
      nullable: true,
      description: 'Primary hazard type for nearmiss/unsafe incidents.',
    },
    equipment_name: {
      type: 'string',
      nullable: true,
      description: 'Name/description of damaged equipment for property-type incidents.',
    },
    substance_name: {
      type: 'string',
      nullable: true,
      description: 'Name of the released substance for environmental incidents.',
    },
    illness_category: {
      type: 'string',
      nullable: true,
      description: 'Illness category for illness-type incidents (e.g. respiratory, skin, hearing).',
    },
    witnesses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Witness full name or first name if that is all that was given.' },
          contact: { type: 'string', nullable: true, description: 'Contact info if mentioned.' },
        },
        required: ['name'],
      },
      nullable: true,
      description: 'People explicitly named as witnesses or who "saw" the incident.',
    },
    suggested_followups: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
      description: 'Clarifying questions for EHS to ask. Focus on safety-critical gaps: PPE worn? Lockout/tagout? Medical evaluation needed?',
    },
    missing_required: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
      description: 'Field names that are required for submission but could not be extracted from the transcript (e.g. "site", "incident_datetime").',
    },
  },
  required: ['type'],
};

function buildPrompt({ transcript, siteCandidates, assetCandidates }) {
  const partList = Object.entries(PART_LABELS)
    .map(([id, label]) => `${id} (${label})`)
    .join(', ');

  return [
    'You are an EHS (Environmental Health & Safety) incident data extractor. A frontline worker has verbally described a workplace incident. Extract ALL facts from the transcript into the structured JSON schema.',
    '',
    'CRITICAL INSTRUCTIONS:',
    '- Extract EVERY piece of information that maps to a field. Do not skip fields that have clear data in the transcript.',
    '- For body parts: map spoken body parts to the canonical IDs. "left hand" → "l_hand", "right forearm" → "r_forearm", "left arm" → "l_upper_arm" and/or "l_forearm". Include ALL affected parts.',
    '- For witnesses: anyone who "saw", "witnessed", or was mentioned as present during the incident.',
    '- For treatment: "cold water", "bandage", "ice" = first aid. "hospital", "stitches", "doctor" = medical_beyond_first_aid.',
    '- For injured_name: the full name of whoever was hurt. Look for patterns like "[Name] was working" or "[Name] got hurt".',
    '- For area: extract specific locations like warehouse names, bay numbers, dock numbers, room names.',
    '- Generate a clear 8-12 word title summarizing what happened.',
    '- Clean the description: remove filler words (so, uh, um, like, you know) but keep ALL facts (times, names, quantities, equipment details).',
    '- Set null for fields that genuinely have no data in the transcript.',
    '- Add suggested_followups for safety-critical gaps: Was PPE worn? Was equipment locked out? Does the person need medical evaluation?',
    '',
    'Body region IDs (use ONLY these exact IDs):',
    partList,
    '',
    'Site candidates for site_match (match one exactly, or set null):',
    siteCandidates.length > 0 ? siteCandidates.join(' | ') : '(none — set site_match to null)',
    '',
    'Asset candidates for asset_match (match one exactly, or set null):',
    assetCandidates.length > 0 ? assetCandidates.join(' | ') : '(none — set asset_match to null)',
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
