import { createPortal } from 'react-dom';
import Icon from '../shared/Icon';
import { useApp } from '../../context/AppContext';
import VoiceBottomSheet from './VoiceBottomSheet';
import '../../styles/voice.css';

export default function GlobalVoiceFab() {
  const { voiceSheetOpen, setVoiceSheetOpen, wizardOpen } = useApp();

  if (wizardOpen) return null;

  return createPortal(
    <>
      {!voiceSheetOpen && (
        <button
          className="voice-fab"
          onClick={() => setVoiceSheetOpen(true)}
          aria-label="Report incident by voice"
          title="Voice report"
        >
          <Icon name="mic" size={22} />
          <span className="voice-fab-pulse" />
        </button>
      )}
      {voiceSheetOpen && <VoiceBottomSheet />}
    </>,
    document.body
  );
}
