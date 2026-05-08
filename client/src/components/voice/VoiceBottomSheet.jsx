import { useReducer, useCallback, useRef, useState, useEffect } from 'react';
import Icon from '../shared/Icon';
import { useApp } from '../../context/AppContext';
import { voiceReport, voiceExtract, createIncident } from '../../api/incidents';
import useAudioRecorder from '../../hooks/useAudioRecorder';
import useSpeechRecognition from '../../hooks/useSpeechRecognition';
import VoiceReviewCard from './VoiceReviewCard';

const initial = { phase: 'idle', error: null, extraction: null, transcript: '', submitting: false };

const EMPTY_EXTRACTION = {
  extraction_id: null,
  extracted_fields: {},
  suggested_followups: [],
  missing_required: [],
};

function reducer(state, action) {
  switch (action.type) {
    case 'START_LISTEN': return { ...state, phase: 'listening', error: null };
    case 'START_RECORD': return { ...state, phase: 'recording', error: null };
    case 'START_PROCESS': return { ...state, phase: 'processing', error: null };
    case 'EXTRACT_OK': return { ...state, phase: 'review', extraction: action.payload, transcript: action.transcript || state.transcript, error: null };
    case 'EXTRACT_ERR': return { ...state, phase: 'idle', error: action.payload };
    case 'MANUAL_REVIEW': return { ...state, phase: 'review', extraction: EMPTY_EXTRACTION, transcript: action.transcript, error: null };
    case 'START_SUBMIT': return { ...state, submitting: true, error: null };
    case 'SUBMIT_OK': return { ...state, phase: 'success', submitting: false };
    case 'SUBMIT_ERR': return { ...state, submitting: false, error: action.payload };
    case 'BACK_TO_IDLE': return { ...initial };
    default: return state;
  }
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function VoiceBottomSheet() {
  const { setVoiceSheetOpen, setVoiceSheetData, setWizardOpen, triggerRefresh } = useApp();
  const speech = useSpeechRecognition();
  const recorder = useAudioRecorder();
  const [state, dispatch] = useReducer(reducer, initial);
  const [manualText, setManualText] = useState('');
  const audioBlobRef = useRef(null);
  const [mode, setMode] = useState(speech.speechSupported ? 'live' : 'record');

  const close = useCallback(() => {
    speech.stopMic();
    if (recorder.recording) recorder.stop();
    setVoiceSheetOpen(false);
  }, [speech, recorder, setVoiceSheetOpen]);

  // --- Live mode (SpeechRecognition) ---
  const handleStartLive = useCallback(() => {
    dispatch({ type: 'START_LISTEN' });
    speech.startRec();
  }, [speech]);

  const handleStopLive = useCallback(() => {
    speech.stopMic();
  }, [speech]);

  const handleExtractFromText = useCallback(async (text) => {
    if (!text.trim()) return;
    dispatch({ type: 'START_PROCESS' });
    try {
      const result = await voiceExtract(text);
      dispatch({ type: 'EXTRACT_OK', payload: result, transcript: text });
    } catch {
      dispatch({ type: 'MANUAL_REVIEW', transcript: text });
    }
  }, []);

  // --- Record mode (MediaRecorder → Gemini) ---
  const handleStartRecording = useCallback(async () => {
    dispatch({ type: 'START_RECORD' });
    const blobPromise = recorder.start();
    audioBlobRef.current = blobPromise;
  }, [recorder]);

  const handleStopAndProcess = useCallback(async () => {
    recorder.stop();
    dispatch({ type: 'START_PROCESS' });
    try {
      const blob = await audioBlobRef.current;
      if (!blob || blob.size === 0) {
        dispatch({ type: 'EXTRACT_ERR', payload: 'No audio captured. Try again.' });
        return;
      }
      const result = await voiceReport(blob);
      dispatch({ type: 'EXTRACT_OK', payload: result, transcript: result.transcript });
    } catch {
      dispatch({ type: 'MANUAL_REVIEW', transcript: '(Recording could not be transcribed — please fill in the details below)' });
    }
  }, [recorder]);

  // --- Shared ---
  const handleSubmit = useCallback(async (fields) => {
    dispatch({ type: 'START_SUBMIT' });
    try {
      await createIncident(fields);
      dispatch({ type: 'SUBMIT_OK' });
      triggerRefresh();
      setTimeout(() => close(), 1800);
    } catch (e) {
      dispatch({ type: 'SUBMIT_ERR', payload: e.response?.data?.error || 'Failed to create incident.' });
    }
  }, [triggerRefresh, close]);

  const handleEditInWizard = useCallback((gapValues = {}, datetime) => {
    const ext = state.extraction || EMPTY_EXTRACTION;
    const merged = {
      ...ext,
      extracted_fields: { ...ext.extracted_fields, ...gapValues },
    };
    if (datetime) merged.extracted_fields.incident_datetime = datetime;
    if (state.transcript && !merged.extracted_fields.description) {
      merged.extracted_fields.description = state.transcript;
    }
    setVoiceSheetData(merged);
    setVoiceSheetOpen(false);
    setWizardOpen(true);
  }, [state.extraction, state.transcript, setVoiceSheetData, setVoiceSheetOpen, setWizardOpen]);

  const handleRetry = useCallback(() => {
    dispatch({ type: 'BACK_TO_IDLE' });
    setManualText('');
    speech.resetTranscript();
    audioBlobRef.current = null;
  }, [speech]);

  const currentTranscript = mode === 'live' ? speech.transcript : manualText;
  const isActive = state.phase === 'listening' || state.phase === 'recording';

  const phaseTitle = {
    idle: 'Voice Report',
    listening: 'Listening...',
    recording: 'Recording...',
    processing: 'Processing...',
    review: 'Review & Complete',
    success: 'Report Created',
  };

  return (
    <div className="voice-backdrop" onClick={close}>
      <div className="voice-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Voice incident report">
        <div className="voice-sheet-handle" />
        <div className="voice-sheet-header">
          <div className="voice-sheet-title">{phaseTitle[state.phase]}</div>
          <button className="icon-btn" onClick={close} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Idle — ready to start */}
        {state.phase === 'idle' && (
          <div className="voice-sheet-body">
            <div className="voice-hint">
              Tap the mic and describe the incident — mention <b>who</b>, <b>what</b>, <b>where</b>, and any <b>injuries</b>.
            </div>

            {/* Mode toggle */}
            {speech.speechSupported && (
              <div className="voice-mode-toggle">
                <button className={`voice-mode-btn ${mode === 'live' ? 'active' : ''}`} onClick={() => setMode('live')}>
                  Live transcription
                </button>
                <button className={`voice-mode-btn ${mode === 'record' ? 'active' : ''}`} onClick={() => setMode('record')}>
                  Record & send
                </button>
              </div>
            )}

            <div className="voice-mic-area">
              <button
                className="voice-mic-btn"
                onClick={mode === 'live' ? handleStartLive : handleStartRecording}
                aria-label="Start"
              >
                <Icon name="mic" size={28} />
              </button>
              <div className="voice-listening-label">Tap to start {mode === 'live' ? 'speaking' : 'recording'}</div>
            </div>

            <div className="voice-or-divider"><span>or type it</span></div>

            <textarea
              className="textarea voice-transcript"
              placeholder="Type the incident description here..."
              value={manualText}
              onChange={e => setManualText(e.target.value)}
              rows={3}
            />

            {state.error && <div className="voice-error"><Icon name="warning" size={14} /> {state.error}</div>}
            {speech.micError && <div className="voice-error"><Icon name="warning" size={14} /> {speech.micError}</div>}
            {recorder.error && <div className="voice-error"><Icon name="warning" size={14} /> {recorder.error}</div>}

            <div className="voice-sheet-footer">
              <button className="btn btn-secondary" onClick={close}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleExtractFromText(manualText)} disabled={!manualText.trim()}>
                Extract fields
              </button>
            </div>
          </div>
        )}

        {/* Listening — live SpeechRecognition */}
        {state.phase === 'listening' && (
          <div className="voice-sheet-body">
            <div className="voice-hint">
              Speak naturally. Your words appear below in real-time.
            </div>

            <div className="voice-mic-area">
              <button
                className={`voice-mic-btn ${speech.listening ? 'is-on' : ''}`}
                onClick={speech.listening ? handleStopLive : handleStartLive}
                aria-label={speech.listening ? 'Pause' : 'Resume'}
              >
                <Icon name={speech.listening ? 'pulse' : 'mic'} size={28} />
                {speech.listening && <span className="voice-mic-ring" />}
              </button>
              <div className="voice-listening-label">
                {speech.listening ? 'Listening — tap to pause' : 'Paused — tap to resume'}
              </div>
            </div>

            <textarea
              className="textarea voice-transcript"
              placeholder="Transcript appears here..."
              value={speech.transcript}
              onChange={e => speech.setTranscript(e.target.value)}
              rows={4}
            />

            {speech.micError && <div className="voice-error"><Icon name="warning" size={14} /> {speech.micError}</div>}

            <div className="voice-sheet-footer">
              <button className="btn btn-secondary" onClick={() => { handleStopLive(); dispatch({ type: 'BACK_TO_IDLE' }); }}>Back</button>
              <button
                className="btn btn-primary"
                onClick={() => { handleStopLive(); handleExtractFromText(speech.transcript); }}
                disabled={!speech.transcript.trim()}
              >
                Extract fields
              </button>
            </div>
          </div>
        )}

        {/* Recording — MediaRecorder */}
        {state.phase === 'recording' && (
          <div className="voice-sheet-body">
            <div className="voice-hint">
              Speak naturally. Tap stop when done — audio will be sent for transcription.
            </div>

            <div className="voice-mic-area">
              <button className="voice-mic-btn is-on" onClick={handleStopAndProcess} aria-label="Stop recording">
                <Icon name="pulse" size={28} />
                <span className="voice-mic-ring" />
              </button>
              <div className="voice-rec-timer">{formatTime(recorder.duration)}</div>
              <div className="voice-listening-label">Recording — tap to stop</div>
            </div>

            {recorder.error && <div className="voice-error"><Icon name="warning" size={14} /> {recorder.error}</div>}
          </div>
        )}

        {/* Processing */}
        {state.phase === 'processing' && (
          <div className="voice-sheet-body voice-center">
            <div className="voice-spinner" />
            <div className="voice-processing-label">Extracting fields...</div>
            <div className="voice-processing-sub">AI is reading your report</div>
          </div>
        )}

        {/* Review */}
        {state.phase === 'review' && state.extraction && (
          <div className="voice-sheet-body">
            {state.transcript && (
              <div className="voice-transcript-preview">
                <div className="voice-section-label"><Icon name="mic" size={12} /> What you said</div>
                <p className="voice-transcript-text">{state.transcript}</p>
              </div>
            )}
            <VoiceReviewCard
              extraction={state.extraction}
              transcript={state.transcript}
              onSubmit={handleSubmit}
              onEditInWizard={handleEditInWizard}
              onRetry={handleRetry}
              submitting={state.submitting}
              error={state.error}
            />
          </div>
        )}

        {/* Success */}
        {state.phase === 'success' && (
          <div className="voice-sheet-body voice-center">
            <div className="voice-success-icon">
              <Icon name="check" size={32} />
            </div>
            <div className="voice-success-title">Incident Reported</div>
            <div className="voice-success-sub">Your report has been created and assigned for triage.</div>
          </div>
        )}
      </div>
    </div>
  );
}
