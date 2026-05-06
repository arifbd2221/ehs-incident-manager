// VoiceIntakeModal.jsx — speak the report, AI extracts structured fields.
//
// Flow:
//   1. User opens modal from wizard step 0.
//   2. Mic toggle uses the browser Web Speech API (no audio leaves the box —
//      transcription happens in-browser before we POST). Falls back to a
//      plain textarea if the browser doesn't support SpeechRecognition.
//   3. "Extract" → POST /api/incidents/voice-extract → loading spinner.
//   4. Modal closes, parent gets onExtracted({ extraction_id, fields, ... }).
//   5. Wizard pre-populates and badges those fields as "AI suggested" until
//      the user edits or confirms each.
//
// Phase 2 W5 F5.1.

import { useState, useRef, useEffect, useCallback } from 'react';
import Icon from '../shared/Icon';
import { voiceExtract } from '../../api/incidents';

const SpeechRecognition =
  typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

export default function VoiceIntakeModal({ onCancel, onExtracted }) {
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const baseTextRef = useRef('');

  const toggleMic = useCallback(() => {
    if (!SpeechRecognition) return;
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    baseTextRef.current = transcript;
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    let finalTranscript = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
        else interim = e.results[i][0].transcript;
      }
      const base = baseTextRef.current;
      const sep = base && !base.endsWith(' ') ? ' ' : '';
      setTranscript(base + sep + finalTranscript + interim);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [listening, transcript]);

  useEffect(() => {
    return () => { if (recognitionRef.current) recognitionRef.current.stop(); };
  }, []);

  const submit = async () => {
    if (!transcript.trim()) return;
    if (recognitionRef.current && listening) recognitionRef.current.stop();
    setSubmitting(true);
    setError(null);
    try {
      const result = await voiceExtract(transcript);
      onExtracted(result);
    } catch (e) {
      const status = e?.response?.status;
      const msg =
        status === 503 ? 'Voice intake is offline (no API key configured). You can still fill the wizard manually.'
        : status === 502 ? 'AI extraction service is unavailable right now. Please fill the wizard manually.'
        : status === 400 ? (e.response?.data?.error || 'Transcript was empty.')
        : (e.response?.data?.error || 'Voice extraction failed. Please fill the wizard manually.');
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const speechSupported = !!SpeechRecognition;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-lg vimo-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <div>
            <div className="modal-title">
              <span className="vimo-sparkle">✨</span> Voice intake
            </div>
            <div className="modal-sub">Speak the incident — Claude extracts structured fields you can review and edit</div>
          </div>
          <button className="icon-btn" onClick={onCancel} disabled={submitting}>
            <Icon name="close" size={18}/>
          </button>
        </div>
        <div className="modal-body">
          <div className="vimo-hint">
            Describe what happened in your own words. Mention <b>who</b>, <b>what</b>, <b>where</b>,
            <b> body parts</b> if any, and <b>any equipment</b> involved.
            We'll never store the audio or the transcript text — only a hash and the extracted fields.
          </div>

          <div className="vimo-transcript-wrap">
            <textarea
              className="textarea vimo-transcript"
              placeholder={speechSupported
                ? "Click the mic to speak, or type here directly…"
                : "Type the description here. (Voice input requires Chrome, Edge, or Safari.)"}
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              rows={6}
              disabled={submitting}
            />
            {speechSupported && (
              <button
                type="button"
                className={`vimo-mic ${listening ? 'is-on' : ''}`}
                onClick={toggleMic}
                disabled={submitting}
                title={listening ? 'Stop' : 'Start speaking'}
              >
                <Icon name={listening ? 'pulse' : 'mic'} size={18}/>
                {listening && <span className="vimo-mic-pulse"/>}
              </button>
            )}
          </div>

          {listening && (
            <div className="vimo-listening">
              <span className="vimo-listening-dot"/> Listening — speak naturally, click the mic again to stop.
            </div>
          )}

          {error && <div className="vimo-error">{error}</div>}
        </div>
        <div className="modal-f">
          <button className="btn btn-secondary" onClick={onCancel} disabled={submitting}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={submitting || !transcript.trim()}
          >
            {submitting ? 'Extracting…' : (
              <>
                <span className="vimo-sparkle">✨</span> Extract fields
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
