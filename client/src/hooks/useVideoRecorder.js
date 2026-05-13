import { useState, useRef, useCallback, useEffect } from 'react';

export default function useVideoRecorder() {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const [stream, setStream] = useState(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const resolveRef = useRef(null);
  const streamRef = useRef(null);

  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch {}
    }
    recorderRef.current = null;
    chunksRef.current = [];
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setStream(null);
    setRecording(false);
  }, []);

  const startPreview = useCallback(async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = s;
      setStream(s);
      return s;
    } catch (e) {
      const msg = e.name === 'NotAllowedError'
        ? 'Camera permission denied. Check your browser settings.'
        : e.name === 'NotFoundError'
        ? 'No camera found on this device.'
        : `Camera error: ${e.message}`;
      setError(msg);
      return null;
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setDuration(0);
    chunksRef.current = [];

    let s = streamRef.current;
    if (!s) {
      s = await startPreview();
      if (!s) return null;
    }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : MediaRecorder.isTypeSupported('video/mp4')
      ? 'video/mp4'
      : '';

    const recorder = new MediaRecorder(s, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      clearInterval(timerRef.current);
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
      if (resolveRef.current) {
        resolveRef.current(blob);
        resolveRef.current = null;
      }
    };

    recorder.onerror = () => {
      setError('Video recording failed.');
      cleanup();
    };

    recorder.start(1000);
    setRecording(true);

    timerRef.current = setInterval(() => {
      setDuration(d => d + 1);
    }, 1000);

    return new Promise((resolve) => { resolveRef.current = resolve; });
  }, [cleanup, startPreview]);

  const stop = useCallback(() => {
    setRecording(false);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const stopPreview = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setStream(null);
  }, []);

  useEffect(() => { return cleanup; }, [cleanup]);

  return { recording, duration, error, stream, start, stop, startPreview, stopPreview, cleanup };
}
