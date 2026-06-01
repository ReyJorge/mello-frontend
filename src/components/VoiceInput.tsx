import VoiceOrb from "./VoiceOrb";
import {
  useVoiceConversation,
  isSpeechRecognitionSupported,
  getVoiceUnsupportedMessage,
  type VoiceLoopState,
} from "../hooks/useVoiceConversation";

export {
  isSpeechRecognitionSupported,
  getVoiceUnsupportedMessage,
  getSilenceDelay,
} from "../hooks/useVoiceConversation";
export type { VoiceLoopState };

type VoiceInputProps = {
  voiceModeEnabled: boolean;
  onVoiceModeChange: (enabled: boolean) => void;
  isThinking: boolean;
  isSpeaking: boolean;
  isMemoryBusy?: boolean;
  isBlocked?: boolean;
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onStateChange?: (state: VoiceLoopState) => void;
  showDebug?: boolean;
};

const PHASE_LABELS: Record<VoiceLoopState["phase"], string> = {
  idle: "",
  listening: "Poslouchám",
  "user-speaking": "Poslouchám vás",
  thinking: "Přemýšlím",
  speaking: "Mello mluví",
  memory: "Ukládám vzpomínku",
  restarting: "Obnovuji poslech",
  ended: "Rozhovor ukončen",
};

export default function VoiceInput({
  voiceModeEnabled,
  onVoiceModeChange,
  isThinking,
  isSpeaking,
  isMemoryBusy = false,
  isBlocked = false,
  disabled = false,
  onTranscript,
  onInterimTranscript,
  onStateChange,
  showDebug = import.meta.env.DEV,
}: VoiceInputProps) {
  const supported = isSpeechRecognitionSupported();
  const voiceUnsupportedMessage = getVoiceUnsupportedMessage();

  const voice = useVoiceConversation({
    voiceModeEnabled,
    onVoiceModeChange,
    isMelloThinking: isThinking,
    isMelloSpeaking: isSpeaking,
    isMemoryBusy,
    isBlocked: isBlocked || disabled,
    onTranscript,
    onInterimTranscript,
    onStateChange,
  });

  const statusLabel = (() => {
    if (!supported && !voiceModeEnabled) return voiceUnsupportedMessage;
    if (voice.needsManualContinue && voice.conversationActive) {
      return "Klepněte pro obnovení poslechu";
    }
    return PHASE_LABELS[voice.phase] || "";
  })();

  const orbActive =
    voice.recognitionRunning &&
    (voice.phase === "listening" || voice.phase === "user-speaking");

  if (!supported && !voiceModeEnabled) {
    return (
      <p
        className="text-center text-base text-amber-900/90 max-w-sm mx-auto bg-amber-50/90 backdrop-blur rounded-2xl p-4 border border-amber-200/60"
        role="status"
      >
        {voiceUnsupportedMessage}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {voiceModeEnabled && (
        <VoiceOrb phase={voice.phase} active={orbActive} />
      )}

      {statusLabel && (
        <p
          className="text-center text-lg sm:text-xl font-semibold text-white/95 tracking-tight"
          role="status"
          aria-live="polite"
        >
          {statusLabel}
        </p>
      )}

      {voice.lastTranscript && voice.recognitionRunning && (
        <p className="text-center text-sm text-white/70 max-w-xs line-clamp-2 px-4">
          „{voice.lastTranscript}"
        </p>
      )}

      {!voiceModeEnabled ? (
        <button
          type="button"
          onClick={() => voice.startConversation()}
          disabled={disabled}
          className="mello-btn-primary w-full max-w-sm min-h-[60px] px-8 py-4 rounded-2xl text-lg font-bold text-white shadow-xl"
          aria-label="Začít povídat s Mellou"
        >
          Začít povídat
        </button>
      ) : (
        <button
          type="button"
          onClick={voice.endConversation}
          className="mello-btn-secondary w-full max-w-sm min-h-[56px] px-8 py-3 rounded-2xl text-lg font-semibold"
          aria-label="Ukončit hlasový rozhovor"
        >
          Ukončit rozhovor
        </button>
      )}

      {voice.needsManualContinue && voice.conversationActive && (
        <button
          type="button"
          onClick={voice.manualContinue}
          className="mello-btn-primary w-full max-w-sm min-h-[60px] px-8 py-4 rounded-2xl text-lg font-bold"
        >
          Pokračovat v poslechu
        </button>
      )}

      {!voiceModeEnabled && !voice.userEnded && (
        <p className="text-center text-sm text-white/60">
          Nebo napište zprávu do pole níže
        </p>
      )}

      {showDebug && voice.conversationActive && (
        <p
          data-voice-debug
          className="text-[10px] text-white/40 font-mono text-center"
        >
          conv={voice.conversationActive ? 1 : 0} rec=
          {voice.recognitionRunning ? 1 : 0} user=
          {voice.isUserSpeaking ? 1 : 0} proc={voice.isProcessing ? 1 : 0}
        </p>
      )}
    </div>
  );
}
