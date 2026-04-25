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
 *   runMeta?: {
 *     seed: string,
 *     startedAt?: string,
 *     runId?: string,
 *     challenge?: {
 *       challengeId: string,
 *       authorName: string,
 *       authorScore: number,
 *       createdAt: string,
 *       challengerRounds?: Array<{ userHsv: { h: number, s: number, v: number }, roundScore: number }>,
 *     },
 *     retryOfRunId?: string,
 *   },
 * }} StoredSession
 */

/**
 * @returns {{ hintDismissed?: boolean, challengeShareUsername?: string, schemaVersion?: number }}
 */
export function loadPrefs() {
  const fallback = defaultPrefs();
  try {
    const raw = localStorage.getItem(LS_KEY_PREFS);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null) {
      return fallback;
    }
    const challengeShareUsername =
      typeof data.challengeShareUsername === "string" ? data.challengeShareUsername.trim() : "";
    return {
      hintDismissed: Boolean(data.hintDismissed),
      challengeShareUsername,
      schemaVersion:
        typeof data.schemaVersion === "number" ? data.schemaVersion : STORAGE_SCHEMA_VERSION,
    };
  } catch {
    return fallback;
  }
}

/**
 * @param {{ hintDismissed?: boolean, challengeShareUsername?: string }} prefs
 * @returns {{ ok: boolean, error?: string }}
 */
export function savePrefs(prefs) {
  const existing = loadPrefs();
  const payload = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    hintDismissed:
      prefs.hintDismissed === undefined
        ? Boolean(existing.hintDismissed)
        : Boolean(prefs.hintDismissed),
    challengeShareUsername:
      typeof prefs.challengeShareUsername === "string"
        ? prefs.challengeShareUsername.trim()
        : typeof existing.challengeShareUsername === "string"
          ? existing.challengeShareUsername
          : "",
  };
  return writeJson(LS_KEY_PREFS, payload);
}

function defaultPrefs() {
  return {
    hintDismissed: false,
    challengeShareUsername: "",
    schemaVersion: STORAGE_SCHEMA_VERSION,
  };
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
          runMeta: normalizeRunMeta(s.runMeta),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function normalizeRunMeta(runMeta) {
  if (!runMeta || typeof runMeta !== "object") return undefined;
  if (typeof runMeta.seed !== "string" || !/^\d{10}$/.test(runMeta.seed)) return undefined;
  const challenge = normalizeChallengeMeta(runMeta.challenge);
  return {
    seed: runMeta.seed,
    startedAt: typeof runMeta.startedAt === "string" ? runMeta.startedAt : undefined,
    runId: typeof runMeta.runId === "string" ? runMeta.runId : undefined,
    challenge: challenge ?? undefined,
    retryOfRunId: typeof runMeta.retryOfRunId === "string" ? runMeta.retryOfRunId : undefined,
  };
}

function normalizeChallengeMeta(challenge) {
  if (!challenge || typeof challenge !== "object") return null;
  const challengerRounds = normalizeChallengerRounds(challenge.challengerRounds);
  if (
    typeof challenge.challengeId !== "string" ||
    !challenge.challengeId.trim() ||
    typeof challenge.authorName !== "string" ||
    !challenge.authorName.trim() ||
    typeof challenge.authorScore !== "number" ||
    !Number.isInteger(challenge.authorScore) ||
    challenge.authorScore < 0 ||
    challenge.authorScore > 100 ||
    typeof challenge.createdAt !== "string" ||
    !Number.isFinite(Date.parse(challenge.createdAt)) ||
    (challenge.challengerRounds !== undefined && !challengerRounds)
  ) {
    return null;
  }
  return {
    challengeId: challenge.challengeId.trim(),
    authorName: challenge.authorName.trim(),
    authorScore: challenge.authorScore,
    createdAt: challenge.createdAt,
    challengerRounds: challengerRounds ?? undefined,
  };
}

function normalizeChallengerRounds(rounds) {
  if (!Array.isArray(rounds)) return null;
  const out = [];
  for (const item of rounds) {
    if (!item || typeof item !== "object") return null;
    if (
      !item.userHsv ||
      typeof item.userHsv !== "object" ||
      typeof item.userHsv.h !== "number" ||
      typeof item.userHsv.s !== "number" ||
      typeof item.userHsv.v !== "number" ||
      typeof item.roundScore !== "number" ||
      !Number.isInteger(item.roundScore) ||
      item.roundScore < 0 ||
      item.roundScore > 100
    ) {
      return null;
    }
    out.push({
      userHsv: {
        h: item.userHsv.h,
        s: item.userHsv.s,
        v: item.userHsv.v,
      },
      roundScore: item.roundScore,
    });
  }
  return out;
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
