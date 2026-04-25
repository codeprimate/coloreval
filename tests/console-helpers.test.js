import { describe, expect, it, beforeEach } from "vitest";
import {
  COLOREVAL_STORAGE_KEYS,
  clearAllColorevalData,
  clearColorevalDraft,
  clearColorevalPrefs,
  clearColorevalSessions,
  attachColorevalConsoleHelpers,
} from "../src/console-helpers.js";

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

describe("console-helpers", () => {
  /** @type {ReturnType<typeof makeMemoryStorage>} */
  let mem;

  beforeEach(() => {
    mem = makeMemoryStorage();
    globalThis.localStorage = mem;
    mem.setItem(COLOREVAL_STORAGE_KEYS.sessions, '{"schemaVersion":1,"sessions":[]}');
    mem.setItem(COLOREVAL_STORAGE_KEYS.draft, '{"schemaVersion":1,"x":1}');
    mem.setItem(COLOREVAL_STORAGE_KEYS.prefs, '{"schemaVersion":1,"hintDismissed":true}');
  });

  it("clearColorevalSessions removes only sessions key", () => {
    const r = clearColorevalSessions();
    expect(r.ok).toBe(true);
    expect(mem.getItem(COLOREVAL_STORAGE_KEYS.sessions)).toBeNull();
    expect(mem.getItem(COLOREVAL_STORAGE_KEYS.draft)).not.toBeNull();
  });

  it("clearColorevalPrefs removes only prefs key", () => {
    clearColorevalPrefs();
    expect(mem.getItem(COLOREVAL_STORAGE_KEYS.prefs)).toBeNull();
    expect(mem.getItem(COLOREVAL_STORAGE_KEYS.sessions)).not.toBeNull();
  });

  it("clearColorevalDraft removes draft key", () => {
    clearColorevalDraft();
    expect(mem.getItem(COLOREVAL_STORAGE_KEYS.draft)).toBeNull();
  });

  it("clearAllColorevalData removes all keys", () => {
    const r = clearAllColorevalData();
    expect(r.ok).toBe(true);
    expect(mem.getItem(COLOREVAL_STORAGE_KEYS.sessions)).toBeNull();
    expect(mem.getItem(COLOREVAL_STORAGE_KEYS.draft)).toBeNull();
    expect(mem.getItem(COLOREVAL_STORAGE_KEYS.prefs)).toBeNull();
  });

  it("attachColorevalConsoleHelpers exposes colorevalDev", () => {
    const g = {};
    attachColorevalConsoleHelpers(g);
    expect(g.colorevalDev).toBeDefined();
    expect(g.colorevalDev.keys).toEqual(COLOREVAL_STORAGE_KEYS);
    expect(typeof g.colorevalDev.clearAll).toBe("function");
    expect(g.colorevalDev.help()).toContain("clearAll");
  });
});
