import { LS_KEY_DRAFT, LS_KEY_PREFS, LS_KEY_SESSIONS, clearDraft } from "./storage.js";

/** `localStorage` key names written by the app. */
export const COLOREVAL_STORAGE_KEYS = Object.freeze({
  sessions: LS_KEY_SESSIONS,
  draft: LS_KEY_DRAFT,
  prefs: LS_KEY_PREFS,
});

/**
 * Removes completed-run history only.
 * @returns {{ ok: boolean, key: string, error?: string }}
 */
export function clearColorevalSessions() {
  try {
    localStorage.removeItem(LS_KEY_SESSIONS);
    return { ok: true, key: LS_KEY_SESSIONS };
  } catch (e) {
    return { ok: false, key: LS_KEY_SESSIONS, error: String(e) };
  }
}

/**
 * Removes preferences only (for example, `hintDismissed`).
 * @returns {{ ok: boolean, key: string, error?: string }}
 */
export function clearColorevalPrefs() {
  try {
    localStorage.removeItem(LS_KEY_PREFS);
    return { ok: true, key: LS_KEY_PREFS };
  } catch (e) {
    return { ok: false, key: LS_KEY_PREFS, error: String(e) };
  }
}

/**
 * Removes the in-progress draft only.
 * @returns {{ ok: boolean, error?: string }}
 */
export function clearColorevalDraft() {
  return clearDraft();
}

/**
 * Clears all Coloreval `localStorage` keys.
 * @returns {{ ok: boolean, sessions: object, draft: object, prefs: object }}
 */
export function clearAllColorevalData() {
  const sessions = clearColorevalSessions();
  const draft = clearColorevalDraft();
  const prefs = clearColorevalPrefs();
  return {
    ok: sessions.ok && draft.ok && prefs.ok,
    sessions,
    draft,
    prefs,
  };
}

/**
 * Attaches `globalThis.colorevalDev` for browser-console and automation use.
 * @param {typeof globalThis} [target]
 */
export function attachColorevalConsoleHelpers(target = globalThis) {
  if (!target || typeof target !== "object") return;

  target.colorevalDev = {
    keys: COLOREVAL_STORAGE_KEYS,
    clearAll: clearAllColorevalData,
    clearSessions: clearColorevalSessions,
    clearDraft: clearColorevalDraft,
    clearPrefs: clearColorevalPrefs,
    help() {
      return [
        "Coloreval console helpers (localStorage only):",
        "  colorevalDev.clearAll()     — sessions + draft + prefs",
        "  colorevalDev.clearSessions()",
        "  colorevalDev.clearDraft()",
        "  colorevalDev.clearPrefs()",
        "  colorevalDev.keys           — storage key names",
        "Reload the page after clearing if the UI should reflect empty state.",
      ].join("\n");
    },
  };
}
