import { GoogleGenerativeAI } from '@google/generative-ai';

export async function transcribeAudio(audioBuffer, mimeType) {
  if (!process.env.GEMINI_API_KEY) {
    const err = new Error('Voice intake unavailable — GEMINI_API_KEY not configured');
    err.statusCode = 503;
    throw err;
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const base64Audio = audioBuffer.toString('base64');

  let result;
  try {
    result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType || 'audio/webm',
          data: base64Audio,
        },
      },
      { text: 'Transcribe this audio recording word for word. Return only the transcription text, nothing else. If you cannot understand parts, write [inaudible]. If the audio is silent or empty, return "[no speech detected]".' },
    ]);
  } catch (e) {
    if (e.status === 429 || e.message?.includes('429') || e.message?.includes('quota')) {
      const err = new Error('API quota exceeded. Wait a moment and try again.');
      err.statusCode = 429;
      throw err;
    }
    const err = new Error('Gemini transcription failed: ' + (e.message || 'unknown'));
    err.statusCode = 502;
    throw err;
  }

  const text = result.response.text().trim();
  if (!text || text === '[no speech detected]') {
    const err = new Error('No speech detected in the recording. Please try again.');
    err.statusCode = 400;
    throw err;
  }

  return text;
}
