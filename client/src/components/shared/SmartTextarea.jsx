import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from './Icon';
import '../../styles/smart-textarea.css';

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

export default function SmartTextarea({
  value,
  onChange,
  examples,
  chips,
  placeholder,
  multiline = true,
  rows = 3,
  className,
  inputClassName,
  autoFocus,
  disabled,
  mic = true,
  onKeyDown,
}) {
  const [phIdx, setPhIdx] = useState(() => Math.floor(Math.random() * (examples?.length || 1)));
  const [phVisible, setPhVisible] = useState(true);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);
  const baseTextRef = useRef('');

  useEffect(() => {
    if (!examples?.length || value) return;
    const interval = setInterval(() => {
      setPhVisible(false);
      setTimeout(() => {
        setPhIdx(i => (i + 1) % examples.length);
        setPhVisible(true);
      }, 400);
    }, 4000);
    return () => clearInterval(interval);
  }, [value, examples?.length]);

  const toggleMic = useCallback(() => {
    if (!SpeechRecognition) return;
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    baseTextRef.current = value || '';
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
      const separator = base && !base.endsWith(' ') ? ' ' : '';
      onChange(base + separator + finalTranscript + interim);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
    inputRef.current?.focus();
  }, [listening, value, onChange]);

  useEffect(() => {
    return () => { if (recognitionRef.current) recognitionRef.current.stop(); };
  }, []);

  const showMic = mic && SpeechRecognition && !disabled;
  const showPlaceholder = examples?.length > 0 && !value;
  const showChips = chips?.length > 0 && !value;
  const Tag = multiline ? 'textarea' : 'input';
  const extraProps = multiline ? { rows } : { type: 'text' };

  return (
    <div className={`st-wrap ${multiline ? '' : 'st-single'} ${disabled ? 'st-disabled' : ''} ${className || ''}`}>
      <div className="st-field">
        <Tag
          ref={inputRef}
          className={`st-input ${inputClassName || (multiline ? 'textarea' : 'input')}`}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          {...extraProps}
        />
        {showPlaceholder && (
          <div className={`st-ph ${phVisible ? 'visible' : ''}`}>
            {examples[phIdx]}
          </div>
        )}
        {showMic && (
          <button
            type="button"
            className={`st-mic ${listening ? 'recording' : ''}`}
            onClick={toggleMic}
            title={listening ? 'Stop recording' : 'Voice input'}
          >
            <Icon name="mic" size={14} />
            {listening && <span className="st-mic-pulse" />}
          </button>
        )}
      </div>
      {showChips && (
        <div className="st-chips">
          {chips.map((chip, i) => (
            <button
              key={i}
              type="button"
              className="st-chip"
              onClick={() => onChange(typeof chip === 'string' ? chip : chip.text)}
            >
              {typeof chip === 'string' ? chip : chip.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
