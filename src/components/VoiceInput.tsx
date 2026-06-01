import { useState, useRef, useCallback, useEffect } from "react";

const UNSUPPORTED_MSG =
  "Hlasové ovládání v tomto prohlížeči nemusí fungovat. Zkuste prosím Chrome nebo napište zprávu ručně.";
const IOS_SAFARI_VOICE_MSG =
  "Na iPhonu a iPadu (Safari) hlasové ovládání bohužel nefunguje. Napište zprávu ručně do pole níže — Mello vám ráda odpoví.";
const PERMISSION_DENIED_MSG =
  "Mikrofon není povolený. Povolte prosím mikrofon v nastavení prohlížeči, nebo napište zprávu ručně.";

const VOICE_SEND_DEDUP_MS = 2000;
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

function isIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/i.test(ua);
  return isIOS && isSafari;
}

export function getVoiceUnsupportedMessage(): string {
  if (isIOSSafari()) return IOS_SAFARI_VOICE_MSG;
  return UNSUPPORTED_MSG;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function endsWithSentencePunctuation(text: string): boolean {
  return /[.!?…]$/.test(text.trim());
}

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
  const [needsManualContinue, setNeedsManualContinue] = useState(false);
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
  const lastSentTranscriptRef = useRef("");
  const lastSentAtRef = useRef(0);
  const isStartingRef = useRef(false);
  const prevSpeakingRef = useRef(false);
  const prevThinkingRef = useRef(false);
  const prevVoiceModeRef = useRef(false);

  const voiceModeRef = useRef(voiceModeEnabled);
  const thinkingRef = useRef(isThinking);
  const speakingRef = useRef(isSpeaking);
  const disabledRef = useRef(disabled);

  voiceModeRef.current = voiceModeEnabled;
  thinkingRef.current = isThinking;
  speakingRef.current = isSpeaking;
  disabledRef.current = disabled;

  const supported = isSpeechRecognitionSupported();
  const voiceUnsupportedMessage = getVoiceUnsupportedMessage();
  const isProcessing = isThinking || isSpeaking;

  const logVoiceState = useCallback(
    (label: string, extra?: Record<string, unknown>) => {
      console.log("VOICE state", {
        label,
        isListening,
        isSpeaking,
        isThinking,
        isProcessing,
        voiceModeEnabled,
        needsManualContinue,
        statusError,
        silenceFired: silenceFiredRef.current,
        ...extra,
      });
    },
    [isListening, isSpeaking, isThinking, isProcessing, voiceModeEnabled, needsManualContinue, statusError]
  );

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

  const canListenNow = useCallback(() => {
    return (
      voiceModeRef.current &&
      !disabledRef.current &&
      !thinkingRef.current &&
      !speakingRef.current &&
      supported
    );
  }, [supported]);

  const updateLatestTranscript = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      latestTranscriptRef.current = trimmed;
      hasTranscriptRef.current = trimmed.length > 0;
      setHasDetectedText(trimmed.length > 0);
      setPreviewTranscript(trimmed);
      if (trimmed) {
        onInterimTranscript?.(trimmed);
      }
    },
    [onInterimTranscript]
  );

  const sendFinalTranscript = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return false;

      const now = Date.now();
      if (
        text === lastSentTranscriptRef.current &&
        now - lastSentAtRef.current < VOICE_SEND_DEDUP_MS
      ) {
        logVoiceState("sendFinalTranscript deduped", { text });
        return false;
      }

      lastSentTranscriptRef.current = text;
      lastSentAtRef.current = now;
      silenceFiredRef.current = false;
      onInterimTranscript?.("");
      logVoiceState("sendFinalTranscript", { text });
      onTranscript(text);
      return true;
    },
    [onTranscript, onInterimTranscript, logVoiceState]
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
    logVoiceState("silence timeout", { text });

    if (text) {
      if (recognitionRef.current) {
        stopRecognitionEngine();
      }
      clearTranscriptRefs();
      sendFinalTranscript(text);
      return;
    }

    if (recognitionRef.current) {
      stopRecognitionEngine();
    }
  }, [clearTranscriptRefs, stopRecognitionEngine, sendFinalTranscript, logVoiceState]);

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

  const startListeningRef = useRef<(preserveTranscript?: boolean) => void>(() => {});

  startListeningRef.current = (preserveTranscript = false) => {
    if (!canListenNow()) {
      logVoiceState("startListening blocked", {
        thinking: thinkingRef.current,
        speaking: speakingRef.current,
      });
      return false;
    }

    if (recognitionRef.current || isStartingRef.current) {
      return true;
    }

    isStartingRef.current = true;
    setStatusError(null);
    setNeedsManualContinue(false);

    if (!preserveTranscript) {
      clearTranscriptRefs();
    }

    const recognition = getSpeechRecognition();
    if (!recognition) {
      isStartingRef.current = false;
      setNeedsManualContinue(true);
      return false;
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
      console.log("recognition error", event.error);
      clearSilenceTimer();
      isStartingRef.current = false;
      setIsListening(false);
      recognitionRef.current = null;

      if (event.error === "no-speech" || event.error === "aborted") {
        if (canListenNow()) {
          scheduleListeningRestartRef.current(RESTART_AFTER_EMPTY_SILENCE_MS);
        }
        return;
      }

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setStatusError(PERMISSION_DENIED_MSG);
        onVoiceModeChange(false);
        return;
      }

      if (canListenNow()) {
        setNeedsManualContinue(true);
        logVoiceState("recognition error needs manual continue", {
          error: event.error,
        });
      }
    };

    recognition.onend = () => {
      console.log("recognition onend");
      handleRecognitionEndRef.current();
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
      isStartingRef.current = false;
      logVoiceState("recognition started");

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
      return true;
    } catch (err) {
      console.log("recognition start failed", err);
      setIsListening(false);
      recognitionRef.current = null;
      isStartingRef.current = false;
      clearSilenceTimer();
      setNeedsManualContinue(true);
      logVoiceState("recognition start failed");
      return false;
    }
  };

  const scheduleListeningRestartRef = useRef<(delayMs: number) => void>(() => {});

  scheduleListeningRestartRef.current = (delayMs: number) => {
    clearRestartTimer();

    if (!canListenNow()) {
      return;
    }

    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (!canListenNow()) return;

      silenceFiredRef.current = false;
      const started = startListeningRef.current(false);
      if (!started) {
        setNeedsManualContinue(true);
        logVoiceState("auto restart failed, manual continue");
      } else {
        logVoiceState("auto restart success");
      }
    }, delayMs);
  };

  const handleRecognitionEndRef = useRef<() => void>(() => {});

  handleRecognitionEndRef.current = () => {
    console.log("recognition onend handler");
    setIsListening(false);
    recognitionRef.current = null;
    isStartingRef.current = false;

    if (silenceFiredRef.current) {
      silenceFiredRef.current = false;
      logVoiceState("onend after silence send");
      if (canListenNow()) {
        scheduleListeningRestartRef.current(RESTART_AFTER_EMPTY_SILENCE_MS);
      }
      return;
    }

    const text = latestTranscriptRef.current.trim();
    const waitingForSilence =
      hasTranscriptRef.current && Date.now() < silenceDueAtRef.current;

    if (waitingForSilence && text) {
      logVoiceState("onend preserve transcript, restart recognition");
      const started = startListeningRef.current(true);
      if (!started) {
        scheduleListeningRestartRef.current(0);
      }
      return;
    }

    if (hasTranscriptRef.current && text) {
      clearTranscriptRefs();
      sendFinalTranscript(text);
      return;
    }

    clearTranscriptRefs();

    if (canListenNow()) {
      scheduleListeningRestartRef.current(RESTART_AFTER_EMPTY_SILENCE_MS);
    }
  };

  useEffect(() => {
    if (!voiceModeEnabled || disabled || isProcessing) {
      stopListening({ discardTranscript: false });
      return;
    }
  }, [voiceModeEnabled, disabled, isProcessing, stopListening]);

  useEffect(() => {
    if (!voiceModeEnabled || disabled || !supported) return;

    const wasSpeaking = prevSpeakingRef.current;
    const wasThinking = prevThinkingRef.current;
    prevSpeakingRef.current = isSpeaking;
    prevThinkingRef.current = isThinking;

    const finishedSpeaking = wasSpeaking && !isSpeaking;
    const finishedThinking = wasThinking && !isThinking;

    if (finishedSpeaking && !isThinking) {
      console.log("speech synthesis ended, restarting recognition");
      silenceFiredRef.current = false;
      scheduleListeningRestartRef.current(RESTART_AFTER_RESPONSE_MS);
      return;
    }

    if (finishedThinking && !isSpeaking && !readAloudEnabled) {
      scheduleListeningRestartRef.current(RESTART_AFTER_RESPONSE_MS);
    }
  }, [
    isSpeaking,
    isThinking,
    voiceModeEnabled,
    disabled,
    supported,
    readAloudEnabled,
    stopListening,
  ]);

  useEffect(() => {
    const justEnabled = voiceModeEnabled && !prevVoiceModeRef.current;
    prevVoiceModeRef.current = voiceModeEnabled;

    if (justEnabled && !disabled && supported && !isProcessing) {
      logVoiceState("voice mode enabled, initial listen");
      scheduleListeningRestartRef.current(0);
    }
  }, [voiceModeEnabled, disabled, supported, isProcessing, logVoiceState]);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      clearRestartTimer();
      stopListening();
    };
  }, [clearSilenceTimer, clearRestartTimer, stopListening]);

  const handleStartConversation = () => {
    if (!supported) {
      setStatusError(voiceUnsupportedMessage);
      return;
    }
    setStatusError(null);
    setUserStoppedVoiceMode(false);
    setNeedsManualContinue(false);
    clearTranscriptRefs();
    onVoiceModeChange(true);
  };

  const handleEndConversation = () => {
    clearSilenceTimer();
    clearRestartTimer();
    clearTranscriptRefs();
    isStartingRef.current = false;
    onInterimTranscript?.("");
    stopListening({ discardTranscript: true });
    setNeedsManualContinue(false);
    setUserStoppedVoiceMode(true);
    onVoiceModeChange(false);
    setStatusError(null);
    logVoiceState("user ended conversation");
  };

  const handleManualContinue = () => {
    setNeedsManualContinue(false);
    setStatusError(null);
    silenceFiredRef.current = false;
    logVoiceState("manual continue");
    const started = startListeningRef.current(false);
    if (!started) {
      scheduleListeningRestartRef.current(0);
    }
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
    if (needsManualContinue) return "Klepněte na tlačítko a pokračujte v mluvení.";
    if (isListening && hasDetectedText) {
      if (nearSend) return "Rozumím, ještě chvíli počkám…";
      if (wordCount <= 3) return "Poslouchám, můžete pokračovat…";
      return "Mello poslouchá…";
    }
    if (isListening) return "Mello poslouchá…";
    return "Čekám, až promluvíte…";
  })();

  if (!supported && !voiceModeEnabled) {
    return (
      <div className="flex flex-col items-center gap-4 w-full">
        <p
          className="text-center text-lg font-medium text-amber-900 max-w-md bg-amber-50 border-2 border-amber-200 rounded-2xl p-4"
          role="status"
        >
          {voiceUnsupportedMessage}
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

      {needsManualContinue && voiceModeEnabled && (
        <button
          type="button"
          onClick={handleManualContinue}
          className="w-full max-w-md min-h-[72px] px-8 py-5 rounded-2xl text-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg transition border-2 border-emerald-800"
        >
          Pokračovat v mluvení
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
