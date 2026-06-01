import { useState, useRef, useCallback, useEffect } from "react";

const UNSUPPORTED_MSG =
  "Hlasové ovládání v tomto prohlížeči nemusí fungovat. Zkuste prosím Chrome nebo napište zprávu ručně.";
const IOS_SAFARI_VOICE_MSG =
  "Na iPhonu a iPadu (Safari) hlasové ovládání bohužel nefunguje. Napište zprávu ručně do pole níže — Mello vám ráda odpoví.";
const PERMISSION_DENIED_MSG =
  "Mikrofon není povolený. Povolte prosím mikrofon v nastavení prohlížeči, nebo napište zprávu ručně.";

const VOICE_SEND_DEDUP_MS = 2000;
const RESTART_DELAY_MS = 700;
const RESTART_AFTER_ERROR_MS = 500;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  return (
    window.SpeechRecognition ||
    (window as Window & { webkitSpeechRecognition?: SpeechRecognitionConstructor })
      .webkitSpeechRecognition ||
    null
  );
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
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
  isMemoryBusy?: boolean;
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
};

export default function VoiceInput({
  voiceModeEnabled,
  onVoiceModeChange,
  isThinking,
  isSpeaking,
  isMemoryBusy = false,
  disabled = false,
  onTranscript,
  onInterimTranscript,
}: VoiceInputProps) {
  const [hasDetectedText, setHasDetectedText] = useState(false);
  const [previewTranscript, setPreviewTranscript] = useState("");
  const [nearSend, setNearSend] = useState(false);
  const [userStoppedVoiceMode, setUserStoppedVoiceMode] = useState(false);
  const [needsManualContinue, setNeedsManualContinue] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [recognitionRunning, setRecognitionRunning] = useState(false);
  const [lastVoiceError, setLastVoiceError] = useState<string | null>(null);

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
  const prevProcessingRef = useRef(false);
  const prevVoiceModeRef = useRef(false);

  const conversationActiveRef = useRef(false);
  const thinkingRef = useRef(isThinking);
  const speakingRef = useRef(isSpeaking);
  const memoryBusyRef = useRef(isMemoryBusy);
  const disabledRef = useRef(disabled);

  const conversationActive =
    voiceModeEnabled && !userStoppedVoiceMode && !disabled;
  const isProcessing = isThinking || isSpeaking || isMemoryBusy;

  conversationActiveRef.current = conversationActive;
  thinkingRef.current = isThinking;
  speakingRef.current = isSpeaking;
  memoryBusyRef.current = isMemoryBusy;
  disabledRef.current = disabled;

  const supported = isSpeechRecognitionSupported();
  const voiceUnsupportedMessage = getVoiceUnsupportedMessage();

  const logDebugState = useCallback(
    (label: string) => {
      console.log("VOICE state", {
        label,
        conversationActive: conversationActiveRef.current,
        recognitionRunning,
        isSpeaking: speakingRef.current,
        isProcessing:
          thinkingRef.current ||
          speakingRef.current ||
          memoryBusyRef.current,
        lastVoiceError,
        needsManualContinue,
      });
    },
    [recognitionRunning, lastVoiceError, needsManualContinue]
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

  const setRecognitionRunningState = useCallback((running: boolean) => {
    setRecognitionRunning(running);
  }, []);

  const canStartRecognition = useCallback(() => {
    return (
      conversationActiveRef.current &&
      !thinkingRef.current &&
      !speakingRef.current &&
      !memoryBusyRef.current &&
      !disabledRef.current &&
      supported
    );
  }, [supported]);

  const abortRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    isStartingRef.current = false;
    setRecognitionRunningState(false);

    if (!recognition) return;

    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.onstart = null;

    try {
      recognition.abort();
    } catch {
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
    }
  }, [setRecognitionRunningState]);

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
        return false;
      }

      lastSentTranscriptRef.current = text;
      lastSentAtRef.current = now;
      silenceFiredRef.current = false;
      onInterimTranscript?.("");
      onTranscript(text);
      return true;
    },
    [onTranscript, onInterimTranscript]
  );

  const handleSilenceTimeout = useCallback(() => {
    silenceTimerRef.current = null;
    silenceFiredRef.current = true;
    setNearSend(false);

    const text = latestTranscriptRef.current.trim();
    if (text) {
      abortRecognition();
      clearTranscriptRefs();
      sendFinalTranscript(text);
      return;
    }

    abortRecognition();
  }, [abortRecognition, clearTranscriptRefs, sendFinalTranscript]);

  const resetSilenceTimer = useCallback(
    (transcript: string) => {
      clearSilenceTimer();
      silenceFiredRef.current = false;

      const delay = getSilenceDelay(transcript);
      silenceDueAtRef.current = Date.now() + delay;

      const nearLead = Math.max(0, delay - 1200);
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

  const startRecognitionRef = useRef<() => boolean>(() => false);

  startRecognitionRef.current = () => {
    if (!canStartRecognition()) {
      console.log("VOICE restart blocked", {
        conversationActive: conversationActiveRef.current,
        thinking: thinkingRef.current,
        speaking: speakingRef.current,
        memoryBusy: memoryBusyRef.current,
      });
      return false;
    }

    if (isStartingRef.current) {
      return recognitionRunning;
    }

    abortRecognition();
    isStartingRef.current = true;
    setNeedsManualContinue(false);
    setLastVoiceError(null);

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      isStartingRef.current = false;
      setNeedsManualContinue(true);
      return false;
    }

    console.log("VOICE start requested");
    clearTranscriptRefs();

    const recognition = new Ctor();
    recognition.lang = "cs-CZ";
    recognition.interimResults = true;
    recognition.continuous = !isIOSSafari();
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("VOICE started");
      isStartingRef.current = false;
      setRecognitionRunningState(true);
      setNeedsManualContinue(false);
      setLastVoiceError(null);
      logDebugState("onstart");
    };

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
      console.log("VOICE error", event.error);
      setLastVoiceError(event.error);
      clearSilenceTimer();
      isStartingRef.current = false;
      recognitionRef.current = null;
      setRecognitionRunningState(false);

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setStatusError(PERMISSION_DENIED_MSG);
        setUserStoppedVoiceMode(true);
        onVoiceModeChange(false);
        return;
      }

      if (!conversationActiveRef.current) return;

      const harmless =
        event.error === "no-speech" ||
        event.error === "aborted" ||
        event.error === "audio-capture";

      if (harmless && canStartRecognition()) {
        restartListeningRef.current(RESTART_AFTER_ERROR_MS);
        return;
      }

      if (canStartRecognition()) {
        setNeedsManualContinue(true);
        logDebugState("error needs manual continue");
      }
    };

    recognition.onend = () => {
      console.log("VOICE onend");
      setRecognitionRunningState(false);
      recognitionRef.current = null;
      isStartingRef.current = false;

      if (!conversationActiveRef.current) return;

      if (silenceFiredRef.current) {
        silenceFiredRef.current = false;
        if (canStartRecognition()) {
          restartListeningRef.current(RESTART_DELAY_MS);
        }
        return;
      }

      const text = latestTranscriptRef.current.trim();
      const waitingForSilence =
        hasTranscriptRef.current && Date.now() < silenceDueAtRef.current;

      if (waitingForSilence && text) {
        restartListeningRef.current(0);
        return;
      }

      if (hasTranscriptRef.current && text) {
        clearTranscriptRefs();
        sendFinalTranscript(text);
        return;
      }

      clearTranscriptRefs();

      if (canStartRecognition()) {
        restartListeningRef.current(RESTART_DELAY_MS);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      console.log("VOICE start() called");
      isStartingRef.current = false;
      setRecognitionRunningState(true);
      resetSilenceTimer("");
      return true;
    } catch (err) {
      const name = err instanceof Error ? err.name : String(err);
      console.log("VOICE start failed", name, err);
      setLastVoiceError(name);
      recognitionRef.current = null;
      isStartingRef.current = false;
      setRecognitionRunningState(false);
      clearSilenceTimer();

      if (
        name === "NotAllowedError" ||
        name === "InvalidStateError" ||
        /not-allowed|invalid state/i.test(name)
      ) {
        setNeedsManualContinue(true);
      }
      return false;
    }
  };

  const restartListeningRef = useRef<(delayMs: number) => void>(() => {});

  restartListeningRef.current = (delayMs: number) => {
    clearRestartTimer();

    if (!conversationActiveRef.current) {
      console.log("VOICE restart blocked", { reason: "conversation inactive" });
      return;
    }

    if (!canStartRecognition()) {
      console.log("VOICE restart blocked", {
        reason: "still processing",
        thinking: thinkingRef.current,
        speaking: speakingRef.current,
        memoryBusy: memoryBusyRef.current,
      });
      return;
    }

    console.log("VOICE restart scheduled", { delayMs });
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;

      if (!canStartRecognition()) {
        console.log("VOICE restart blocked", { reason: "timer fired but busy" });
        return;
      }

      abortRecognition();
      const started = startRecognitionRef.current();
      if (!started) {
        setNeedsManualContinue(true);
        console.log("VOICE restart failed, manual continue required");
      }
    }, delayMs);
  };

  useEffect(() => {
    const wasProcessing = prevProcessingRef.current;
    const nowProcessing = isProcessing;
    prevProcessingRef.current = nowProcessing;

    if (nowProcessing) {
      clearRestartTimer();
      abortRecognition();
      return;
    }

    if (wasProcessing && conversationActive) {
      console.log("VOICE processing ended, scheduling restart");
      restartListeningRef.current(RESTART_DELAY_MS);
    }
  }, [isProcessing, conversationActive, abortRecognition, clearRestartTimer]);

  useEffect(() => {
    const justEnabled = voiceModeEnabled && !prevVoiceModeRef.current;
    prevVoiceModeRef.current = voiceModeEnabled;

    if (justEnabled && conversationActive && !isProcessing) {
      restartListeningRef.current(0);
    }
  }, [voiceModeEnabled, conversationActive, isProcessing]);

  useEffect(() => {
    if (!conversationActive) {
      clearRestartTimer();
      abortRecognition();
    }
  }, [conversationActive, abortRecognition, clearRestartTimer]);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      clearRestartTimer();
      abortRecognition();
    };
  }, [clearSilenceTimer, clearRestartTimer, abortRecognition]);

  const handleStartConversation = () => {
    if (!supported) {
      setStatusError(voiceUnsupportedMessage);
      return;
    }
    setStatusError(null);
    setUserStoppedVoiceMode(false);
    setNeedsManualContinue(false);
    setLastVoiceError(null);
    clearTranscriptRefs();
    onVoiceModeChange(true);
  };

  const handleEndConversation = () => {
    clearSilenceTimer();
    clearRestartTimer();
    clearTranscriptRefs();
    onInterimTranscript?.("");
    abortRecognition();
    setNeedsManualContinue(false);
    setUserStoppedVoiceMode(true);
    onVoiceModeChange(false);
    setStatusError(null);
    console.log("VOICE conversation ended by user");
  };

  const handleManualContinue = () => {
    setNeedsManualContinue(false);
    setStatusError(null);
    setLastVoiceError(null);
    silenceFiredRef.current = false;
    console.log("VOICE manual continue");
    abortRecognition();
    const started = startRecognitionRef.current();
    if (!started) {
      restartListeningRef.current(0);
    }
  };

  const wordCount = countWords(previewTranscript);

  const statusLabel = (() => {
    if (statusError) return statusError;
    if (userStoppedVoiceMode && !voiceModeEnabled) {
      return "Rozhovor je ukončen.";
    }
    if (!conversationActive) return null;
    if (isSpeaking) return "Mello mluví…";
    if (isThinking) return "Mello přemýšlí…";
    if (isMemoryBusy) return "Ukládám vzpomínku…";
    if (needsManualContinue) {
      return "Klepněte na tlačítko a obnovte poslech.";
    }
    if (recognitionRunning && hasDetectedText) {
      if (nearSend) return "Rozumím, ještě chvíli počkám…";
      if (wordCount <= 3) return "Poslouchám, můžete pokračovat…";
      return "Mello poslouchá…";
    }
    if (recognitionRunning) return "Mello poslouchá…";
    if (conversationActive && !isProcessing) {
      return "Obnovuji poslech…";
    }
    return null;
  })();

  const debugLine = `conv=${conversationActive ? "1" : "0"} rec=${
    recognitionRunning ? "1" : "0"
  } speak=${isSpeaking ? "1" : "0"} proc=${isProcessing ? "1" : "0"} err=${
    lastVoiceError ?? "—"
  }`;

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

      {needsManualContinue && conversationActive && (
        <button
          type="button"
          onClick={handleManualContinue}
          className="w-full max-w-md min-h-[72px] px-8 py-5 rounded-2xl text-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg transition border-2 border-emerald-800"
        >
          Pokračovat v poslechu
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

      {conversationActive && (
        <p className="text-center text-xs text-gray-500 font-mono max-w-md break-all">
          {debugLine}
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
