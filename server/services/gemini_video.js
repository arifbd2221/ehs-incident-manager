import { GoogleGenerativeAI } from '@google/generative-ai';

const VIDEO_PROMPT = [
  'You are an EHS (Environmental Health & Safety) incident scene analyst. A frontline worker has recorded a short video of a workplace incident or hazardous condition. Analyze BOTH the audio and visual content.',
  '',
  'STEP 1 — AUDIO TRANSCRIPTION:',
  'Transcribe any spoken words in the video word for word. If no speech is detected, write "[no speech detected]".',
  '',
  'STEP 2 — VISUAL SCENE DESCRIPTION:',
  'Describe what you observe that is relevant to workplace safety:',
  '- Location/environment (indoor/outdoor, warehouse, factory floor, office, construction site)',
  '- Equipment visible (forklifts, ladders, machinery, tools, vehicles)',
  '- Hazards visible (spills, broken equipment, missing guards, exposed wiring, clutter, heights)',
  '- People visible and their condition (injured, wearing PPE)',
  '- Damage visible (structural damage, broken items, scorch marks)',
  '- Safety equipment present or missing (fire extinguishers, guardrails, signage, PPE)',
  '',
  'STEP 3 — COMBINED NARRATIVE:',
  'Combine the audio transcript and visual observations into a single incident narrative:',
  '',
  'SPOKEN ACCOUNT: [transcribed speech, or "No speech in video"]',
  '',
  'SCENE OBSERVATIONS: [visual description of safety-relevant details]',
  '',
  'Return only the combined narrative. Be factual and specific — mention positions, equipment types, and visible conditions. Do not speculate about causes; describe only what is visible and audible.',
].join('\n');

export async function analyzeVideo(videoBuffer, mimeType) {
  if (!process.env.GEMINI_API_KEY) {
    const err = new Error('Video analysis unavailable — GEMINI_API_KEY not configured');
    err.statusCode = 503;
    throw err;
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const base64Video = videoBuffer.toString('base64');

  let result;
  try {
    result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType || 'video/mp4',
          data: base64Video,
        },
      },
      { text: VIDEO_PROMPT },
    ]);
  } catch (e) {
    if (e.status === 429 || e.message?.includes('429') || e.message?.includes('quota')) {
      const err = new Error('API quota exceeded. Wait a moment and try again.');
      err.statusCode = 429;
      throw err;
    }
    const err = new Error('Video analysis failed: ' + (e.message || 'unknown'));
    err.statusCode = 502;
    throw err;
  }

  const text = result.response.text().trim();
  if (!text) {
    const err = new Error('Could not analyze the video. Please try again with a clearer clip.');
    err.statusCode = 400;
    throw err;
  }

  return text;
}
