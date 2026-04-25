const DEFAULT_HISTORY_LIMIT = 10;

/**
 * Return the highest-scoring sessions with stable tie-breaking.
 * @param {{ endedAt: string, aggregatePct: number, rounds: object[] }[]} sessions
 * @param {number} [limit]
 */
export function selectTopSessionsByScore(sessions, limit = DEFAULT_HISTORY_LIMIT) {
  const maxItems = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : DEFAULT_HISTORY_LIMIT;
  return sessions
    .slice()
    .sort((a, b) => {
      if (b.aggregatePct !== a.aggregatePct) return b.aggregatePct - a.aggregatePct;
      return new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime();
    })
    .slice(0, maxItems);
}
