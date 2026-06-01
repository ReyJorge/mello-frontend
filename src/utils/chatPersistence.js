import { supabase } from "./supabaseClient";

const STORAGE_PREFIX = "mello_chat_";
const CONVERSATION_PREFIX = "mello_conversation_";
export const INTRO_MESSAGE_ID = "intro";

export const INTRO_MESSAGE = {
  id: INTRO_MESSAGE_ID,
  from: "mello",
  text: "Dobrý den. Jsem Mello, váš digitální společník. Můžete mi napsat nebo na mě mluvit — jsem tu pro vás.",
};

const MESSAGE_LIMIT = 50;

function storageKey(userId) {
  return `${STORAGE_PREFIX}${userId || "guest"}`;
}

function conversationKey(userId) {
  return `${CONVERSATION_PREFIX}${userId || "guest"}`;
}

export function getConversationId(userId) {
  try {
    const key = conversationKey(userId);
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function roleToUi(role) {
  return role === "user" ? "user" : "mello";
}

export function uiToRole(from) {
  return from === "user" ? "user" : "assistant";
}

function rowToUi(row) {
  return {
    id: row.id,
    from: roleToUi(row.role),
    text: row.content,
    createdAt: row.created_at,
  };
}

export function loadMessagesFromLocal(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveMessagesToLocal(userId, messages) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(messages.slice(-MESSAGE_LIMIT)));
  } catch {
    /* quota / private mode */
  }
}

export async function loadMessagesFromSupabase(userId) {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, role, content, created_at, conversation_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_LIMIT);

    if (error || !data?.length) return null;

    if (data[0]?.conversation_id) {
      try {
        localStorage.setItem(conversationKey(userId), data[0].conversation_id);
      } catch {
        /* ignore */
      }
    }

    return data.reverse().map(rowToUi);
  } catch {
    return null;
  }
}

export async function saveMessageToSupabase(userId, message) {
  if (!userId || message.id === INTRO_MESSAGE_ID) return false;
  try {
    const { error } = await supabase.from("chat_messages").insert({
      user_id: userId,
      role: uiToRole(message.from),
      content: message.text,
      conversation_id: getConversationId(userId),
    });
    return !error;
  } catch {
    return false;
  }
}

export async function loadChatMessages(userId) {
  if (userId) {
    const fromRemote = await loadMessagesFromSupabase(userId);
    if (fromRemote?.length) {
      saveMessagesToLocal(userId, fromRemote);
      return fromRemote;
    }
  }

  const local = loadMessagesFromLocal(userId);
  if (local?.length) return local;

  return [{ ...INTRO_MESSAGE }];
}

/** Uloží jednu zprávu: localStorage vždy, Supabase pokud je přihlášen */
export async function persistMessage(userId, messages, message) {
  saveMessagesToLocal(userId, messages);
  if (userId) {
    await saveMessageToSupabase(userId, message);
  }
}

export function createMessage(from, text) {
  return { id: crypto.randomUUID(), from, text };
}
