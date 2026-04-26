import { matchPercentHsv, randomTargetHsv } from "./color.js";

/** Default rounds for a new run. Drafts and history sessions store their own length (e.g. older 5-round data). */
export const ROUNDS_PER_RUN = 3;
export const RUN_SEED_DIGITS = 10;
export const CHALLENGE_PAYLOAD_VERSION = 1;
export const CHALLENGE_AUTHOR_NAME_MAX_LEN = 24;
const TARGET_VARIETY_CANDIDATES = 12;
const STRONGLY_DIFFERENT_TARGET_MATCH_PCT = 35;

/**
 * Slider values applied after each committed round so every round starts from
 * the same midpoint HSV value (`h=180`, `s=0.5`, `v=0.5`).
 */
export const NEUTRAL_USER_HSV = Object.freeze({ h: 180, s: 0.5, v: 0.5 });

/**
 * @param {string} hash
 * @returns {string | null}
 */
export function parseSeedFromHash(hash) {
  if (typeof hash !== "string") return null;
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const directMatch = raw.match(/^\d{10}$/);
  if (directMatch) return directMatch[0];
  const namedMatch = raw.match(/(?:^|[?&;])seed=(\d{10})(?:$|[?&;])/);
  if (!namedMatch) return null;
  return namedMatch[1];
}

/**
 * @param {string} search
 * @returns {string | null}
 */
export function parseChallengeParamFromSearch(search) {
  if (typeof search !== "string") return null;
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const value = params.get("c");
  if (!value) return null;
  return value.trim() || null;
}

/**
 * @param {string} search
 * @returns {string}
 */
export function stripChallengeParamFromSearch(search) {
  const raw = typeof search === "string" ? search : "";
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  params.delete("c");
  const next = params.toString();
  return next ? `?${next}` : "";
}

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeAuthorName(raw) {
  return String(raw ?? "")
    .trim()
    .slice(0, CHALLENGE_AUTHOR_NAME_MAX_LEN);
}

export function sanitizeChallengeAuthorName(raw) {
  return normalizeAuthorName(raw);
}

/**
 * @param {unknown} payload
 * @returns {{
 *   v: number,
 *   seed: string,
 *   challengeId: string,
 *   authorName: string,
 *   authorScore: number,
 *   createdAt: string,
 *   challengerRounds?: Array<{ userHsv: { h: number, s: number, v: number }, roundScore: number }>
 * } | null}
 */
export function validateChallengePayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const data = /** @type {Record<string, unknown>} */ (payload);
  const authorName = normalizeAuthorName(data.authorName);
  const challengerRounds = normalizeChallengerRounds(data.challengerRounds);
  if (
    data.v !== CHALLENGE_PAYLOAD_VERSION ||
    typeof data.seed !== "string" ||
    !/^\d{10}$/.test(data.seed) ||
    typeof data.challengeId !== "string" ||
    !data.challengeId.trim() ||
    !authorName ||
    typeof data.authorScore !== "number" ||
    !Number.isInteger(data.authorScore) ||
    data.authorScore < 0 ||
    data.authorScore > 100 ||
    typeof data.createdAt !== "string" ||
    !Number.isFinite(Date.parse(data.createdAt)) ||
    (data.challengerRounds !== undefined && !challengerRounds)
  ) {
    return null;
  }
  return {
    v: CHALLENGE_PAYLOAD_VERSION,
    seed: data.seed,
    challengeId: data.challengeId.trim(),
    authorName,
    authorScore: data.authorScore,
    createdAt: data.createdAt,
    challengerRounds: challengerRounds ?? undefined,
  };
}

/**
 * @param {unknown} rounds
 * @returns {Array<{ userHsv: { h: number, s: number, v: number }, roundScore: number }> | null}
 */
function normalizeChallengerRounds(rounds) {
  if (!Array.isArray(rounds)) return null;
  const out = [];
  for (const item of rounds) {
    if (!item || typeof item !== "object") return null;
    const row = /** @type {Record<string, unknown>} */ (item);
    const userHsv = row.userHsv;
    if (
      !userHsv ||
      typeof userHsv !== "object" ||
      typeof userHsv.h !== "number" ||
      typeof userHsv.s !== "number" ||
      typeof userHsv.v !== "number" ||
      typeof row.roundScore !== "number" ||
      !Number.isInteger(row.roundScore) ||
      row.roundScore < 0 ||
      row.roundScore > 100
    ) {
      return null;
    }
    out.push({
      userHsv: { h: userHsv.h, s: userHsv.s, v: userHsv.v },
      roundScore: row.roundScore,
    });
  }
  return out;
}

/**
 * @param {string} text
 * @returns {string}
 */
function toBase64(text) {
  if (typeof btoa === "function") {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  if (typeof globalThis.Buffer === "function") {
    return globalThis.Buffer.from(text, "utf8").toString("base64");
  }
  throw new Error("Base64EncodingUnavailable");
}

/**
 * @param {string} b64
 * @returns {string}
 */
function fromBase64(b64) {
  if (typeof atob === "function") {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }
  if (typeof globalThis.Buffer === "function") {
    return globalThis.Buffer.from(b64, "base64").toString("utf8");
  }
  throw new Error("Base64DecodingUnavailable");
}

/**
 * @param {string} text
 */
export function toBase64Url(text) {
  return toBase64(text).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

/**
 * @param {string} value
 * @returns {string | null}
 */
export function fromBase64Url(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    return fromBase64(padded);
  } catch {
    return null;
  }
}

/**
 * @param {unknown} payload
 * @returns {string}
 */
export function encodeChallengePayload(payload) {
  const valid = validateChallengePayload(payload);
  if (!valid) throw new Error("InvalidChallengePayload");
  return toBase64Url(JSON.stringify(valid));
}

/**
 * @param {string | null} value
 * @returns {ReturnType<typeof validateChallengePayload>}
 */
export function decodeChallengePayloadParam(value) {
  if (!value) return null;
  const jsonText = fromBase64Url(value);
  if (!jsonText) return null;
  try {
    return validateChallengePayload(JSON.parse(jsonText));
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   v?: number,
 *   seed: string,
 *   challengeId?: string,
 *   authorName: string,
 *   authorScore: number,
 *   createdAt?: string,
 *   challengerRounds?: Array<{ userHsv: { h: number, s: number, v: number }, roundScore: number }>
 * }} input
 */
export function createChallengePayload(input) {
  const nowIso = new Date().toISOString();
  const challengeId =
    input.challengeId ?? `ch_${generateRunSeed()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    v: CHALLENGE_PAYLOAD_VERSION,
    seed: input.seed,
    challengeId,
    authorName: sanitizeChallengeAuthorName(input.authorName),
    authorScore: input.authorScore,
    createdAt: input.createdAt ?? nowIso,
    challengerRounds: normalizeChallengerRounds(input.challengerRounds) ?? undefined,
  };
}

/**
 * @param {{ origin: string, pathname: string }} base
 * @param {unknown} payload
 */
export function buildChallengeUrl(base, payload) {
  const encoded = encodeChallengePayload(payload);
  return `${base.origin}${base.pathname}?c=${encoded}`;
}

/**
 * @param {{ search?: string, hash?: string }} source
 * @returns {{ seed: string | null, challenge: ReturnType<typeof validateChallengePayload> }}
 */
export function parseRunLaunchContext(source) {
  const challengeParam = parseChallengeParamFromSearch(source.search ?? "");
  const challenge = decodeChallengePayloadParam(challengeParam);
  if (challenge) {
    return { seed: challenge.seed, challenge };
  }
  const seed = parseSeedFromHash(source.hash ?? "");
  return { seed, challenge: null };
}

/**
 * @param {() => number} [rng]
 */
export function generateRunSeed(rng = Math.random) {
  let seed = "";
  for (let i = 0; i < RUN_SEED_DIGITS; i += 1) {
    seed += Math.floor(rng() * 10);
  }
  return seed;
}

export function generateRunId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {string} seed
 */
export function createSeededRng(seed) {
  let state = 0;
  for (let i = 0; i < seed.length; i += 1) {
    state = (state * 10 + Number(seed[i])) >>> 0;
  }
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Picks a target that is strongly different from the previous target.
 *
 * Strategy:
 * - Sample multiple random candidates
 * - Keep the candidate with the *lowest* perceptual match score vs the previous
 * - Return early if we find one below a "strongly different" cutoff
 *
 * This produces more dramatic round-to-round color changes while staying
 * deterministic for seeded runs and bounded in CPU time.
 * @param {{ h: number, s: number, v: number } | null} prevTarget
 * @param {() => number} rng
 */
function pickVariedTarget(prevTarget, rng) {
  if (!prevTarget) {
    return randomTargetHsv(rng);
  }

  let bestTarget = randomTargetHsv(rng);
  let lowestMatchPct = matchPercentHsv(prevTarget, bestTarget);
  if (lowestMatchPct <= STRONGLY_DIFFERENT_TARGET_MATCH_PCT) {
    return bestTarget;
  }

  for (let i = 1; i < TARGET_VARIETY_CANDIDATES; i += 1) {
    const candidate = randomTargetHsv(rng);
    const candidateMatchPct = matchPercentHsv(prevTarget, candidate);
    if (candidateMatchPct < lowestMatchPct) {
      bestTarget = candidate;
      lowestMatchPct = candidateMatchPct;
      if (lowestMatchPct <= STRONGLY_DIFFERENT_TARGET_MATCH_PCT) {
        break;
      }
    }
  }

  return bestTarget;
}

/**
 * @typedef {{ h: number, s: number, v: number }} Hsv
 * @typedef {{ targetHsv: Hsv, userHsv: Hsv, roundScore: number }} CommittedRound
 */

/**
 * @param {number} [roundsPerRun]
 * @param {() => number} [rng]
 * @returns {{
 *   roundsPerRun: number,
 *   targets: Hsv[],
 *   committed: CommittedRound[],
 *   userHsv: Hsv,
 *   startedAt: string,
 *   seed: string,
 * }}
 */
export function createRun(
  roundsPerRun = ROUNDS_PER_RUN,
  rng = Math.random,
  seed = generateRunSeed(rng),
  options = {},
) {
  const targets = [];
  for (let i = 0; i < roundsPerRun; i += 1) {
    const prevTarget = i > 0 ? targets[i - 1] : null;
    targets.push(pickVariedTarget(prevTarget, rng));
  }
  return {
    roundsPerRun,
    targets,
    committed: [],
    userHsv: { ...NEUTRAL_USER_HSV },
    hasInteractedThisRound: false,
    startedAt: new Date().toISOString(),
    seed,
    runId: typeof options.runId === "string" && options.runId ? options.runId : generateRunId(),
    challenge: normalizeChallengeMeta(options.challenge),
    retryOfRunId:
      typeof options.retryOfRunId === "string" && options.retryOfRunId
        ? options.retryOfRunId
        : null,
  };
}

/**
 * @param {unknown} challenge
 */
function normalizeChallengeMeta(challenge) {
  if (!challenge || typeof challenge !== "object") return null;
  const data = /** @type {Record<string, unknown>} */ (challenge);
  const challengerRounds = normalizeChallengerRounds(data.challengerRounds);
  if (
    typeof data.challengeId !== "string" ||
    !data.challengeId.trim() ||
    typeof data.authorName !== "string" ||
    !sanitizeChallengeAuthorName(data.authorName) ||
    typeof data.authorScore !== "number" ||
    !Number.isInteger(data.authorScore) ||
    data.authorScore < 0 ||
    data.authorScore > 100 ||
    typeof data.createdAt !== "string" ||
    !Number.isFinite(Date.parse(data.createdAt)) ||
    (data.challengerRounds !== undefined && !challengerRounds)
  ) {
    return null;
  }
  return {
    challengeId: data.challengeId.trim(),
    authorName: sanitizeChallengeAuthorName(data.authorName),
    authorScore: data.authorScore,
    createdAt: data.createdAt,
    challengerRounds: challengerRounds ?? undefined,
  };
}

/**
 * Returns the current round index (`0..N-1`) while a run is active.
 * Returns `null` when all rounds are committed.
 * @param {ReturnType<typeof createRun>} run
 * @returns {number | null}
 */
export function currentRoundIndex(run) {
  if (run.committed.length >= run.roundsPerRun) return null;
  return run.committed.length;
}

/**
 * @param {ReturnType<typeof createRun>} run
 * @returns {Hsv | null}
 */
export function currentTargetHsv(run) {
  const i = currentRoundIndex(run);
  if (i === null) return null;
  return run.targets[i];
}

/**
 * @param {ReturnType<typeof createRun>} run
 * @returns {number | null} Live match percentage for current sliders vs. target.
 */
export function currentLiveMatchPercent(run) {
  const t = currentTargetHsv(run);
  if (!t) return null;
  return matchPercentHsv(t, run.userHsv);
}

/**
 * Commits the current round score and advances or completes the run.
 * @param {ReturnType<typeof createRun>} run
 * @returns {{ done: boolean }}
 */
export function commitCurrentRound(run) {
  const i = currentRoundIndex(run);
  if (i === null) return { done: true };
  const targetHsv = run.targets[i];
  const userHsv = { ...run.userHsv };
  const roundScore = matchPercentHsv(targetHsv, userHsv);
  run.committed.push({ targetHsv: { ...targetHsv }, userHsv, roundScore });
  if (run.committed.length >= run.roundsPerRun) {
    return { done: true };
  }
  run.userHsv = { ...NEUTRAL_USER_HSV };
  run.hasInteractedThisRound = false;
  return { done: false };
}

/**
 * Returns the mean of committed round scores.
 * @param {CommittedRound[]} committed
 * @returns {number} integer 0–100
 */
export function aggregatePercent(committed) {
  if (committed.length === 0) return 0;
  const sum = committed.reduce((acc, r) => acc + r.roundScore, 0);
  return Math.round(sum / committed.length);
}

/**
 * @param {ReturnType<typeof createRun>} run
 * @returns {{ aggregatePct: number, rounds: CommittedRound[] }}
 */
export function buildFinishedSession(run) {
  const challenge = normalizeChallengeMeta(run.challenge);
  return {
    aggregatePct: aggregatePercent(run.committed),
    runMeta: {
      seed: run.seed,
      startedAt: run.startedAt,
      runId: run.runId,
      challenge: challenge ?? undefined,
      retryOfRunId: run.retryOfRunId ?? undefined,
    },
    rounds: run.committed.map((r) => ({
      targetHsv: r.targetHsv,
      userHsv: r.userHsv,
      roundScore: r.roundScore,
    })),
  };
}

/**
 * Rebuilds an in-memory run from persisted draft fields.
 * @param {object} draft
 * @returns {ReturnType<typeof createRun> | null}
 */
export function hydrateRunFromDraft(draft) {
  if (!draft || typeof draft !== "object") return null;
  const roundsPerRun = draft.roundsPerRun;
  const targets = draft.targets;
  const committed = draft.committed;
  const userHsv = draft.userHsv;
  if (
    typeof roundsPerRun !== "number" ||
    roundsPerRun < 1 ||
    !Array.isArray(targets) ||
    targets.length !== roundsPerRun ||
    !Array.isArray(committed) ||
    committed.length > roundsPerRun ||
    !userHsv ||
    typeof userHsv.h !== "number" ||
    typeof userHsv.s !== "number" ||
    typeof userHsv.v !== "number"
  ) {
    return null;
  }
  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i];
    if (!t || typeof t.h !== "number" || typeof t.s !== "number" || typeof t.v !== "number") {
      return null;
    }
  }
  for (let i = 0; i < committed.length; i += 1) {
    const c = committed[i];
    if (
      !c ||
      !c.targetHsv ||
      !c.userHsv ||
      typeof c.roundScore !== "number" ||
      typeof c.targetHsv.h !== "number"
    ) {
      return null;
    }
  }
  return {
    roundsPerRun,
    targets: targets.map((t) => ({ ...t })),
    committed: committed.map((c) => ({
      targetHsv: { ...c.targetHsv },
      userHsv: { ...c.userHsv },
      roundScore: c.roundScore,
    })),
    userHsv: { h: userHsv.h, s: userHsv.s, v: userHsv.v },
    hasInteractedThisRound:
      typeof draft.hasInteractedThisRound === "boolean"
        ? draft.hasInteractedThisRound
        : userHsv.h !== NEUTRAL_USER_HSV.h ||
          userHsv.s !== NEUTRAL_USER_HSV.s ||
          userHsv.v !== NEUTRAL_USER_HSV.v,
    startedAt: typeof draft.startedAt === "string" ? draft.startedAt : new Date().toISOString(),
    seed:
      typeof draft.seed === "string" && /^\d{10}$/.test(draft.seed)
        ? draft.seed
        : generateRunSeed(),
    runId: typeof draft.runId === "string" && draft.runId.trim() ? draft.runId : generateRunId(),
    challenge: normalizeChallengeMeta(draft.challenge),
    retryOfRunId:
      typeof draft.retryOfRunId === "string" && draft.retryOfRunId.trim()
        ? draft.retryOfRunId
        : null,
  };
}

/**
 * Builds the persisted draft snapshot payload.
 * @param {ReturnType<typeof createRun>} run
 */
export function runToDraftSnapshot(run) {
  return {
    roundsPerRun: run.roundsPerRun,
    targets: run.targets.map((t) => ({ ...t })),
    committed: run.committed.map((c) => ({
      targetHsv: { ...c.targetHsv },
      userHsv: { ...c.userHsv },
      roundScore: c.roundScore,
    })),
    userHsv: { ...run.userHsv },
    hasInteractedThisRound: Boolean(run.hasInteractedThisRound),
    startedAt: run.startedAt,
    seed: run.seed,
    runId: run.runId,
    challenge: run.challenge ?? undefined,
    retryOfRunId: run.retryOfRunId ?? undefined,
    updatedAt: new Date().toISOString(),
  };
}
