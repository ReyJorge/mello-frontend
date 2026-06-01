const VOICE_PREF_KEY = "mello_voice_enabled";

export function isTtsSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function loadVoiceEnabled() {
  try {
    return localStorage.getItem(VOICE_PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveVoiceEnabled(enabled) {
  try {
    localStorage.setItem(VOICE_PREF_KEY, enabled ? "on" : "off");
  } catch {
    /* ignore */
  }
}

export function stopSpeaking() {
  if (isTtsSupported()) {
    window.speechSynthesis.cancel();
  }
}

/** Přečte text nahlas. Selže tiše, pokud TTS není dostupné. */
export function readAloud(text, callbacks = {}) {
  if (!isTtsSupported()) {
    callbacks.onEnd?.();
    return Promise.resolve({ stop: stopSpeaking });
  }

  stopSpeaking();

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "cs-CZ";
    utterance.rate = 0.95;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      callbacks.onEnd?.();
      resolve({ stop: stopSpeaking });
    };

    utterance.onstart = () => callbacks.onStart?.();
    utterance.onend = finish;
    utterance.onerror = finish;

    try {
      window.speechSynthesis.speak(utterance);
      setTimeout(() => {
        if (
          !finished &&
          !window.speechSynthesis.speaking &&
          !window.speechSynthesis.pending
        ) {
          callbacks.onBlocked?.();
          finish();
        }
      }, 300);
    } catch {
      callbacks.onBlocked?.();
      finish();
    }
  });
}
