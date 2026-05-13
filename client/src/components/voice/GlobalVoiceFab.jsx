import { createPortal } from 'react-dom';
import { useState, useEffect } from 'react';
import Icon from '../shared/Icon';
import { useApp } from '../../context/AppContext';
import VoiceBottomSheet from './VoiceBottomSheet';
import '../../styles/voice.css';

const FAB_ICONS = ['mic', 'videocam'];

export default function GlobalVoiceFab() {
  const { voiceSheetOpen, setVoiceSheetOpen, wizardOpen } = useApp();
  const [iconIdx, setIconIdx] = useState(0);

  useEffect(() => {
    if (voiceSheetOpen) return;
    const id = setInterval(() => setIconIdx(i => (i + 1) % FAB_ICONS.length), 3000);
    return () => clearInterval(id);
  }, [voiceSheetOpen]);

  if (wizardOpen) return null;

  return createPortal(
    <>
      {!voiceSheetOpen && (
        <button
          className="voice-fab"
          onClick={() => setVoiceSheetOpen(true)}
          aria-label="Report incident"
          title="AI Report — voice or video"
        >
          <span className="voice-fab-icon-wrap">
            {FAB_ICONS.map((name, i) => (
              <span key={name} className={`voice-fab-icon ${i === iconIdx ? 'active' : ''}`}>
                <Icon name={name} size={22} />
              </span>
            ))}
          </span>
          <span className="voice-fab-pulse" />
        </button>
      )}
      {voiceSheetOpen && <VoiceBottomSheet />}
    </>,
    document.body
  );
}
