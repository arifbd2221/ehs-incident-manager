import { useReducer, useCallback, useRef, useState, useEffect } from 'react';
import Icon from '../shared/Icon';
import { useApp } from '../../context/AppContext';
import { voiceExtract, videoReport, createIncident } from '../../api/incidents';
import useVideoRecorder from '../../hooks/useVideoRecorder';
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
    case 'START_VIDEO_PREVIEW': return { ...state, phase: 'video-preview', error: null };
    case 'START_VIDEO_RECORD': return { ...state, phase: 'video-recording', error: null };
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
  const videoRecorder = useVideoRecorder();
  const [state, dispatch] = useReducer(reducer, initial);
  const [manualText, setManualText] = useState('');
  const videoBlobRef = useRef(null);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const [mode, setMode] = useState('live');
  const [exampleOpen, setExampleOpen] = useState(false);

  const close = useCallback(() => {
    speech.stopMic();
    videoRecorder.cleanup();
    setVoiceSheetOpen(false);
  }, [speech, videoRecorder, setVoiceSheetOpen]);

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

  // --- Video mode ---
  const handleOpenCamera = useCallback(async () => {
    dispatch({ type: 'START_VIDEO_PREVIEW' });
    const s = await videoRecorder.startPreview();
    if (!s) dispatch({ type: 'EXTRACT_ERR', payload: videoRecorder.error || 'Could not access camera.' });
  }, [videoRecorder]);

  const handleStartVideoRecording = useCallback(async () => {
    dispatch({ type: 'START_VIDEO_RECORD' });
    videoBlobRef.current = videoRecorder.start();
  }, [videoRecorder]);

  const handleStopVideoAndProcess = useCallback(async () => {
    videoRecorder.stop();
    dispatch({ type: 'START_PROCESS' });
    try {
      const blob = await videoBlobRef.current;
      if (!blob || blob.size === 0) {
        dispatch({ type: 'EXTRACT_ERR', payload: 'No video captured. Try again.' });
        return;
      }
      videoRecorder.stopPreview();
      const result = await videoReport(blob);
      dispatch({ type: 'EXTRACT_OK', payload: result, transcript: result.transcript });
    } catch {
      videoRecorder.stopPreview();
      dispatch({ type: 'MANUAL_REVIEW', transcript: '(Video could not be analyzed — please fill in the details below)' });
    }
  }, [videoRecorder]);

  const handleVideoUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (file.size > 25 * 1024 * 1024) {
      dispatch({ type: 'EXTRACT_ERR', payload: 'Video must be under 25 MB.' });
      return;
    }
    dispatch({ type: 'START_PROCESS' });
    try {
      const result = await videoReport(file);
      dispatch({ type: 'EXTRACT_OK', payload: result, transcript: result.transcript });
    } catch {
      dispatch({ type: 'MANUAL_REVIEW', transcript: '(Video could not be analyzed — please fill in the details below)' });
    }
  }, []);

  useEffect(() => {
    if (videoRef.current && videoRecorder.stream) {
      videoRef.current.srcObject = videoRecorder.stream;
    }
  }, [videoRecorder.stream]);

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
    videoBlobRef.current = null;
    videoRecorder.cleanup();
  }, [speech, videoRecorder]);

  const currentTranscript = mode === 'live' ? speech.transcript : manualText;
  const isActive = state.phase === 'listening' || state.phase === 'video-recording';

  const phaseTitle = {
    idle: mode === 'video' ? 'Video Report' : 'Voice Report',
    listening: 'Listening...',
    'video-preview': 'Video Report',
    'video-recording': 'Recording Video...',
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
              Tap the mic and describe the incident — mention <b>who</b>, <b>what</b>, <b>where</b>, <b>when</b>, and any <b>injuries</b>.
            </div>

            <button
              className={`voice-example-toggle ${exampleOpen ? 'open' : ''}`}
              onClick={() => setExampleOpen(o => !o)}
              aria-expanded={exampleOpen}
              type="button"
            >
              <Icon name="info" size={14} />
              <span>See an example report</span>
              <Icon name="chevDown" size={14} />
            </button>
            <div className={`voice-example-panel ${exampleOpen ? 'open' : ''}`}>
              <div className="voice-example-inner">
                <p className="voice-example-text">
                  "This morning around 9:15 at the Cleveland Plant, a forklift
                  struck a shelving unit in aisle 4 while reversing. The operator,
                  Marcus Rivera, was uninjured but a nearby worker, Priya Singh,
                  was hit by falling boxes and has a bruised left shoulder. First
                  aid was given on site."
                </p>
                <div className="voice-example-covers">
                  <span className="voice-example-tag">Where</span>
                  <span className="voice-example-tag">When</span>
                  <span className="voice-example-tag">What happened</span>
                  <span className="voice-example-tag">Who</span>
                  <span className="voice-example-tag">Injuries</span>
                  <span className="voice-example-tag">Actions taken</span>
                </div>
              </div>
            </div>

            {/* Mode toggle */}
            <div className="voice-mode-toggle">
              <button className={`voice-mode-btn ${mode === 'live' ? 'active' : ''}`} onClick={() => setMode('live')}>
                <Icon name="mic" size={14} /> Voice
              </button>
              <button className={`voice-mode-btn ${mode === 'video' ? 'active' : ''}`} onClick={() => setMode('video')}>
                <Icon name="videocam" size={14} /> Video
              </button>
            </div>

            {mode === 'live' && (
              <>
                <div className="voice-mic-area">
                  <button
                    className="voice-mic-btn"
                    onClick={handleStartLive}
                    aria-label="Start"
                  >
                    <Icon name="mic" size={28} />
                  </button>
                  <div className="voice-listening-label">Tap to start speaking</div>
                </div>

                <div className="voice-or-divider"><span>or type it</span></div>

                <textarea
                  className="textarea voice-transcript"
                  placeholder="Type the incident description here..."
                  value={manualText}
                  onChange={e => setManualText(e.target.value)}
                  rows={3}
                />
              </>
            )}

            {mode === 'video' && (
              <div className="voice-video-area">
                <div className="voice-video-buttons">
                  <button className="voice-video-record-btn" onClick={handleOpenCamera}>
                    <Icon name="videocam" size={24} />
                    <span>Record video</span>
                  </button>
                  <button className="voice-upload-btn" onClick={() => fileInputRef.current?.click()}>
                    <Icon name="upload" size={24} />
                    <span>Upload video</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/3gpp"
                    style={{ display: 'none' }}
                    onChange={handleVideoUpload}
                  />
                </div>
                <div className="voice-video-hint">
                  Film the scene while narrating what happened — AI analyzes both audio and visuals.
                </div>
              </div>
            )}

            {state.error && <div className="voice-error"><Icon name="warning" size={14} /> {state.error}</div>}
            {speech.micError && <div className="voice-error"><Icon name="warning" size={14} /> {speech.micError}</div>}
            {videoRecorder.error && <div className="voice-error"><Icon name="warning" size={14} /> {videoRecorder.error}</div>}

            <div className="voice-sheet-footer">
              <button className="btn btn-secondary" onClick={close}>Cancel</button>
              {mode !== 'video' && (
                <button className="btn btn-primary" onClick={() => handleExtractFromText(manualText)} disabled={!manualText.trim()}>
                  Extract fields
                </button>
              )}
            </div>
          </div>
        )}

        {/* Listening — live SpeechRecognition */}
        {state.phase === 'listening' && (
          <div className="voice-sheet-body">
            <div className="voice-reminder-bar">
              <Icon name="info" size={12} />
              <span>Remember: <b>who</b>, <b>what</b>, <b>where</b>, <b>when</b>, and any <b>injuries</b></span>
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

        {/* Video preview — camera viewfinder before recording */}
        {state.phase === 'video-preview' && (
          <div className="voice-sheet-body">
            <div className="voice-video-viewfinder">
              <video ref={videoRef} autoPlay playsInline muted className="voice-video-preview" />
            </div>
            <div className="voice-sheet-footer">
              <button className="btn btn-secondary" onClick={() => { videoRecorder.stopPreview(); dispatch({ type: 'BACK_TO_IDLE' }); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleStartVideoRecording}>
                <Icon name="videocam" size={16} /> Start Recording
              </button>
            </div>
          </div>
        )}

        {/* Video recording — viewfinder with rec indicator */}
        {state.phase === 'video-recording' && (
          <div className="voice-sheet-body">
            <div className="voice-reminder-bar">
              <Icon name="info" size={12} />
              <span>Narrate what happened — AI analyzes <b>audio</b> and <b>visuals</b></span>
            </div>
            <div className="voice-video-viewfinder">
              <video ref={videoRef} autoPlay playsInline muted className="voice-video-preview" />
              <div className="voice-video-rec-indicator">
                <span className="voice-video-rec-dot" />
                <span>{formatTime(videoRecorder.duration)}</span>
              </div>
            </div>
            <div className="voice-sheet-footer">
              <button className="btn btn-primary" onClick={handleStopVideoAndProcess} style={{ flex: 1 }}>
                Stop & Analyze
              </button>
            </div>
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
