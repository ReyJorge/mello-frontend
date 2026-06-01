import { useState, useRef, useCallback, useEffect } from "react";

const SILENCE_MS = 2000;
const VOICE_SEND_DEDUP_MS = 2000;
const RESTART_DELAY_MS = 650;
const RESTART_AFTER_ERROR_MS = 500;
const WATCHDOG_INTERVAL_MS = 2500;

export type VoiceLoopState = {
  conversationActive: boolean;
  recognitionRunning: boolean;
  isUserSpeaking: boolean;
  isProcessing: boolean;
  isMelloSpeaking: boolean;
  isMelloThinking: boolean;
  isMemoryBusy: boolean;
  lastTranscript: string;
  lastVoiceError: string | null;
  needsManualContinue: boolean;
  phase:
    | "idle"
    | "listening"
    | "user-speaking"
    | "thinking"
    | "speaking"
    | "memory"
    | "restarting"
    | "ended";
};

type UseVoiceConversationOptions = {
  voiceModeEnabled: boolean;
  onVoiceModeChange: (enabled: boolean) => void;
  isMelloThinking: boolean;
  isMelloSpeaking: boolean;
  isMemoryBusy: boolean;
  isBlocked: boolean;
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onStateChange?: (state: VoiceLoopState) => void;
};

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
  if (isIOSSafari()) {
    return "Na iPhonu a iPadu (Safari) hlasové ovládání bohužel nefunguje. Napište zprávu ručně do pole níže — Mello vám ráda odpoví.";
  }
  return "Hlasové ovládání v tomto prohlížeči nemusí fungovat. Zkuste prosím Chrome nebo napište zprávu ručně.";
}

export function getSilenceDelay(): number {
  return SILENCE_MS;
}

export function useVoiceConversation({
  voiceModeEnabled,
  onVoiceModeChange,
  isMelloThinking,
  isMelloSpeaking,
  isMemoryBusy,
  isBlocked,
  onTranscript,
  onInterimTranscript,
  onStateChange,
}: UseVoiceConversationOptions) {
  const [userEnded, setUserEnded] = useState(false);
  const [needsManualContinue, setNeedsManualContinue] = useState(false);
  const [recognitionRunning, setRecognitionRunning] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [lastVoiceError, setLastVoiceError] = useState<string | null>(null);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedFinalRef = useRef("");
  const latestTranscriptRef = useRef("");
  const silenceFiredRef = useRef(false);
  const lastSentTranscriptRef = useRef("");
  const lastSentAtRef = useRef(0);
  const isStartingRef = useRef(false);
  const prevBlockedRef = useRef(false);
  const prevVoiceModeRef = useRef(false);
  const submitLockRef = useRef(false);
  const needsManualRef = useRef(false);
  needsManualRef.current = needsManualContinue;

  const conversationActiveRef = useRef(false);
  const thinkingRef = useRef(isMelloThinking);
  const speakingRef = useRef(isMelloSpeaking);
  const memoryBusyRef = useRef(isMemoryBusy);
  const blockedRef = useRef(isBlocked);
  const voiceModeRef = useRef(voiceModeEnabled);

  const supported = isSpeechRecognitionSupported();

  const conversationActive =
    voiceModeEnabled && !userEnded && !isBlocked && supported;

  const isProcessing =
    isMelloThinking || isMelloSpeaking || isMemoryBusy || isBlocked;

  conversationActiveRef.current =
    voiceModeEnabled && !userEnded && !isBlocked && supported;
  thinkingRef.current = isMelloThinking;
  speakingRef.current = isMelloSpeaking;
  memoryBusyRef.current = isMemoryBusy;
  blockedRef.current = isBlocked;
  voiceModeRef.current = voiceModeEnabled;

  const computePhase = useCallback((): VoiceLoopState["phase"] => {
    if (userEnded && !voiceModeEnabled) return "ended";
    if (!voiceModeEnabled) return "idle";
    if (isMemoryBusy) return "memory";
    if (isMelloSpeaking) return "speaking";
    if (isMelloThinking) return "thinking";
    if (isRestarting) return "restarting";
    if (recognitionRunning && isUserSpeaking) return "user-speaking";
    if (recognitionRunning) return "listening";
    if (conversationActive && !isProcessing) return "restarting";
    return "idle";
  }, [
    userEnded,
    voiceModeEnabled,
    isMemoryBusy,
    isMelloSpeaking,
    isMelloThinking,
    isRestarting,
    recognitionRunning,
    isUserSpeaking,
    conversationActive,
    isProcessing,
  ]);

  const emitState = useCallback(
    (label?: string) => {
      const state: VoiceLoopState = {
        conversationActive,
        recognitionRunning,
        isUserSpeaking,
        isProcessing,
        isMelloSpeaking,
        isMelloThinking,
        isMemoryBusy,
        lastTranscript,
        lastVoiceError,
        needsManualContinue,
        phase: computePhase(),
      };
      if (label) {
        console.log("VOICE state", { label, ...state });
      }
      onStateChange?.(state);
      return state;
    },
    [
      conversationActive,
      recognitionRunning,
      isUserSpeaking,
      isProcessing,
      isMelloSpeaking,
      isMelloThinking,
      isMemoryBusy,
      lastTranscript,
      lastVoiceError,
      needsManualContinue,
      computePhase,
      onStateChange,
    ]
  );

  useEffect(() => {
    emitState();
  }, [emitState]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const clearTranscriptBuffers = useCallback(() => {
    latestTranscriptRef.current = "";
    accumulatedFinalRef.current = "";
    setLastTranscript("");
    setIsUserSpeaking(false);
    silenceFiredRef.current = false;
  }, []);

  const setRecognitionRunningState = useCallback((running: boolean) => {
    setRecognitionRunning(running);
    if (!running) setIsUserSpeaking(false);
  }, []);

  const canStartRecognition = useCallback(() => {
    return (
      conversationActiveRef.current &&
      !thinkingRef.current &&
      !speakingRef.current &&
      !memoryBusyRef.current &&
      !blockedRef.current &&
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

  const sendFinalTranscript = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || submitLockRef.current) return false;

      const now = Date.now();
      if (
        text === lastSentTranscriptRef.current &&
        now - lastSentAtRef.current < VOICE_SEND_DEDUP_MS
      ) {
        console.log("VOICE submit deduped");
        return false;
      }

      submitLockRef.current = true;
      lastSentTranscriptRef.current = text;
      lastSentAtRef.current = now;
      silenceFiredRef.current = false;
      onInterimTranscript?.("");
      console.log("VOICE submit", { text });
      onTranscript(text);
      setTimeout(() => {
        submitLockRef.current = false;
      }, VOICE_SEND_DEDUP_MS);
      return true;
    },
    [onTranscript, onInterimTranscript]
  );

  const handleSilenceTimeout = useCallback(() => {
    silenceTimerRef.current = null;
    silenceFiredRef.current = true;

    const text = latestTranscriptRef.current.trim();
    console.log("VOICE silence timeout", { text, delayMs: SILENCE_MS });

    abortRecognition();
    clearTranscriptBuffers();

    if (text) {
      sendFinalTranscript(text);
    }
  }, [abortRecognition, clearTranscriptBuffers, sendFinalTranscript]);

  const resetSilenceTimer = useCallback(
    (transcript: string) => {
      clearSilenceTimer();
      silenceFiredRef.current = false;
      silenceTimerRef.current = setTimeout(handleSilenceTimeout, SILENCE_MS);
    },
    [clearSilenceTimer, handleSilenceTimeout]
  );

  const updateTranscript = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      latestTranscriptRef.current = trimmed;
      setLastTranscript(trimmed);
      setIsUserSpeaking(trimmed.length > 0);
      if (trimmed) {
        onInterimTranscript?.(trimmed);
        resetSilenceTimer(trimmed);
      }
    },
    [onInterimTranscript, resetSilenceTimer]
  );

  const startRecognitionRef = useRef<() => boolean>(() => false);

  startRecognitionRef.current = () => {
    if (!canStartRecognition()) {
      console.log("VOICE restart blocked", {
        conversationActive: conversationActiveRef.current,
        thinking: thinkingRef.current,
        speaking: speakingRef.current,
        memoryBusy: memoryBusyRef.current,
        blocked: blockedRef.current,
      });
      return false;
    }

    if (isStartingRef.current) return recognitionRunning;

    abortRecognition();
    isStartingRef.current = true;
    setNeedsManualContinue(false);
    setLastVoiceError(null);
    setIsRestarting(false);

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      isStartingRef.current = false;
      setNeedsManualContinue(true);
      return false;
    }

    console.log("VOICE start requested");
    clearTranscriptBuffers();

    const recognition = new Ctor();
    recognition.lang = "cs-CZ";
    recognition.interimResults = true;
    recognition.continuous = !isIOSSafari();
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("VOICE started");
      isStartingRef.current = false;
      setRecognitionRunningState(true);
      setIsRestarting(false);
      setNeedsManualContinue(false);
      emitState("onstart");
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
        updateTranscript(preview);
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
        setUserEnded(true);
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
        emitState("error-manual");
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
        return;
      }

      clearTranscriptBuffers();

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
      return true;
    } catch (err) {
      const name = err instanceof Error ? err.name : String(err);
      console.log("VOICE start failed", name);
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
      console.log("VOICE restart blocked", { reason: "inactive" });
      return;
    }

    if (!canStartRecognition()) {
      console.log("VOICE restart blocked", { reason: "busy" });
      return;
    }

    console.log("VOICE restart scheduled", { delayMs });
    setIsRestarting(true);

    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;

      if (!canStartRecognition()) {
        setIsRestarting(false);
        console.log("VOICE restart blocked", { reason: "timer-busy" });
        return;
      }

      abortRecognition();
      const started = startRecognitionRef.current();
      if (!started) {
        setIsRestarting(false);
        setNeedsManualContinue(true);
        console.log("VOICE restart failed");
      }
    }, delayMs);
  };

  useEffect(() => {
    const wasBlocked = prevBlockedRef.current;
    const nowBlocked = isProcessing;
    prevBlockedRef.current = nowBlocked;

    if (nowBlocked) {
      clearRestartTimer();
      setIsRestarting(false);
      abortRecognition();
      return;
    }

    if (wasBlocked && conversationActive) {
      console.log("VOICE processing ended → restart");
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
      setIsRestarting(false);
      abortRecognition();
    }
  }, [conversationActive, abortRecognition, clearRestartTimer]);

  useEffect(() => {
    const id = setInterval(() => {
      if (
        conversationActiveRef.current &&
        !thinkingRef.current &&
        !speakingRef.current &&
        !memoryBusyRef.current &&
        !blockedRef.current &&
        !recognitionRef.current &&
        !isStartingRef.current &&
        !restartTimerRef.current &&
        !needsManualRef.current
      ) {
        console.log("VOICE watchdog restart");
        restartListeningRef.current(RESTART_DELAY_MS);
      }
    }, WATCHDOG_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      clearRestartTimer();
      abortRecognition();
    };
  }, [clearSilenceTimer, clearRestartTimer, abortRecognition]);

  const startConversation = useCallback(() => {
    if (!supported) return false;
    setUserEnded(false);
    setNeedsManualContinue(false);
    setLastVoiceError(null);
    clearTranscriptBuffers();
    onVoiceModeChange(true);
    return true;
  }, [supported, clearTranscriptBuffers, onVoiceModeChange]);

  const endConversation = useCallback(() => {
    clearSilenceTimer();
    clearRestartTimer();
    clearTranscriptBuffers();
    onInterimTranscript?.("");
    abortRecognition();
    setNeedsManualContinue(false);
    setUserEnded(true);
    setIsRestarting(false);
    onVoiceModeChange(false);
    console.log("VOICE conversation ended");
  }, [
    clearSilenceTimer,
    clearRestartTimer,
    clearTranscriptBuffers,
    onInterimTranscript,
    abortRecognition,
    onVoiceModeChange,
  ]);

  const manualContinue = useCallback(() => {
    setNeedsManualContinue(false);
    setLastVoiceError(null);
    silenceFiredRef.current = false;
    console.log("VOICE manual continue");
    abortRecognition();
    const started = startRecognitionRef.current();
    if (!started) restartListeningRef.current(0);
  }, [abortRecognition]);

  return {
    supported,
    conversationActive,
    recognitionRunning,
    isUserSpeaking,
    isProcessing,
    lastTranscript,
    lastVoiceError,
    needsManualContinue,
    userEnded,
    isRestarting,
    phase: computePhase(),
    startConversation,
    endConversation,
    manualContinue,
    voiceUnsupportedMessage: getVoiceUnsupportedMessage(),
  };
}
