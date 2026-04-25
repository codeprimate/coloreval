import { describe, expect, it } from "vitest";
import { selectTopSessionsByScore } from "../src/history.js";

function mkSession(endedAt, aggregatePct) {
  return { endedAt, aggregatePct, rounds: [] };
}

describe("selectTopSessionsByScore", () => {
  it("returns the top 10 sessions by score", () => {
    const sessions = Array.from({ length: 12 }, (_, i) =>
      mkSession(`2026-01-${String(i + 1).padStart(2, "0")}T12:00:00.000Z`, i),
    );
    const out = selectTopSessionsByScore(sessions);

    expect(out).toHaveLength(10);
    expect(out.map((s) => s.aggregatePct)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  });

  it("breaks score ties by newer endedAt first", () => {
    const sessions = [
      mkSession("2026-01-01T12:00:00.000Z", 90),
      mkSession("2026-01-03T12:00:00.000Z", 90),
      mkSession("2026-01-02T12:00:00.000Z", 90),
    ];
    const out = selectTopSessionsByScore(sessions);

    expect(out.map((s) => s.endedAt)).toEqual([
      "2026-01-03T12:00:00.000Z",
      "2026-01-02T12:00:00.000Z",
      "2026-01-01T12:00:00.000Z",
    ]);
  });
});
