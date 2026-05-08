import { useState } from 'react';
import Icon from '../shared/Icon';
import { voiceExtract } from '../../api/incidents';
import useSpeechRecognition from '../../hooks/useSpeechRecognition';

export default function VoiceIntakeModal({ onCancel, onExtracted }) {
  const { transcript, setTranscript, listening, toggleMic, stopMic, speechSupported } =
    useSpeechRecognition();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!transcript.trim()) return;
    stopMic();
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

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-lg vimo-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="voice-intake-modal-title">
        <div className="modal-h">
          <div>
            <div className="modal-title" id="voice-intake-modal-title">
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
