import { useState, useRef, useCallback, useEffect } from 'react';

export default function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const resolveRef = useRef(null);

  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch {}
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setDuration(0);
    chunksRef.current = [];

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const msg = e.name === 'NotAllowedError'
        ? 'Microphone permission denied. Check your browser settings.'
        : e.name === 'NotFoundError'
        ? 'No microphone found on this device.'
        : `Microphone error: ${e.message}`;
      setError(msg);
      return null;
    }

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : MediaRecorder.isTypeSupported('audio/mp4')
      ? 'audio/mp4'
      : '';

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      clearInterval(timerRef.current);
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      if (resolveRef.current) {
        resolveRef.current(blob);
        resolveRef.current = null;
      }
    };

    recorder.onerror = () => {
      setError('Recording failed.');
      cleanup();
      setRecording(false);
    };

    recorder.start(1000);
    setRecording(true);

    timerRef.current = setInterval(() => {
      setDuration(d => d + 1);
    }, 1000);

    return new Promise((resolve) => { resolveRef.current = resolve; });
  }, [cleanup]);

  const stop = useCallback(() => {
    setRecording(false);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  useEffect(() => { return cleanup; }, [cleanup]);

  return { recording, duration, error, start, stop };
}
