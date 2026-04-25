import { describe, expect, it, beforeEach } from "vitest";
import {
  LS_KEY_DRAFT,
  LS_KEY_PREFS,
  STORAGE_SCHEMA_VERSION,
  loadPrefs,
  savePrefs,
  loadSessions,
  appendSession,
  loadDraftRaw,
  saveDraft,
  clearDraft,
} from "../src/storage.js";

function makeMemoryStorage() {
  /** @type {Record<string, string>} */
  const m = {};
  return {
    getItem(k) {
      return m[k] ?? null;
    },
    setItem(k, v) {
      m[k] = v;
    },
    removeItem(k) {
      delete m[k];
    },
    _dump: m,
  };
}

describe("storage", () => {
  /** @type {ReturnType<typeof makeMemoryStorage>} */
  let mem;

  beforeEach(() => {
    mem = makeMemoryStorage();
    globalThis.localStorage = mem;
  });

  it("round-trips prefs", () => {
    expect(loadPrefs().hintDismissed).toBe(false);
    savePrefs({ hintDismissed: true });
    expect(loadPrefs().hintDismissed).toBe(true);
    expect(JSON.parse(mem.getItem(LS_KEY_PREFS)).schemaVersion).toBe(STORAGE_SCHEMA_VERSION);
  });

  it("appends sessions", () => {
    expect(loadSessions()).toEqual([]);
    appendSession({
      endedAt: "2026-01-01T00:00:00.000Z",
      aggregatePct: 77,
      rounds: [],
    });
    const list = loadSessions();
    expect(list).toHaveLength(1);
    expect(list[0].aggregatePct).toBe(77);
    expect(typeof list[0].id).toBe("string");
  });

  it("saves and loads draft with schema", () => {
    const body = {
      roundsPerRun: 2,
      targets: [
        { h: 1, s: 0.5, v: 0.5 },
        { h: 2, s: 0.5, v: 0.5 },
      ],
      committed: [],
      userHsv: { h: 0, s: 0, v: 0.5 },
      startedAt: "x",
      updatedAt: "y",
    };
    expect(saveDraft(body).ok).toBe(true);
    const raw = loadDraftRaw();
    expect(raw.roundsPerRun).toBe(2);
    expect(JSON.parse(mem.getItem(LS_KEY_DRAFT)).schemaVersion).toBe(STORAGE_SCHEMA_VERSION);
  });

  it("loadDraftRaw returns null for wrong schema", () => {
    mem.setItem(LS_KEY_DRAFT, JSON.stringify({ schemaVersion: 0, foo: 1 }));
    expect(loadDraftRaw()).toBeNull();
  });

  it("clearDraft removes key", () => {
    saveDraft({
      roundsPerRun: 1,
      targets: [{ h: 0, s: 1, v: 1 }],
      committed: [],
      userHsv: { h: 0, s: 0, v: 1 },
    });
    expect(clearDraft().ok).toBe(true);
    expect(mem.getItem(LS_KEY_DRAFT)).toBeNull();
  });
});
