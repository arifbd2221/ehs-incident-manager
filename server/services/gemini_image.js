import { GoogleGenerativeAI } from '@google/generative-ai';

const IMAGE_PROMPT = [
  'You are an EHS (Environmental Health & Safety) incident scene analyst. A frontline worker has uploaded one or more photos of a workplace incident or hazardous condition. Analyze the visual content carefully.',
  '',
  'For EACH image, describe what you observe that is relevant to workplace safety:',
  '- Location/environment (indoor/outdoor, warehouse, factory floor, office, construction site)',
  '- Equipment visible (forklifts, ladders, machinery, tools, vehicles)',
  '- Hazards visible (spills, broken equipment, missing guards, exposed wiring, clutter, heights)',
  '- People visible and their condition (injured, wearing PPE)',
  '- Damage visible (structural damage, broken items, scorch marks)',
  '- Safety equipment present or missing (fire extinguishers, guardrails, signage, PPE)',
  '',
  'Combine all observations into a single narrative:',
  '',
  'SCENE OBSERVATIONS: [visual description of safety-relevant details across all images]',
  '',
  'Return only the combined narrative. Be factual and specific — mention positions, equipment types, and visible conditions. Do not speculate about causes; describe only what is visible.',
].join('\n');

export async function analyzeImages(files, caption) {
  if (!process.env.GEMINI_API_KEY) {
    const err = new Error('Image analysis unavailable — GEMINI_API_KEY not configured');
    err.statusCode = 503;
    throw err;
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const parts = files.map(f => ({
    inlineData: {
      mimeType: f.mimetype || 'image/jpeg',
      data: f.buffer.toString('base64'),
    },
  }));

  const prompt = caption
    ? `USER CAPTION: ${caption}\n\n${IMAGE_PROMPT}`
    : IMAGE_PROMPT;
  parts.push({ text: prompt });

  let result;
  try {
    result = await model.generateContent(parts);
  } catch (e) {
    if (e.status === 429 || e.message?.includes('429') || e.message?.includes('quota')) {
      const err = new Error('API quota exceeded. Wait a moment and try again.');
      err.statusCode = 429;
      throw err;
    }
    const err = new Error('Image analysis failed: ' + (e.message || 'unknown'));
    err.statusCode = 502;
    throw err;
  }

  const text = result.response.text().trim();
  if (!text) {
    const err = new Error('Could not analyze the images. Please try again with clearer photos.');
    err.statusCode = 400;
    throw err;
  }

  return caption ? `USER CAPTION: ${caption}\n\n${text}` : text;
}
