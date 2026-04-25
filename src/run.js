import { matchPercentHsv, randomTargetHsv } from "./color.js";

/** Number of rounds per run in schema version 1. */
export const ROUNDS_PER_RUN = 5;

/**
 * Slider values applied after each committed round so every round starts from
 * the same neutral HSV value (`h=0`, `s=0`, `v=0.5`).
 */
export const NEUTRAL_USER_HSV = Object.freeze({ h: 0, s: 0, v: 0.5 });

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
 * }}
 */
export function createRun(roundsPerRun = ROUNDS_PER_RUN, rng = Math.random) {
  const targets = [];
  for (let i = 0; i < roundsPerRun; i += 1) {
    targets.push(randomTargetHsv(rng));
  }
  return {
    roundsPerRun,
    targets,
    committed: [],
    userHsv: { ...NEUTRAL_USER_HSV },
    hasInteractedThisRound: false,
    startedAt: new Date().toISOString(),
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
    updatedAt: new Date().toISOString(),
  };
}
