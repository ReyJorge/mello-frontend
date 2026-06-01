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
  "Hlas nelze spustit automaticky. Klepněte na tlačítko „Přečíst nahlas“ u poslední odpovědi.";

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
  const [userId, setUserId] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [bannerError, setBannerError] = useState(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const messagesEndRef = useRef(null);

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

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
  }, [messages, loading, speaking]);

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
    await readAloud(text, {
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onBlocked: () => {
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
    if (!text || loading) return;
    sendMessage(text);
  };

  const handleSaveMemory = async () => {
    if (!pendingMemoryCandidate) return;

    if (!userId) {
      appendMessage(
        createMessage(
          "mello",
          "Pro ukládání vzpomínek je potřeba se přihlásit."
        )
      );
      setPendingMemoryCandidate(null);
      setShowMemoryPrompt(false);
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
      ? "Vzpomínku se nepodařilo uložit. Zkuste to prosím znovu."
      : "Vzpomínka byla uložena do deníku.";

    appendMessage(createMessage("mello", text));
    setPendingMemoryCandidate(null);
    setShowMemoryPrompt(false);
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
      <div className="max-w-2xl mx-auto p-6 bg-white shadow-2xl rounded-3xl mt-6 text-center text-lg text-gray-600">
        Načítám váš rozhovor…
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 bg-white shadow-2xl rounded-3xl mt-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-2xl font-semibold text-emerald-800 text-center sm:text-left">
          Rozhovor s Mellou
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={toggleVoice}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-base font-semibold border-2 ${
              voiceEnabled
                ? "bg-emerald-100 border-emerald-400 text-emerald-900"
                : "bg-gray-100 border-gray-300 text-gray-700"
            }`}
            aria-pressed={voiceEnabled}
          >
            {voiceEnabled ? "Hlas: zapnutý" : "Hlas: vypnutý"}
          </button>
          {speaking && (
            <button
              type="button"
              onClick={() => {
                stopSpeaking();
                setSpeaking(false);
              }}
              className="min-h-[44px] px-4 py-2 rounded-xl text-base font-semibold bg-red-100 border-2 border-red-300 text-red-800"
            >
              Zastavit hlas
            </button>
          )}
        </div>
      </div>

      {showEmptyHint && (
        <p className="mb-4 text-lg text-gray-700 text-center bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
          Můžete mi napsat nebo na mě mluvit. Jsem tu pro vás.
        </p>
      )}

      {bannerError && (
        <div
          role="alert"
          className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-lg"
        >
          {bannerError}
        </div>
      )}

      {!isOnline && (
        <div
          role="status"
          className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-lg"
        >
          {OFFLINE_MSG}
        </div>
      )}

      {ttsNotice && (
        <div
          role="status"
          className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-lg"
        >
          {ttsNotice}
          {lastReply && isTtsSupported() && (
            <button
              type="button"
              className="block mt-3 min-h-[44px] px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold"
              onClick={() => playReply(lastReply)}
            >
              Přečíst nahlas
            </button>
          )}
        </div>
      )}

      <div className="h-[min(50vh,420px)] overflow-y-auto flex flex-col gap-4 p-4 border-2 border-gray-200 rounded-2xl bg-emerald-50/50 text-gray-900">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 max-w-[92%] ${
              msg.from === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
            }`}
          >
            <img
              src={msg.from === "user" ? avatarUser : avatarMello}
              alt={msg.from === "user" ? "Vy" : "Mello"}
              className="w-11 h-11 rounded-full border border-gray-300 shrink-0"
            />
            <div
              className={`px-5 py-3 rounded-2xl text-lg leading-relaxed shadow-md whitespace-pre-wrap ${
                msg.from === "user"
                  ? "bg-blue-100 text-right"
                  : "bg-emerald-100 text-left"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <p className="text-lg italic text-gray-600 px-2" aria-live="polite">
            Přemýšlím…
          </p>
        )}
        {showMemoryPrompt && pendingMemoryCandidate && (
          <div
            className="flex flex-col gap-3 mt-2 bg-amber-50 border-2 border-amber-200 p-4 rounded-2xl text-lg"
            role="region"
            aria-label="Nabídka uložení vzpomínky"
          >
            <p className="text-gray-900">
              To zní jako vzpomínka. Chcete ji uložit do deníku?
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSaveMemory}
                className="min-h-[48px] px-6 py-3 bg-emerald-600 text-white rounded-xl text-lg font-semibold"
              >
                Ano, uložit
              </button>
              <button
                type="button"
                onClick={handleDismissMemory}
                className="min-h-[48px] px-6 py-3 bg-gray-200 text-gray-900 rounded-xl text-lg font-semibold"
              >
                Ne, neukládat
              </button>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="mt-6 mb-4">
        <VoiceInput
          voiceModeEnabled={voiceModeEnabled}
          onVoiceModeChange={setVoiceModeEnabled}
          isThinking={loading}
          isSpeaking={speaking}
          disabled={!isOnline}
          readAloudEnabled={voiceEnabled}
          onTranscript={handleVoiceTranscript}
          onInterimTranscript={handleVoiceInterim}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          className="flex-1 px-5 py-4 text-lg border-2 border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
          type="text"
          placeholder="Napište zprávu…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && sendMessage()}
          disabled={loading}
          aria-label="Text zprávy"
        />
        <button
          type="button"
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
          className="min-h-[56px] bg-emerald-600 text-white text-lg font-semibold px-8 py-4 rounded-2xl hover:bg-emerald-700 transition disabled:opacity-50"
        >
          Odeslat
        </button>
      </div>
    </div>
  );
}
