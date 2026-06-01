import React, { useState, useEffect, useRef } from "react";
import avatarMello from "../assets/avatar-mello.png";
import avatarUser from "../assets/avatar-user.png";
import { supabase } from "../utils/supabaseClient";
import { postChat } from "../utils/api";
import {
  loadChatMessages,
  persistMessage,
  createMessage,
  INTRO_MESSAGE_ID,
} from "../utils/chatPersistence";
import {
  readAloud,
  stopSpeaking,
  loadVoiceEnabled,
  saveVoiceEnabled,
  isTtsSupported,
} from "../utils/tts";
import VoiceInput from "./VoiceInput";
import { detectMemoryCandidate } from "../utils/memoryDetection";

const OFFLINE_MSG =
  "Jste offline. Zkontrolujte připojení k internetu a zkuste to znovu.";
const TTS_BLOCKED_MSG =
  "Hlas nelze spustit automaticky. Klepněte na „Přečíst nahlas“ u poslední odpovědi.";

export default function ChatWindow() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(loadVoiceEnabled);
  const [ttsNotice, setTtsNotice] = useState(null);
  const [lastReply, setLastReply] = useState(null);
  const [pendingMemoryCandidate, setPendingMemoryCandidate] = useState(null);
  const [showMemoryPrompt, setShowMemoryPrompt] = useState(false);
  const [memoryToast, setMemoryToast] = useState(null);
  const [userId, setUserId] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [bannerError, setBannerError] = useState(null);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const messagesEndRef = useRef(null);

  const voiceBlocked =
    showMemoryPrompt && Boolean(pendingMemoryCandidate);

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  useEffect(() => {
    if (!voiceModeEnabled) {
      stopSpeaking();
      setSpeaking(false);
    }
  }, [voiceModeEnabled]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const uid = user?.id ?? null;
      if (!cancelled) setUserId(uid);
      const loaded = await loadChatMessages(uid);
      if (!cancelled) {
        setMessages(loaded);
        setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, speaking, memoryToast]);

  useEffect(() => {
    if (!memoryToast) return;
    const t = setTimeout(() => setMemoryToast(null), 4000);
    return () => clearTimeout(t);
  }, [memoryToast]);

  const appendMessage = (message) => {
    setMessages((prev) => {
      const next = [...prev, message];
      persistMessage(userId, next, message).catch(() => {});
      return next;
    });
  };

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    saveVoiceEnabled(next);
    if (!next) {
      stopSpeaking();
      setSpeaking(false);
      setTtsNotice(null);
    }
  };

  const playReply = async (text) => {
    if (!voiceEnabled || !text) return;
    setTtsNotice(null);
    setLastReply(text);
    console.log("SPEECH synthesis start");
    await readAloud(text, {
      onStart: () => setSpeaking(true),
      onEnd: () => {
        console.log("SPEECH synthesis end");
        setSpeaking(false);
      },
      onBlocked: () => {
        console.log("SPEECH synthesis blocked");
        setTtsNotice(TTS_BLOCKED_MSG);
        setSpeaking(false);
      },
    });
  };

  const evaluateMemoryCandidate = (messageText) => {
    const detection = detectMemoryCandidate(messageText);
    if (!detection?.isCandidate) return;

    if (detection.needsMoreDetail) {
      appendMessage(
        createMessage("mello", "Na co vzpomínáte? Ráda si to poslechnu.")
      );
      return;
    }

    setPendingMemoryCandidate(messageText);
    setShowMemoryPrompt(true);
  };

  const sendMessage = async (textOverride) => {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;

    if (!isOnline) {
      setBannerError(OFFLINE_MSG);
      return;
    }

    setBannerError(null);
    setTtsNotice(null);
    stopSpeaking();
    setShowMemoryPrompt(false);
    setPendingMemoryCandidate(null);

    const userMessage = createMessage("user", text);
    appendMessage(userMessage);
    setInput("");
    setLoading(true);

    try {
      const { reply } = await postChat(text);
      const melloMessage = createMessage("mello", reply);
      appendMessage(melloMessage);
      await playReply(reply);
      evaluateMemoryCandidate(text);
    } catch (err) {
      const debugText =
        err?.message?.startsWith("Chyba chatu:")
          ? err.message
          : `Chyba chatu: ${err?.message ?? "neznámá chyba"}`;
      console.error("[Mello chat] Odeslání zprávy selhalo:", err);
      setBannerError(debugText);
    } finally {
      setLoading(false);
    }
  };

  const handleVoiceInterim = (transcript) => {
    setInput(transcript);
  };

  const handleVoiceTranscript = (transcript) => {
    const text = transcript.trim();
    if (!text) return;
    sendMessage(text);
  };

  const handleSaveMemory = async () => {
    if (!pendingMemoryCandidate) return;

    console.log("MEMORY save start");
    setMemoryBusy(true);
    setShowMemoryPrompt(false);

    if (!userId) {
      appendMessage(
        createMessage(
          "mello",
          "Pro ukládání vzpomínek je potřeba se přihlásit."
        )
      );
      setPendingMemoryCandidate(null);
      setMemoryBusy(false);
      console.log("MEMORY save end");
      return;
    }

    const { error } = await supabase.from("mello_memory").insert([
      {
        user_id: userId,
        category: "rodina",
        content: pendingMemoryCandidate,
        title: pendingMemoryCandidate.slice(0, 60) || "Vzpomínka",
      },
    ]);

    const text = error
      ? "Vzpomínku se nepodařilo uložit."
      : "Vzpomínka uložena do deníku.";

    setMemoryToast({ ok: !error, text });
    appendMessage(createMessage("mello", text));
    setPendingMemoryCandidate(null);
    setMemoryBusy(false);
    console.log("MEMORY save end");
  };

  const handleDismissMemory = () => {
    setPendingMemoryCandidate(null);
    setShowMemoryPrompt(false);
  };

  const showEmptyHint =
    messages.length === 0 ||
    (messages.length === 1 && messages[0].id === INTRO_MESSAGE_ID);

  if (!hydrated) {
    return (
      <div className="mello-chat-shell flex items-center justify-center min-h-[50vh]">
        <p className="text-lg text-white/80">Načítám váš rozhovor…</p>
      </div>
    );
  }

  return (
    <div className="mello-chat-shell flex flex-col w-full max-w-lg mx-auto min-h-[calc(100dvh-10rem)] sm:min-h-[calc(100dvh-9rem)]">
      <header className="flex items-center justify-between gap-2 px-1 pb-3 shrink-0">
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          Mello
        </h1>
        <button
          type="button"
          onClick={toggleVoice}
          className={`mello-chip min-h-[44px] px-4 py-2 text-sm font-semibold rounded-full border transition ${
            voiceEnabled
              ? "bg-white/20 border-white/40 text-white"
              : "bg-white/10 border-white/20 text-white/80"
          }`}
          aria-pressed={voiceEnabled}
        >
          {voiceEnabled ? "🔊 Hlas zapnutý" : "Hlas vypnutý"}
        </button>
      </header>

      <section className="flex flex-col items-center py-2 shrink-0">
        <div
          className={`relative transition-all duration-500 ${
            voiceModeEnabled ? "scale-100 opacity-100" : "scale-95 opacity-90"
          }`}
        >
          <div className="absolute inset-0 rounded-full bg-white/20 blur-2xl scale-110" />
          <img
            src={avatarMello}
            alt="Mello"
            className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-4 border-white/30 shadow-2xl"
          />
        </div>
      </section>

      {bannerError && (
        <div
          role="alert"
          className="mx-2 mb-3 p-4 bg-red-500/20 backdrop-blur border border-red-300/40 rounded-2xl text-red-50 text-base"
        >
          {bannerError}
        </div>
      )}

      {!isOnline && (
        <div
          role="status"
          className="mx-2 mb-3 p-4 bg-amber-500/20 backdrop-blur border border-amber-300/40 rounded-2xl text-amber-50 text-base"
        >
          {OFFLINE_MSG}
        </div>
      )}

      {ttsNotice && (
        <div
          role="status"
          className="mx-2 mb-3 p-4 bg-blue-500/20 backdrop-blur border border-blue-300/40 rounded-2xl text-blue-50 text-base"
        >
          {ttsNotice}
          {lastReply && isTtsSupported() && (
            <button
              type="button"
              className="mello-btn-primary block mt-3 min-h-[44px] px-4 py-2 rounded-xl text-base font-semibold"
              onClick={() => playReply(lastReply)}
            >
              Přečíst nahlas
            </button>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto mello-chat-scroll px-2 pb-2">
        {showEmptyHint && (
          <p className="text-center text-white/75 text-base mb-4 px-4 leading-relaxed">
            Jsem tu pro vás. Můžete na mě mluvit nebo psát.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-end gap-2 max-w-[88%] animate-[fadeIn_0.35s_ease-out] ${
                msg.from === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
              }`}
            >
              <img
                src={msg.from === "user" ? avatarUser : avatarMello}
                alt=""
                className="w-9 h-9 rounded-full border border-white/20 shrink-0 object-cover"
              />
              <div
                className={`px-4 py-3 rounded-2xl text-base leading-relaxed shadow-lg whitespace-pre-wrap ${
                  msg.from === "user"
                    ? "mello-bubble-user rounded-br-md"
                    : "mello-bubble-mello rounded-bl-md"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        {loading && (
          <div className="flex items-center gap-2 mt-3 ml-2" aria-live="polite">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full bg-white/70 animate-bounce"
                  style={{ animationDelay: `${i * 0.12}s` }}
                />
              ))}
            </span>
            <span className="text-white/70 text-sm italic">Mello přemýšlí…</span>
          </div>
        )}

        <div ref={messagesEndRef} className="h-2" />
      </div>

      {showMemoryPrompt && pendingMemoryCandidate && (
        <div
          className="mx-2 mb-3 p-4 rounded-2xl bg-white/95 backdrop-blur shadow-xl border border-white/50 animate-[fadeIn_0.3s_ease-out]"
          role="dialog"
          aria-label="Uložit vzpomínku"
        >
          <p className="text-gray-800 text-base font-medium mb-3">
            To zní jako krásná vzpomínka. Uložit do deníku?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveMemory}
              disabled={memoryBusy}
              className="mello-btn-primary flex-1 min-h-[52px] rounded-xl text-base font-bold disabled:opacity-60"
            >
              {memoryBusy ? "Ukládám…" : "Ano, uložit"}
            </button>
            <button
              type="button"
              onClick={handleDismissMemory}
              disabled={memoryBusy}
              className="mello-btn-ghost flex-1 min-h-[52px] rounded-xl text-base font-semibold"
            >
              Ne
            </button>
          </div>
        </div>
      )}

      {memoryToast && (
        <div
          role="status"
          className={`mx-2 mb-2 px-4 py-3 rounded-xl text-center text-sm font-medium backdrop-blur animate-[fadeIn_0.3s_ease-out] ${
            memoryToast.ok
              ? "bg-emerald-500/30 text-emerald-50 border border-emerald-300/40"
              : "bg-red-500/30 text-red-50"
          }`}
        >
          {memoryToast.text}
        </div>
      )}

      <section className="shrink-0 px-2 py-3">
        <VoiceInput
          voiceModeEnabled={voiceModeEnabled}
          onVoiceModeChange={setVoiceModeEnabled}
          isThinking={loading}
          isSpeaking={speaking}
          isMemoryBusy={memoryBusy}
          isBlocked={voiceBlocked}
          disabled={!isOnline}
          onTranscript={handleVoiceTranscript}
          onInterimTranscript={handleVoiceInterim}
        />
      </section>

      <footer className="shrink-0 px-2 pb-4 pt-1">
        <div className="flex gap-2 items-end bg-white/15 backdrop-blur-md rounded-2xl border border-white/25 p-2 shadow-lg">
          <input
            className="flex-1 min-h-[52px] px-4 py-3 text-base bg-white/95 text-gray-900 rounded-xl border-0 focus:ring-2 focus:ring-emerald-400/80 focus:outline-none placeholder:text-gray-500"
            type="text"
            placeholder="Napište zprávu…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && sendMessage()}
            aria-label="Text zprávy"
          />
          <button
            type="button"
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="mello-btn-primary shrink-0 min-h-[52px] min-w-[52px] px-5 rounded-xl text-base font-bold disabled:opacity-40"
            aria-label="Odeslat"
          >
            →
          </button>
        </div>
        {speaking && (
          <button
            type="button"
            onClick={() => {
              stopSpeaking();
              setSpeaking(false);
            }}
            className="mello-btn-ghost w-full mt-2 min-h-[44px] rounded-xl text-sm font-semibold text-white/90"
          >
            Zastavit hlas Melly
          </button>
        )}
      </footer>
    </div>
  );
}
