/** Bump when persisted JSON shape changes. */
export const STORAGE_SCHEMA_VERSION = 1;

export const LS_KEY_SESSIONS = "coloreval_sessions_v1";
export const LS_KEY_DRAFT = "coloreval_draft_v1";
export const LS_KEY_PREFS = "coloreval_prefs_v1";

/**
 * @typedef {{
 *   id: string,
 *   endedAt: string,
 *   aggregatePct: number,
 *   rounds: import("./run.js").CommittedRound[],
 *   runMeta?: { seed: string, startedAt?: string },
 * }} StoredSession
 */

/**
 * @returns {{ hintDismissed?: boolean, schemaVersion?: number }}
 */
export function loadPrefs() {
  try {
    const raw = localStorage.getItem(LS_KEY_PREFS);
    if (!raw) return { hintDismissed: false, schemaVersion: STORAGE_SCHEMA_VERSION };
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null) {
      return { hintDismissed: false, schemaVersion: STORAGE_SCHEMA_VERSION };
    }
    return {
      hintDismissed: Boolean(data.hintDismissed),
      schemaVersion:
        typeof data.schemaVersion === "number" ? data.schemaVersion : STORAGE_SCHEMA_VERSION,
    };
  } catch {
    return { hintDismissed: false, schemaVersion: STORAGE_SCHEMA_VERSION };
  }
}

/**
 * @param {{ hintDismissed?: boolean }} prefs
 * @returns {{ ok: boolean, error?: string }}
 */
export function savePrefs(prefs) {
  const payload = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    hintDismissed: Boolean(prefs.hintDismissed),
  };
  return writeJson(LS_KEY_PREFS, payload);
}

/**
 * @returns {StoredSession[]}
 */
export function loadSessions() {
  try {
    const raw = localStorage.getItem(LS_KEY_SESSIONS);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || !Array.isArray(data.sessions)) return [];
    const out = [];
    for (const s of data.sessions) {
      if (
        s &&
        typeof s.id === "string" &&
        typeof s.endedAt === "string" &&
        typeof s.aggregatePct === "number" &&
        Array.isArray(s.rounds)
      ) {
        out.push({
          id: s.id,
          endedAt: s.endedAt,
          aggregatePct: s.aggregatePct,
          rounds: s.rounds,
          runMeta:
            s.runMeta &&
            typeof s.runMeta === "object" &&
            typeof s.runMeta.seed === "string" &&
            /^\d{10}$/.test(s.runMeta.seed)
              ? {
                  seed: s.runMeta.seed,
                  startedAt:
                    typeof s.runMeta.startedAt === "string" ? s.runMeta.startedAt : undefined,
                }
              : undefined,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * @param {Omit<StoredSession, "id"> & { id?: string }} session
 * @returns {{ ok: boolean, error?: string }}
 */
export function appendSession(session) {
  const sessions = loadSessions();
  const id = session.id ?? `${session.endedAt}-${Math.random().toString(36).slice(2, 10)}`;
  sessions.push({
    id,
    endedAt: session.endedAt,
    aggregatePct: session.aggregatePct,
    rounds: session.rounds,
    runMeta: session.runMeta,
  });
  return writeJson(LS_KEY_SESSIONS, {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    sessions,
  });
}

/**
 * @returns {object | null} raw draft object (validate with `hydrateRunFromDraft`)
 */
export function loadDraftRaw() {
  try {
    const raw = localStorage.getItem(LS_KEY_DRAFT);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    if (data.schemaVersion !== STORAGE_SCHEMA_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * @param {object} draftBody fields from `runToDraftSnapshot` plus caller may omit schemaVersion
 * @returns {{ ok: boolean, error?: string }}
 */
export function saveDraft(draftBody) {
  const payload = {
    ...draftBody,
    schemaVersion: STORAGE_SCHEMA_VERSION,
  };
  return writeJson(LS_KEY_DRAFT, payload);
}

/** @returns {{ ok: boolean, error?: string }} */
export function clearDraft() {
  try {
    localStorage.removeItem(LS_KEY_DRAFT);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageFromError(e) };
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageFromError(e) };
  }
}

function messageFromError(e) {
  if (e && typeof e === "object" && "name" in e && e.name === "QuotaExceededError") {
    return "QuotaExceededError";
  }
  if (e && typeof e === "object" && "name" in e && e.name === "SecurityError") {
    return "SecurityError";
  }
  return "UnknownError";
}
