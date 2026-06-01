import { useState, useRef, useCallback, useEffect } from "react";

const UNSUPPORTED_MSG =
  "Hlasové ovládání v tomto prohlížeči nemusí fungovat. Zkuste prosím Chrome nebo napište zprávu ručně.";
const PERMISSION_DENIED_MSG =
  "Mikrofon není povolený. Povolte prosím mikrofon v nastavení prohlížeči, nebo napište zprávu ručně.";

const VOICE_DEDUP_MS = 2000;
const RESTART_AFTER_EMPTY_SILENCE_MS = 500;
const RESTART_AFTER_RESPONSE_MS = 700;
const NEAR_SEND_LEAD_MS = 1200;

function getSpeechRecognition(): SpeechRecognition | null {
  const Ctor =
    window.SpeechRecognition ||
    (window as Window & { webkitSpeechRecognition?: SpeechRecognitionConstructor })
      .webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor();
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognition() !== null;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function endsWithSentencePunctuation(text: string): boolean {
  return /[.!?…]$/.test(text.trim());
}

/** Dynamická doba ticha před odesláním podle délky věty. */
export function getSilenceDelay(transcript: string): number {
  const trimmed = transcript.trim();
  if (!trimmed) return 3000;

  const words = countWords(trimmed);
  let delay: number;

  if (words <= 1) {
    delay = 4500;
  } else if (words <= 3) {
    delay = 3500;
  } else {
    delay = 2800;
  }

  if (endsWithSentencePunctuation(trimmed)) {
    delay = Math.max(1500, delay - 800);
  }

  return delay;
}

type VoiceInputProps = {
  voiceModeEnabled: boolean;
  onVoiceModeChange: (enabled: boolean) => void;
  isThinking: boolean;
  isSpeaking: boolean;
  disabled?: boolean;
  readAloudEnabled?: boolean;
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
};

export default function VoiceInput({
  voiceModeEnabled,
  onVoiceModeChange,
  isThinking,
  isSpeaking,
  disabled = false,
  readAloudEnabled = true,
  onTranscript,
  onInterimTranscript,
}: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [hasDetectedText, setHasDetectedText] = useState(false);
  const [previewTranscript, setPreviewTranscript] = useState("");
  const [nearSend, setNearSend] = useState(false);
  const [userStoppedVoiceMode, setUserStoppedVoiceMode] = useState(false);
  const [showContinueHint, setShowContinueHint] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nearSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestTranscriptRef = useRef("");
  const accumulatedFinalRef = useRef("");
  const silenceDueAtRef = useRef(0);
  const silenceFiredRef = useRef(false);
  const hasTranscriptRef = useRef(false);
  const lastVoiceTranscriptRef = useRef("");
  const lastVoiceSentAtRef = useRef(0);
  const isSendingVoiceRef = useRef(false);
  const isStartingRef = useRef(false);
  const prevVoiceModeRef = useRef(false);
  const prevThinkingRef = useRef(false);

  const voiceModeRef = useRef(voiceModeEnabled);
  const thinkingRef = useRef(isThinking);
  const speakingRef = useRef(isSpeaking);
  const disabledRef = useRef(disabled);

  voiceModeRef.current = voiceModeEnabled;
  thinkingRef.current = isThinking;
  speakingRef.current = isSpeaking;
  disabledRef.current = disabled;

  const supported = isSpeechRecognitionSupported();

  const clearTranscriptRefs = useCallback(() => {
    latestTranscriptRef.current = "";
    accumulatedFinalRef.current = "";
    hasTranscriptRef.current = false;
    silenceDueAtRef.current = 0;
    silenceFiredRef.current = false;
    setHasDetectedText(false);
    setPreviewTranscript("");
    setNearSend(false);
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (nearSendTimerRef.current) {
      clearTimeout(nearSendTimerRef.current);
      nearSendTimerRef.current = null;
    }
    setNearSend(false);
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const updateLatestTranscript = useCallback((text: string) => {
    const trimmed = text.trim();
    latestTranscriptRef.current = trimmed;
    hasTranscriptRef.current = trimmed.length > 0;
    setHasDetectedText(trimmed.length > 0);
    setPreviewTranscript(trimmed);
    if (trimmed) {
      onInterimTranscript?.(trimmed);
    }
  }, [onInterimTranscript]);

  const sendFinalTranscript = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return false;

      const now = Date.now();
      if (
        text === lastVoiceTranscriptRef.current &&
        now - lastVoiceSentAtRef.current < VOICE_DEDUP_MS
      ) {
        return false;
      }
      if (isSendingVoiceRef.current) return false;

      isSendingVoiceRef.current = true;
      lastVoiceTranscriptRef.current = text;
      lastVoiceSentAtRef.current = now;
      onInterimTranscript?.("");
      onTranscript(text);

      window.setTimeout(() => {
        isSendingVoiceRef.current = false;
      }, VOICE_DEDUP_MS);

      return true;
    },
    [onTranscript, onInterimTranscript]
  );

  const stopRecognitionEngine = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    setIsListening(false);
    isStartingRef.current = false;

    if (!recognition) return;

    try {
      recognition.stop();
    } catch {
      try {
        recognition.abort();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const stopListening = useCallback(
    (options?: { discardTranscript?: boolean }) => {
      clearSilenceTimer();
      clearRestartTimer();
      isStartingRef.current = false;

      if (options?.discardTranscript) {
        clearTranscriptRefs();
      }

      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      setIsListening(false);

      if (recognition) {
        try {
          recognition.abort();
        } catch {
          try {
            recognition.stop();
          } catch {
            /* ignore */
          }
        }
      }
    },
    [clearSilenceTimer, clearRestartTimer, clearTranscriptRefs]
  );

  const handleSilenceTimeout = useCallback(() => {
    silenceTimerRef.current = null;
    silenceFiredRef.current = true;
    setNearSend(false);

    const text = latestTranscriptRef.current.trim();

    if (text) {
      if (recognitionRef.current) {
        stopRecognitionEngine();
      }
      clearTranscriptRefs();
      setShowContinueHint(false);
      sendFinalTranscript(text);
      return;
    }

    if (recognitionRef.current) {
      stopRecognitionEngine();
    }
  }, [clearTranscriptRefs, stopRecognitionEngine, sendFinalTranscript]);

  const resetSilenceTimer = useCallback(
    (transcript: string) => {
      clearSilenceTimer();
      silenceFiredRef.current = false;

      const delay = getSilenceDelay(transcript);
      silenceDueAtRef.current = Date.now() + delay;

      const nearLead = Math.max(0, delay - NEAR_SEND_LEAD_MS);
      if (nearLead > 0 && transcript.trim()) {
        nearSendTimerRef.current = setTimeout(() => {
          nearSendTimerRef.current = null;
          if (hasTranscriptRef.current && !silenceFiredRef.current) {
            setNearSend(true);
          }
        }, nearLead);
      }

      silenceTimerRef.current = setTimeout(handleSilenceTimeout, delay);
    },
    [clearSilenceTimer, handleSilenceTimeout]
  );

  const requestListeningRestart = useCallback(
    (delayMs: number, options?: { preserveTranscript?: boolean }) => {
      clearRestartTimer();

      if (
        !voiceModeRef.current ||
        disabledRef.current ||
        thinkingRef.current ||
        speakingRef.current ||
        recognitionRef.current ||
        isStartingRef.current ||
        isSendingVoiceRef.current
      ) {
        return;
      }

      if (!options?.preserveTranscript && hasTranscriptRef.current) {
        return;
      }

      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        if (
          !voiceModeRef.current ||
          disabledRef.current ||
          thinkingRef.current ||
          speakingRef.current ||
          recognitionRef.current ||
          isStartingRef.current ||
          isSendingVoiceRef.current
        ) {
          return;
        }
        startListeningRef.current(options?.preserveTranscript ?? false);
      }, delayMs);
    },
    [clearRestartTimer]
  );

  const handleRecognitionEnd = useCallback(() => {
    setIsListening(false);
    recognitionRef.current = null;
    isStartingRef.current = false;

    if (isSendingVoiceRef.current || silenceFiredRef.current) {
      if (!isSendingVoiceRef.current) {
        clearTranscriptRefs();
      }
      return;
    }

    const text = latestTranscriptRef.current.trim();
    const waitingForSilence =
      hasTranscriptRef.current && Date.now() < silenceDueAtRef.current;

    if (waitingForSilence && text) {
      requestListeningRestart(0, { preserveTranscript: true });
      return;
    }

    if (hasTranscriptRef.current && text) {
      clearTranscriptRefs();
      sendFinalTranscript(text);
      return;
    }

    clearTranscriptRefs();

    if (
      voiceModeRef.current &&
      !disabledRef.current &&
      !thinkingRef.current &&
      !speakingRef.current &&
      !isSendingVoiceRef.current
    ) {
      requestListeningRestart(RESTART_AFTER_EMPTY_SILENCE_MS);
    }
  }, [
    clearTranscriptRefs,
    sendFinalTranscript,
    requestListeningRestart,
  ]);

  const startListeningRef = useRef<(preserveTranscript?: boolean) => void>(
    () => {}
  );

  startListeningRef.current = (preserveTranscript = false) => {
    if (
      !voiceModeRef.current ||
      disabledRef.current ||
      thinkingRef.current ||
      speakingRef.current ||
      !supported ||
      isSendingVoiceRef.current
    ) {
      return;
    }

    if (recognitionRef.current || isStartingRef.current) {
      return;
    }

    isStartingRef.current = true;
    setStatusError(null);
    setShowContinueHint(false);

    if (!preserveTranscript) {
      clearTranscriptRefs();
    }

    const recognition = getSpeechRecognition();
    if (!recognition) {
      isStartingRef.current = false;
      return;
    }

    recognition.lang = "cs-CZ";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = "";
      let newFinal = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const chunk = result[0]?.transcript ?? "";
        if (result.isFinal) {
          newFinal += chunk;
        } else {
          interimTranscript += chunk;
        }
      }

      if (newFinal.trim()) {
        accumulatedFinalRef.current = `${accumulatedFinalRef.current} ${newFinal}`
          .trim();
      }

      const preview = interimTranscript.trim()
        ? `${accumulatedFinalRef.current} ${interimTranscript}`.trim()
        : accumulatedFinalRef.current.trim();

      if (preview) {
        updateLatestTranscript(preview);
        resetSilenceTimer(preview);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      clearSilenceTimer();
      isStartingRef.current = false;
      setIsListening(false);
      recognitionRef.current = null;

      if (event.error === "no-speech") {
        if (
          voiceModeRef.current &&
          !thinkingRef.current &&
          !speakingRef.current &&
          !hasTranscriptRef.current
        ) {
          requestListeningRestart(RESTART_AFTER_EMPTY_SILENCE_MS);
        }
        return;
      }

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setStatusError(PERMISSION_DENIED_MSG);
        onVoiceModeChange(false);
      }
    };

    recognition.onend = () => {
      handleRecognitionEnd();
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
      isStartingRef.current = false;

      const existing = latestTranscriptRef.current.trim();
      const silenceStillPending =
        preserveTranscript &&
        silenceTimerRef.current !== null &&
        Date.now() < silenceDueAtRef.current;

      if (existing && !silenceStillPending) {
        resetSilenceTimer(existing);
      } else if (!existing && !silenceStillPending) {
        resetSilenceTimer("");
      }
    } catch {
      setIsListening(false);
      recognitionRef.current = null;
      isStartingRef.current = false;
      clearSilenceTimer();
    }
  };

  useEffect(() => {
    const justEnabled = voiceModeEnabled && !prevVoiceModeRef.current;
    prevVoiceModeRef.current = voiceModeEnabled;

    if (!voiceModeEnabled || disabled || isThinking || isSpeaking) {
      stopListening({ discardTranscript: true });
      return;
    }

    if (!supported) return;

    requestListeningRestart(justEnabled ? 0 : RESTART_AFTER_RESPONSE_MS);

    return () => {
      clearRestartTimer();
    };
  }, [
    voiceModeEnabled,
    disabled,
    isThinking,
    isSpeaking,
    supported,
    stopListening,
    requestListeningRestart,
    clearRestartTimer,
  ]);

  useEffect(() => {
    const finishedThinking =
      prevThinkingRef.current && !isThinking && voiceModeEnabled;
    prevThinkingRef.current = isThinking;

    if (finishedThinking && !isSpeaking && !readAloudEnabled) {
      setShowContinueHint(true);
    }
    if (isThinking || isSpeaking) {
      setShowContinueHint(false);
    }
  }, [isThinking, isSpeaking, voiceModeEnabled, readAloudEnabled]);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      clearRestartTimer();
      stopListening();
    };
  }, [clearSilenceTimer, clearRestartTimer, stopListening]);

  const handleStartConversation = () => {
    if (!supported) {
      setStatusError(UNSUPPORTED_MSG);
      return;
    }
    setStatusError(null);
    setUserStoppedVoiceMode(false);
    setShowContinueHint(false);
    clearTranscriptRefs();
    onVoiceModeChange(true);
  };

  const handleEndConversation = () => {
    clearSilenceTimer();
    clearRestartTimer();
    clearTranscriptRefs();
    isSendingVoiceRef.current = false;
    isStartingRef.current = false;
    onInterimTranscript?.("");
    stopListening({ discardTranscript: true });
    setShowContinueHint(false);
    setUserStoppedVoiceMode(true);
    onVoiceModeChange(false);
    setStatusError(null);
  };

  const wordCount = countWords(previewTranscript);

  const statusLabel = (() => {
    if (statusError) return statusError;
    if (userStoppedVoiceMode && !voiceModeEnabled) {
      return "Rozhovor je ukončen.";
    }
    if (!voiceModeEnabled) return null;
    if (isSpeaking) return "Mello mluví…";
    if (isThinking) return "Mello přemýšlí…";
    if (isListening && hasDetectedText) {
      if (nearSend) return "Rozumím, ještě chvíli počkám…";
      if (wordCount <= 3) return "Poslouchám, můžete pokračovat…";
      return "Mello poslouchá…";
    }
    if (isListening) return "Mello poslouchá…";
    if (showContinueHint) return "Můžete pokračovat v rozhovoru.";
    return "Čekám, až promluvíte…";
  })();

  if (!supported && !voiceModeEnabled) {
    return (
      <div className="flex flex-col items-center gap-4 w-full">
        <p
          className="text-center text-lg font-medium text-amber-900 max-w-md bg-amber-50 border-2 border-amber-200 rounded-2xl p-4"
          role="status"
        >
          {UNSUPPORTED_MSG}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {!voiceModeEnabled ? (
        <button
          type="button"
          onClick={handleStartConversation}
          disabled={disabled}
          className="w-full max-w-md min-h-[72px] px-8 py-5 rounded-2xl text-xl font-bold text-white bg-blue-700 hover:bg-blue-800 shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed border-2 border-blue-900"
          aria-label="Začít povídat s Mellou"
        >
          Začít povídat
        </button>
      ) : (
        <button
          type="button"
          onClick={handleEndConversation}
          className="w-full max-w-md min-h-[72px] px-8 py-5 rounded-2xl text-xl font-bold text-white bg-gray-700 hover:bg-gray-800 shadow-lg transition border-2 border-gray-900"
          aria-label="Ukončit hlasový rozhovor"
        >
          Ukončit rozhovor
        </button>
      )}

      {statusLabel && (
        <p
          className={`text-center text-2xl font-bold max-w-md ${
            statusError ? "text-red-800" : "text-emerald-900"
          }`}
          role="status"
          aria-live="polite"
        >
          {statusLabel}
        </p>
      )}

      {!voiceModeEnabled && !statusError && !userStoppedVoiceMode && (
        <p className="text-center text-lg text-gray-700 max-w-md">
          Můžete napsat zprávu ručně.
        </p>
      )}
    </div>
  );
}
