/**
 * Jednoduchá detekce osobních vzpomínek podle klíčových slov a frází.
 * Neukládá automaticky — pouze navrhuje kandidáta k uložení.
 */

const MEMORY_PHRASES = [
  "vzpominam",
  "vzpominka",
  "pamatuju",
  "pamatuji",
  "pamatuju si",
  "pamatuji si",
  "pamatas",
  "pamatujete",
  "kdysi",
  "tenkrat",
  "driv",
  "drive",
  "za mlada",
  "kdyz jsem byl",
  "kdyz jsem byla",
  "jako dite",
  "v detstvi",
  "na zakladce",
  "ve skole",
  "u babicky",
  "u dedy",
  "s maminkou",
  "s tatinckem",
  "s rodici",
  "s bratrem",
  "se sestrou",
  "na chalupe",
  "na prazdninach",
  "na voji",
  "na svatbe",
  "narodil se",
  "narodila se",
  "pracoval jsem",
  "pracovala jsem",
  "bydleli jsme",
  "zili jsme",
  "jezdili jsme",
  "chodili jsme",
  "hrali jsme",
  "varili jsme",
  "pekli jsme",
  "muj prvni",
  "moje prvni",
  "nikdy nezapomenu",
  "to si pamatuju",
  "to si pamatuji",
];

/** Věty typu „Pamatuj si mé jméno“ — ne osobní vzpomínka (rozkaz, ne vzpomínka). */
const EXCLUDE_PATTERNS = [
  /^pamatuj\s+si\s+/,
  /^pamatujte\s+si\s+/,
  /^pamatuj\s+si\s+(moje|muj|mou|me|mi)\b/,
  /^pamatujte\s+si\s+(moje|muj|mou|me|mi)\b/,
  /^pamatuj\s+si\s+ze\s+/,
  /^pamatujte\s+si\s+ze\s+/,
  /nezapomen(te)?\s+na\s+(schuzku|termin|leky|tablety)/,
];

const CONTEXT_HINTS = [
  " na ",
  " u ",
  " s ",
  " se ",
  " kdy ",
  " jak ",
  " ze ",
  " v ",
  " o ",
  " pro ",
  " od ",
  " do ",
  " pri ",
  " behem ",
  " kde ",
];

function stripDiacritics(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeForMemoryMatch(text) {
  return stripDiacritics(String(text).toLowerCase().trim()).replace(/\s+/g, " ");
}

function isExcluded(normalized) {
  return EXCLUDE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function matchesMemoryPhrase(normalized) {
  const padded = ` ${normalized} `;
  return MEMORY_PHRASES.some((phrase) => padded.includes(` ${phrase} `));
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasEnoughContext(normalized, wordCount) {
  if (wordCount >= 5) return true;
  if (wordCount <= 2) return false;
  return CONTEXT_HINTS.some((hint) => normalized.includes(hint));
}

/**
 * @param {string} text - surová zpráva uživatele
 * @returns {{
 *   isCandidate: boolean,
 *   needsMoreDetail: boolean,
 *   matchedPhrase?: string
 * } | null}
 */
export function detectMemoryCandidate(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;

  const normalized = normalizeForMemoryMatch(raw);

  if (isExcluded(normalized)) {
    return null;
  }

  if (!matchesMemoryPhrase(normalized)) {
    return null;
  }

  const matchedPhrase = MEMORY_PHRASES.find((phrase) =>
    normalized.includes(phrase)
  );

  const wordCount = countWords(raw);
  const needsMoreDetail = !hasEnoughContext(normalized, wordCount);

  return {
    isCandidate: true,
    needsMoreDetail,
    matchedPhrase,
  };
}
