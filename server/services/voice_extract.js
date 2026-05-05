// server/services/voice_extract.js — pre-incident voice transcript → structured fields.
//
// The frontend captures speech with the browser's Web Speech API and sends
// the transcript text here. We never see audio. Anthropic's Claude is asked
// (via tool-use, low-temp) to return a typed JSON shape anchored on the
// canonical 8 incident types and 30 BodyMap3D region IDs.
//
// Privacy: the transcript text is NOT stored. Only its SHA-256 hash + the
// AI's extracted-fields JSON go to voice_extractions. The user can later
// confirm/edit/reject individual fields before submission; those choices
// are tracked separately on the same row.
//
// Phase 2 W5 T5.1.

import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import db from '../db/connection.js';
import { PART_LABELS, VALID_REGION_IDS } from './body_parts.js';

const VALID_TYPES = ['injury', 'illness', 'nearmiss', 'property', 'env', 'unsafe', 'observation', 'dangerous'];

// Tool schema. Claude returns one tool_use block matching this shape.
// Every field is optional except `type` — extraction is best-effort and
// the wizard surfaces gaps via `missing_required` for the user to fill.
const EXTRACT_TOOL = {
  name: 'record_incident_extraction',
  description: 'Record the structured fields extracted from the verbal incident report. All fields are optional except type. Only fill in fields the transcript clearly supports — leave the rest unset and add a note to suggested_followups instead of guessing.',
  input_schema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: VALID_TYPES,
        description: 'Incident category. injury (person hurt), illness (work-related sickness), nearmiss (no harm but could have), property (damaged equipment, no injury), env (chemical spill, emission), unsafe (condition or behaviour, no incident yet), observation (positive safety note), dangerous (high-risk near-miss).',
      },
      title: {
        type: 'string',
        description: 'Short summary, 8-12 words. Imperative or factual — no "I" or "we".',
      },
      description: {
        type: 'string',
        description: 'Cleaned narrative of what happened. Strip filler words and stutters but preserve every concrete fact (times, body parts, equipment, names, quantities).',
      },
      body_parts_affected: {
        type: 'array',
        items: { type: 'string', enum: Array.from(VALID_REGION_IDS) },
        description: 'Affected body region IDs. Use only the canonical IDs provided in the system prompt.',
      },
      treatment_choice: {
        type: 'string',
        description: 'If a specific treatment was mentioned, the exact label from the OSHA first-aid list, or "medical_beyond_first_aid" if treatment exceeded first aid.',
      },
      severity_hint: {
        type: 'integer',
        minimum: 1,
        maximum: 5,
        description: 'Reporter\'s sense of severity if stated, 1=catastrophic to 5=insignificant. Do not guess if unstated.',
      },
      asset_match: {
        type: 'string',
        description: 'If a specific piece of equipment is named, the closest matching asset name from the candidate list provided in the system prompt. Leave unset if no clear match.',
      },
      site_match: {
        type: 'string',
        description: 'If a site is named, the closest matching site name from the candidate list. Leave unset if no clear match.',
      },
      area: {
        type: 'string',
        description: 'Specific area within the site if mentioned (e.g. "Bay 3", "loading dock", "lab 2").',
      },
      is_imminent_danger: {
        type: 'boolean',
        description: 'True only if the speaker explicitly indicated immediate, life-threatening conditions — never inferred.',
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
        description: 'Specific clarifying questions the EHS team should ask, e.g. "Was the press locked out before maintenance?".',
      },
      missing_required: {
        type: 'array',
        items: { type: 'string' },
        description: 'Names of fields that are required for submission but couldn\'t be extracted (e.g. ["site", "incident_datetime"]).',
      },
    },
    required: ['type'],
  },
};

function buildSystemPrompt({ siteCandidates, assetCandidates }) {
  const partList = Object.entries(PART_LABELS)
    .map(([id, label]) => `${id} (${label})`)
    .join(', ');

  return [
    'You extract structured incident fields from a verbal report by a frontline worker.',
    'You will receive a transcript and must call the record_incident_extraction tool exactly once.',
    '',
    'Rules:',
    '- Be conservative. If a field isn\'t clearly stated, leave it unset and add a clarifying question to suggested_followups.',
    '- Never invent witnesses, body parts, asset names, or quantities.',
    '- Treat the transcript as informal speech — strip "uh"/"um"/repeats, but preserve every concrete fact.',
    '',
    'Body region IDs (use only these, exact spelling):',
    partList,
    '',
    'Site candidates for site_match (must match exactly one of these names, or leave unset):',
    siteCandidates.length > 0 ? siteCandidates.join(' | ') : '(none)',
    '',
    'Asset candidates for asset_match (must match exactly one of these names, or leave unset):',
    assetCandidates.length > 0 ? assetCandidates.join(' | ') : '(none)',
  ].join('\n');
}

/**
 * Run the extraction. Throws if ANTHROPIC_API_KEY is not configured so the
 * route can return a clean 503; never throws for "the model returned weird
 * data" — that gets surfaced as missing_required instead.
 */
export async function extractFromTranscript({ transcript, orgId, userId }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('Voice intake unavailable — ANTHROPIC_API_KEY not configured');
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

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    temperature: 0.1,
    system: buildSystemPrompt({ siteCandidates: sites, assetCandidates: assets }),
    tools: [EXTRACT_TOOL],
    tool_choice: { type: 'tool', name: 'record_incident_extraction' },
    messages: [
      {
        role: 'user',
        content: `Transcript:\n"""\n${text}\n"""`,
      },
    ],
  });

  const toolUse = (response.content || []).find(c => c.type === 'tool_use' && c.name === EXTRACT_TOOL.name);
  if (!toolUse) {
    const err = new Error('Voice extraction returned no structured output. Try again or fill the wizard manually.');
    err.statusCode = 502;
    throw err;
  }

  const raw = toolUse.input || {};

  // Resolve site_match / asset_match back to ids for the wizard's convenience.
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

  // Drop unknown body parts defensively even though the schema enum should
  // already enforce it — Anthropic occasionally returns an out-of-enum value.
  const cleanedParts = Array.isArray(raw.body_parts_affected)
    ? raw.body_parts_affected.filter(id => VALID_REGION_IDS.has(id))
    : [];

  const extracted = {
    type: raw.type || null,
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
  };

  // Persist the extraction. Transcript text is NOT stored — only the hash
  // (per the privacy decision in the spec). User confirm/edit/reject is
  // tracked separately when the wizard finalizes.
  const result = db.prepare(`
    INSERT INTO voice_extractions (transcript_hash, ai_extracted_json, created_by)
    VALUES (?, ?, ?)
  `).run(transcript_hash, JSON.stringify(extracted), userId);

  return {
    extraction_id: result.lastInsertRowid,
    transcript_hash,
    extracted_fields: extracted,
    suggested_followups: Array.isArray(raw.suggested_followups) ? raw.suggested_followups : [],
    missing_required: Array.isArray(raw.missing_required) ? raw.missing_required : [],
  };
}
