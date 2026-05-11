import { useState, useRef, useCallback, useEffect } from 'react';

const SpeechRecognition =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

export const speechSupported = !!SpeechRecognition;

export default function useSpeechRecognition() {
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState(null);
  const recognitionRef = useRef(null);
  const stoppedByUserRef = useRef(false);
  const finalAccRef = useRef('');

  const stop = useCallback(() => {
    stoppedByUserRef.current = true;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!SpeechRecognition) return;
    stop();
    setMicError(null);
    stoppedByUserRef.current = false;
    finalAccRef.current = '';

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onaudiostart = () => {
      console.log('[Speech] Audio capture started — mic is live');
    };

    rec.onspeechstart = () => {
      console.log('[Speech] Speech detected');
    };

    rec.onspeechend = () => {
      console.log('[Speech] Speech ended');
    };

    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalAccRef.current += e.results[i][0].transcript;
          console.log('[Speech] Final:', e.results[i][0].transcript);
        } else {
          interim = e.results[i][0].transcript;
        }
      }
      setTranscript((finalAccRef.current + ' ' + interim).trim());
    };

    rec.onend = () => {
      console.log('[Speech] onend fired, stoppedByUser:', stoppedByUserRef.current);
      if (!stoppedByUserRef.current) {
        console.log('[Speech] Auto-restarting...');
        try {
          rec.start();
          return;
        } catch (e) {
          console.warn('[Speech] Restart failed:', e.message);
        }
      }
      recognitionRef.current = null;
      setListening(false);
    };

    rec.onerror = (e) => {
      console.error('[Speech] Error:', e.error, e.message);
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed') {
        setMicError('Microphone permission denied. Check browser settings.');
        stoppedByUserRef.current = true;
        recognitionRef.current = null;
        setListening(false);
        return;
      }
      if (e.error === 'network') {
        setMicError('Speech recognition requires internet (Chrome sends audio to Google servers).');
        stoppedByUserRef.current = true;
        recognitionRef.current = null;
        setListening(false);
        return;
      }
      setMicError(`Speech error: ${e.error}`);
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
      console.log('[Speech] rec.start() called successfully');
    } catch (e) {
      console.error('[Speech] start() threw:', e.message);
      setMicError(`Could not start: ${e.message}`);
      setListening(false);
    }
  }, [stop]);

  const toggleMic = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    finalAccRef.current = '';
  }, []);

  useEffect(() => {
    return () => {
      stoppedByUserRef.current = true;
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
    };
  }, []);

  return {
    transcript, setTranscript, listening, micError,
    toggleMic, stopMic: stop, startRec: start, resetTranscript, speechSupported,
  };
}
