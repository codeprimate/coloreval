import { describe, expect, it } from "vitest";
import { matchPercentHsv } from "../src/color.js";
import {
  ROUNDS_PER_RUN,
  NEUTRAL_USER_HSV,
  createRun,
  createSeededRng,
  currentRoundIndex,
  commitCurrentRound,
  aggregatePercent,
  buildFinishedSession,
  generateRunSeed,
  hydrateRunFromDraft,
  parseSeedFromHash,
  runToDraftSnapshot,
} from "../src/run.js";

describe("createRun", () => {
  it("creates N targets and neutral user", () => {
    const rng = () => 0.5;
    const run = createRun(3, rng);
    expect(run.roundsPerRun).toBe(3);
    expect(run.targets).toHaveLength(3);
    expect(run.committed).toHaveLength(0);
    expect(run.userHsv).toEqual({ ...NEUTRAL_USER_HSV });
    expect(run.hasInteractedThisRound).toBe(false);
  });

  it("uses ROUNDS_PER_RUN by default", () => {
    const run = createRun(undefined, () => 0.4);
    expect(run.targets).toHaveLength(ROUNDS_PER_RUN);
  });

  it("uses provided seed and keeps targets deterministic", () => {
    const seed = "1234567890";
    const runA = createRun(3, createSeededRng(seed), seed);
    const runB = createRun(3, createSeededRng(seed), seed);
    expect(runA.seed).toBe(seed);
    expect(runB.seed).toBe(seed);
    expect(runA.targets).toEqual(runB.targets);
  });

  it("prefers wildly different adjacent targets", () => {
    const seed = "1234567890";
    const run = createRun(8, createSeededRng(seed), seed);
    const adjacentMatchPcts = run.targets
      .slice(1)
      .map((target, i) => matchPercentHsv(run.targets[i], target));
    expect(Math.max(...adjacentMatchPcts)).toBeLessThanOrEqual(35);
  });
});

describe("commitCurrentRound", () => {
  it("advances through all rounds", () => {
    const run = createRun(2, () => 0.5);
    run.hasInteractedThisRound = true;
    run.userHsv = { h: 10, s: 0.5, v: 0.5 };
    expect(commitCurrentRound(run).done).toBe(false);
    expect(run.committed).toHaveLength(1);
    expect(run.userHsv).toEqual({ ...NEUTRAL_USER_HSV });
    expect(run.hasInteractedThisRound).toBe(false);
    run.userHsv = { h: 20, s: 0.6, v: 0.6 };
    expect(commitCurrentRound(run).done).toBe(true);
    expect(run.committed).toHaveLength(2);
  });
});

describe("aggregatePercent / buildFinishedSession", () => {
  it("matches mean of round scores rounded", () => {
    const committed = [
      { targetHsv: { h: 0, s: 1, v: 1 }, userHsv: { h: 0, s: 1, v: 1 }, roundScore: 100 },
      { targetHsv: { h: 0, s: 1, v: 1 }, userHsv: { h: 180, s: 1, v: 1 }, roundScore: 0 },
    ];
    expect(aggregatePercent(committed)).toBe(50);
    const run = createRun(2, () => 0.5);
    run.committed = committed;
    const fin = buildFinishedSession(run);
    expect(fin.aggregatePct).toBe(50);
    expect(fin.rounds).toHaveLength(2);
    expect(fin.runMeta.seed).toMatch(/^\d{10}$/);
  });
});

describe("draft round-trip", () => {
  it("hydrateRunFromDraft restores playable run", () => {
    const run = createRun(3, () => 0.42);
    run.userHsv = { h: 99, s: 0.3, v: 0.8 };
    run.hasInteractedThisRound = true;
    const snap = runToDraftSnapshot(run);
    const restored = hydrateRunFromDraft(snap);
    expect(restored).not.toBeNull();
    expect(restored.targets).toEqual(run.targets);
    expect(restored.committed).toEqual(run.committed);
    expect(restored.userHsv).toEqual(run.userHsv);
    expect(restored.hasInteractedThisRound).toBe(true);
    expect(restored.seed).toMatch(/^\d{10}$/);
  });

  it("infers slider interaction for legacy drafts", () => {
    const run = createRun(2, () => 0.42);
    run.userHsv = { h: 99, s: 0.3, v: 0.8 };
    const snap = runToDraftSnapshot(run);
    delete snap.hasInteractedThisRound;
    const restored = hydrateRunFromDraft(snap);
    expect(restored).not.toBeNull();
    expect(restored.hasInteractedThisRound).toBe(true);
    expect(restored.seed).toMatch(/^\d{10}$/);
  });

  it("returns null for invalid draft", () => {
    expect(hydrateRunFromDraft(null)).toBeNull();
    expect(hydrateRunFromDraft({})).toBeNull();
    expect(
      hydrateRunFromDraft({
        roundsPerRun: 2,
        targets: [{}],
        committed: [],
        userHsv: { h: 0, s: 0, v: 1 },
      }),
    ).toBeNull();
  });
});

describe("currentRoundIndex", () => {
  it("is null when complete", () => {
    const run = createRun(1, () => 0.5);
    commitCurrentRound(run);
    expect(currentRoundIndex(run)).toBeNull();
  });
});

describe("seed utilities", () => {
  it("parses 10-digit seed from hash", () => {
    expect(parseSeedFromHash("#1234567890")).toBe("1234567890");
    expect(parseSeedFromHash("#seed=1234567890")).toBe("1234567890");
    expect(parseSeedFromHash("#12345")).toBeNull();
  });

  it("generates 10-digit seed string", () => {
    const seed = generateRunSeed(() => 0.1);
    expect(seed).toHaveLength(10);
    expect(seed).toMatch(/^\d{10}$/);
  });
});
