import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoadSessions, mockSelectTopSessionsByScore } = vi.hoisted(() => ({
  mockLoadSessions: vi.fn(),
  mockSelectTopSessionsByScore: vi.fn(),
}));

vi.mock("../src/storage.js", () => ({
  loadPrefs: () => ({ hintDismissed: true }),
  loadSessions: mockLoadSessions,
}));

vi.mock("../src/history.js", () => ({
  selectTopSessionsByScore: mockSelectTopSessionsByScore,
}));

import { createRenderers } from "../src/app/renderers.js";

function mkRound() {
  return {
    targetHsv: { h: 0, s: 100, v: 100 },
    userHsv: { h: 240, s: 100, v: 100 },
    roundScore: 50,
  };
}

describe("createRenderers renderHistory actions", () => {
  beforeEach(() => {
    mockLoadSessions.mockReset();
    mockSelectTopSessionsByScore.mockReset();
    mockLoadSessions.mockReturnValue([]);
  });

  it("omits retry action when retry is unavailable", () => {
    const sessionWithoutSeed = {
      id: "run-1",
      endedAt: "2026-01-01T00:00:00.000Z",
      aggregatePct: 80,
      rounds: [mkRound()],
      runMeta: {},
    };
    mockSelectTopSessionsByScore.mockReturnValue([sessionWithoutSeed]);

    const state = { expandedHistoryIndex: null };
    const { renderHistory } = createRenderers({ state });
    const html = renderHistory();

    expect(html).not.toContain('data-action="history-retry"');
  });

  it("omits share action for challenge runs", () => {
    const challengeSession = {
      id: "run-2",
      endedAt: "2026-01-02T00:00:00.000Z",
      aggregatePct: 85,
      rounds: [mkRound()],
      runMeta: {
        seed: "1234567890",
        challenge: {
          challengeId: "c1",
          authorName: "Pat",
          authorScore: 80,
          createdAt: "2026-01-01T00:00:00.000Z",
          challengerRounds: [{ userHsv: { h: 20, s: 50, v: 50 }, roundScore: 80 }],
        },
      },
    };
    mockSelectTopSessionsByScore.mockReturnValue([challengeSession]);

    const state = { expandedHistoryIndex: null };
    const { renderHistory } = createRenderers({ state });
    const html = renderHistory();

    expect(html).not.toContain('data-action="history-share"');
  });
});
