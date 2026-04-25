import { hsvToCssColor } from "./color.js";
import QRCode from "qrcode";
import {
  ROUNDS_PER_RUN,
  createRun,
  createSeededRng,
  commitCurrentRound,
  buildFinishedSession,
  generateRunSeed,
  parseRunLaunchContext,
  stripChallengeParamFromSearch,
  hydrateRunFromDraft,
  runToDraftSnapshot,
} from "./run.js";
import { appendSession, clearDraft, loadDraftRaw, saveDraft } from "./storage.js";
import {
  transitionScreen,
  wireButtonAnimations,
  animateRoundAdvance,
  animateQuitShake,
  triggerResultAnimation,
} from "./animations.js";
import { createRenderers } from "./app/renderers.js";
import { createActions } from "./app/actions.js";

/** @typedef {'home' | 'play' | 'results' | 'history' | 'challenge-share'} Screen */
/** @typedef {"forward"|"back"|"up"|"none"} TransitionDirection */

/**
 * @param {HTMLElement | null} root
 */
export function initApp(root) {
  if (!root) return;

  const state = {
    /** @type {Screen} */
    screen: "home",
    /** @type {ReturnType<typeof createRun> | null} */
    run: null,
    /** @type {{ aggregatePct: number, rounds: object[], runMeta?: object } | null} */
    lastResult: null,
    /** @type {{ username: string, url: string | null, qrDataUrl: string | null, error: string | null, submitted: boolean }} */
    challengeShare: { username: "", url: null, qrDataUrl: null, error: null, submitted: false },
    /** @type {string | null} */
    storageError: null,
    /** @type {{ endedAt: string, aggregatePct: number, rounds: object[], runMeta?: object } | null} */
    pendingSession: null,
    /** @type {{ seed: string, challenge: object | null, retryOfRunId: string | null } | null} */
    pendingLaunch: null,
    /** @type {number | null} */
    expandedHistoryIndex: null,
  };

  let isRoundAdvance = false;

  const {
    storageBannerHtml,
    renderHome,
    renderPlay,
    renderResults,
    renderChallengeShare,
    renderHistory,
  } = createRenderers({ state });

  function persistDraft() {
    if (!state.run) return;
    const snap = runToDraftSnapshot(state.run);
    const res = saveDraft(snap);
    if (!res.ok) state.storageError = res.error ?? "save";
  }

  function tryBootstrapResume() {
    const raw = loadDraftRaw();
    if (!raw) return false;
    const { schemaVersion, ...body } = raw;
    void schemaVersion;
    const run = hydrateRunFromDraft(body);
    if (!run) {
      clearDraft();
      return false;
    }
    if (run.committed.length >= run.roundsPerRun) {
      clearDraft();
      return false;
    }
    state.run = run;
    state.screen = "play";
    return true;
  }

  function bindGlobalPersist() {
    window.addEventListener("pagehide", () => {
      persistDraft();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") persistDraft();
    });
  }

  function quitRun() {
    if (!state.run) return;
    const restartSeed = state.run.seed;
    const restartChallenge = state.run.challenge ?? null;
    const retryOfRunId = state.run.runId ?? null;
    animateQuitShake(() => {
      if (!confirm("Go back to start?")) return;
      clearDraft();
      state.pendingLaunch = {
        seed: restartSeed,
        challenge: restartChallenge,
        retryOfRunId,
      };
      state.run = null;
      state.screen = "home";
      render("back");
    });
  }

  /**
   * @param {{ seed?: string | null, challenge?: object | null, retryOfRunId?: string | null, forceRandom?: boolean }} [opts]
   */
  function startNewRun(opts = {}) {
    clearDraft();
    const launch = opts.forceRandom
      ? { seed: null, challenge: null }
      : parseRunLaunchContext({ search: window.location.search, hash: window.location.hash });
    const resolvedSeed = opts.seed ?? launch.seed ?? generateRunSeed();
    const challengeMeta = opts.challenge ?? launch.challenge ?? null;
    const rng = createSeededRng(resolvedSeed);
    state.run = createRun(ROUNDS_PER_RUN, rng, resolvedSeed, {
      challenge: challengeMeta,
      retryOfRunId: opts.retryOfRunId ?? null,
    });
    if (launch.challenge && window.location.search.includes("c=")) {
      const cleanedSearch = stripChallengeParamFromSearch(window.location.search);
      const next = `${window.location.pathname}${cleanedSearch}${window.location.hash}`;
      window.history.replaceState({}, "", next);
    }
    const res = saveDraft(runToDraftSnapshot(state.run));
    if (!res.ok) {
      state.storageError = res.error ?? "save";
    }
    state.challengeShare = {
      username:
        challengeMeta && typeof challengeMeta.authorName === "string"
          ? challengeMeta.authorName
          : "",
      url: null,
      qrDataUrl: null,
      error: null,
      submitted: false,
    };
    state.screen = "play";
    render("forward");
  }

  function finishRunToResults() {
    if (!state.run) return;
    const { aggregatePct, rounds, runMeta } = buildFinishedSession(state.run);
    const endedAt = new Date().toISOString();
    const append = appendSession({ endedAt, aggregatePct, rounds, runMeta });
    if (!append.ok) {
      state.storageError = append.error ?? "save";
      state.pendingSession = { endedAt, aggregatePct, rounds, runMeta };
    } else {
      state.pendingSession = null;
    }
    clearDraft();
    state.lastResult = { aggregatePct, rounds, runMeta };
    state.run = null;
    state.screen = "results";
    render("up");
  }

  function onCommitRound() {
    if (!state.run) return;
    const n = state.run.roundsPerRun;
    const idx = state.run.committed.length;
    const isLast = idx === n - 1;
    if (isLast) {
      commitCurrentRound(state.run);
      finishRunToResults();
      return;
    }
    commitCurrentRound(state.run);
    persistDraft();
    isRoundAdvance = true;
    render("forward");
  }

  /**
   * @param {TransitionDirection} [direction]
   */
  async function render(direction = "forward") {
    let body = "";
    if (state.screen === "home") {
      body = renderHome();
    } else if (state.screen === "play" && state.run) {
      body = renderPlay();
    } else if (state.screen === "results" && state.lastResult) {
      body = renderResults();
    } else if (state.screen === "challenge-share" && state.lastResult) {
      body = renderChallengeShare();
    } else if (state.screen === "history") {
      body = renderHistory();
    } else {
      state.screen = "home";
      body = renderHome();
    }
    const banner = storageBannerHtml();

    if (state.screen === "play" && isRoundAdvance && direction !== "none") {
      root.innerHTML = banner + body;
      bindScreenHandlers();
      await animateRoundAdvance(root);
      isRoundAdvance = false;
    } else if (direction === "none") {
      root.innerHTML = banner + body;
      bindScreenHandlers();
    } else {
      await transitionScreen(() => {
        root.innerHTML = banner + body;
        bindScreenHandlers();
      }, direction);
    }

    wireButtonAnimations(root);

    if (state.screen === "results" && state.lastResult) {
      triggerResultAnimation(state.lastResult.aggregatePct);
    }
  }

  const { bindScreenHandlers } = createActions({
    state,
    root,
    appendSession,
    hsvToCssColor,
    onCommitRound,
    QRCode,
    quitRun,
    render,
    startNewRun,
  });

  if (tryBootstrapResume()) {
    bindGlobalPersist();
    render();
    return;
  }

  state.screen = "home";
  bindGlobalPersist();
  render();
}
