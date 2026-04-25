import { matchPercentHsv, randomTargetHsv } from "./color.js";

/** Number of rounds per run in schema version 1. */
export const ROUNDS_PER_RUN = 5;
export const RUN_SEED_DIGITS = 10;
const MAX_TARGET_RETRIES = 12;
const MAX_SIMILAR_TARGET_MATCH_PCT = 85;

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
 * @param {() => number} [rng]
 */
export function generateRunSeed(rng = Math.random) {
  let seed = "";
  for (let i = 0; i < RUN_SEED_DIGITS; i += 1) {
    seed += Math.floor(rng() * 10);
  }
  return seed;
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
 * Picks a random target, retrying if it is too similar to the previous target.
 * This keeps rounds visually varied without risking infinite loops with fixed RNGs.
 * @param {{ h: number, s: number, v: number } | null} prevTarget
 * @param {() => number} rng
 */
function pickVariedTarget(prevTarget, rng) {
  let target = randomTargetHsv(rng);
  if (!prevTarget) return target;
  let attempts = 0;
  while (
    attempts < MAX_TARGET_RETRIES &&
    matchPercentHsv(prevTarget, target) >= MAX_SIMILAR_TARGET_MATCH_PCT
  ) {
    target = randomTargetHsv(rng);
    attempts += 1;
  }
  return target;
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
  return {
    aggregatePct: aggregatePercent(run.committed),
    runMeta: {
      seed: run.seed,
      startedAt: run.startedAt,
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
    updatedAt: new Date().toISOString(),
  };
}
