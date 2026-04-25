import { buildChallengeUrl, createChallengePayload, sanitizeChallengeAuthorName } from "../run.js";
import { loadPrefs, loadSessions, savePrefs } from "../storage.js";
import { selectTopSessionsByScore } from "../history.js";
import { parseSliders } from "./utils.js";

/**
 * @param {{ challengeShare: { username: string, url: string | null, qrDataUrl: string | null, error: string | null, submitted: boolean } }} state
 * @param {string} rawName
 * @returns {{ authorName: string, changed: boolean }}
 */
export function updateChallengeShareUsername(state, rawName) {
  const authorName = sanitizeChallengeAuthorName(rawName);
  const changed = authorName !== state.challengeShare.username;
  state.challengeShare.username = authorName;
  if (changed) {
    state.challengeShare.url = null;
    state.challengeShare.qrDataUrl = null;
    state.challengeShare.error = null;
    state.challengeShare.submitted = false;
  }
  return { authorName, changed };
}

/**
 * @param {{
 *   state: object
 *   root: HTMLElement
 *   appendSession: Function
 *   hsvToCssColor: Function
 *   onCommitRound: Function
 *   QRCode: { toDataURL: Function }
 *   quitRun: Function
 *   render: Function
 *   startNewRun: Function
 * }} deps
 */
export function createActions({
  state,
  root,
  appendSession,
  hsvToCssColor,
  onCommitRound,
  QRCode,
  quitRun,
  render,
  startNewRun,
}) {
  let sliderHintTimer = null;

  function preferredShareUsername() {
    const prefs = loadPrefs();
    return typeof prefs.challengeShareUsername === "string" ? prefs.challengeShareUsername : "";
  }

  function bindScreenHandlers() {
    root.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", onActionClick);
    });

    const form = root.querySelector("#play-form");
    if (form instanceof HTMLFormElement && state.run) {
      const commitBtn = root.querySelector('[data-action="commit"]');
      const actionStack = root.querySelector(".stack--actions");
      const sync = () => {
        Object.assign(state.run.userHsv, parseSliders(form));
        state.run.hasInteractedThisRound = true;
        const yours = root.querySelector("#yours-swatch");
        if (yours instanceof HTMLElement) {
          yours.style.backgroundColor = hsvToCssColor(state.run.userHsv);
        }
        if (commitBtn instanceof HTMLButtonElement) {
          commitBtn.disabled = false;
        }
      };
      form.addEventListener("input", sync);
      form.addEventListener("change", sync);
      if (commitBtn instanceof HTMLButtonElement && actionStack instanceof HTMLElement) {
        const showHintIfCommitDisabled = () => {
          if (!commitBtn.disabled) return;
          flashSliderHint();
        };
        commitBtn.addEventListener("mouseover", showHintIfCommitDisabled);
        commitBtn.addEventListener("pointerdown", showHintIfCommitDisabled);
      }
    }
  }

  function flashSliderHint() {
    const arrows = root.querySelectorAll('[data-role="slider-hint-arrow"]');
    if (!arrows.length) return;
    arrows.forEach((arrow) => {
      if (!(arrow instanceof HTMLElement)) return;
      arrow.classList.remove("slider-hint-arrow--active");
      // Force a restart when repeatedly hovering the disabled button.
      void arrow.offsetWidth;
      arrow.classList.add("slider-hint-arrow--active");
    });
    if (sliderHintTimer !== null) {
      window.clearTimeout(sliderHintTimer);
    }
    sliderHintTimer = window.setTimeout(() => {
      arrows.forEach((arrow) => {
        if (arrow instanceof HTMLElement) {
          arrow.classList.remove("slider-hint-arrow--active");
        }
      });
      sliderHintTimer = null;
    }, 1300);
  }

  /**
   * @param {number} historyIndex
   */
  function retryFromHistoryIndex(historyIndex) {
    const sessions = selectTopSessionsByScore(loadSessions(), 10);
    const session = sessions[historyIndex];
    if (!session || !session.runMeta || typeof session.runMeta.seed !== "string") return;
    const challenge = session.runMeta.challenge ?? null;
    startNewRun({
      seed: session.runMeta.seed,
      challenge,
      retryOfRunId: typeof session.runMeta.runId === "string" ? session.runMeta.runId : null,
    });
  }

  /**
   * @param {number} historyIndex
   */
  function openShareFromHistoryIndex(historyIndex) {
    const sessions = selectTopSessionsByScore(loadSessions(), 10);
    const session = sessions[historyIndex];
    if (!session || !session.runMeta || typeof session.runMeta.seed !== "string") return;
    state.lastResult = {
      aggregatePct: session.aggregatePct,
      rounds: session.rounds,
      runMeta: session.runMeta,
    };
    state.challengeShare = {
      username: preferredShareUsername(),
      url: null,
      qrDataUrl: null,
      error: null,
      submitted: false,
    };
    state.screen = "challenge-share";
    render("forward");
  }

  async function generateChallengeLink() {
    if (
      !state.lastResult ||
      !state.lastResult.runMeta ||
      typeof state.lastResult.runMeta.seed !== "string"
    ) {
      return;
    }
    const input = root.querySelector("#challenge-username");
    const rawName = input instanceof HTMLInputElement ? input.value : state.challengeShare.username;
    const { authorName } = updateChallengeShareUsername(state, rawName);
    if (!authorName) {
      state.challengeShare.error = "Enter a username to share this challenge.";
      state.challengeShare.url = null;
      state.challengeShare.qrDataUrl = null;
      state.challengeShare.submitted = false;
      render("none");
      return;
    }
    state.challengeShare.submitted = true;
    state.challengeShare.error = null;
    render("none");
    const payload = createChallengePayload({
      seed: state.lastResult.runMeta.seed,
      authorName,
      authorScore: state.lastResult.aggregatePct,
      challengerRounds: state.lastResult.rounds.map((round) => ({
        userHsv: round.userHsv,
        roundScore: round.roundScore,
      })),
    });
    const url = buildChallengeUrl(
      { origin: window.location.origin, pathname: window.location.pathname },
      payload,
    );
    try {
      const qrDataUrl = await QRCode.toDataURL(url, { width: 220, margin: 1 });
      state.challengeShare.url = url;
      state.challengeShare.qrDataUrl = qrDataUrl;
      state.challengeShare.error = null;
      savePrefs({ challengeShareUsername: authorName });
    } catch {
      state.challengeShare.url = url;
      state.challengeShare.qrDataUrl = null;
      state.challengeShare.error = "Couldn't generate QR code.";
    }
    render("none");
  }

  async function copyChallengeLink() {
    if (!state.challengeShare.url) return;
    try {
      await navigator.clipboard.writeText(state.challengeShare.url);
    } catch {
      state.challengeShare.error =
        "Couldn't copy link. You can copy it from the browser address bar.";
      render("none");
    }
  }

  /**
   * Toggle a history row in place so CSS transitions can animate.
   * @param {HTMLElement} rowButton
   * @param {number} index
   */
  function toggleHistoryRowInPlace(focusEl, index) {
    const allItems = root.querySelectorAll(".history-item");
    allItems.forEach((itemEl, itemIndex) => {
      if (!(itemEl instanceof HTMLElement)) return;
      const rowEl = itemEl.querySelector(".history-row");
      const detailWrapEl = itemEl.querySelector(".history-detail-wrap");
      const isTarget = itemIndex === index;
      const shouldExpand = isTarget && state.expandedHistoryIndex !== index;
      itemEl.classList.toggle("history-item--expanded", shouldExpand);
      if (rowEl instanceof HTMLElement) {
        rowEl.setAttribute("aria-expanded", shouldExpand ? "true" : "false");
      }
      if (detailWrapEl instanceof HTMLElement) {
        detailWrapEl.setAttribute("aria-hidden", shouldExpand ? "false" : "true");
      }
    });
    state.expandedHistoryIndex = state.expandedHistoryIndex === index ? null : index;
    // Keep focus on clicked control for keyboard users after DOM class updates.
    focusEl.focus();
  }

  /** @param {Event} e */
  function onActionClick(e) {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const actionEl = t.closest("[data-action]");
    if (!(actionEl instanceof HTMLElement)) return;
    const action = actionEl.dataset.action;
    if (!action) return;

    if (action === "play") {
      if (state.pendingLaunch) {
        const pending = state.pendingLaunch;
        state.pendingLaunch = null;
        startNewRun({
          seed: pending.seed,
          challenge: pending.challenge,
          retryOfRunId: pending.retryOfRunId,
        });
      } else {
        startNewRun();
      }
      return;
    }
    if (action === "play-new") {
      state.pendingLaunch = null;
      startNewRun({ forceRandom: true });
      return;
    }
    if (action === "history") {
      state.expandedHistoryIndex = null;
      state.screen = "history";
      render("forward");
      return;
    }
    if (action === "home") {
      state.screen = "home";
      render("back");
      return;
    }
    if (action === "results") {
      state.screen = "results";
      render("back");
      return;
    }
    if (action === "again") {
      startNewRun({ forceRandom: true });
      return;
    }
    if (action === "share") {
      if (!state.challengeShare.username) {
        state.challengeShare.username = preferredShareUsername();
      }
      state.challengeShare.error = null;
      state.screen = "challenge-share";
      render("forward");
      return;
    }
    if (action === "challenge-generate") {
      void generateChallengeLink();
      return;
    }
    if (action === "challenge-copy") {
      void copyChallengeLink();
      return;
    }
    if (action === "history-toggle") {
      const indexStr = actionEl.dataset.historyIndex;
      const index = Number(indexStr);
      if (!Number.isInteger(index)) return;
      const itemEl = actionEl.closest(".history-item");
      const rowButton = itemEl instanceof HTMLElement ? itemEl.querySelector(".history-row") : null;
      toggleHistoryRowInPlace(rowButton instanceof HTMLElement ? rowButton : actionEl, index);
      return;
    }
    if (action === "history-retry") {
      const indexStr = actionEl.dataset.historyIndex;
      const index = Number(indexStr);
      if (!Number.isInteger(index)) return;
      retryFromHistoryIndex(index);
      return;
    }
    if (action === "history-share") {
      const indexStr = actionEl.dataset.historyIndex;
      const index = Number(indexStr);
      if (!Number.isInteger(index)) return;
      openShareFromHistoryIndex(index);
      return;
    }
    if (action === "commit") {
      if (state.run && !state.run.hasInteractedThisRound) {
        flashSliderHint();
        return;
      }
      onCommitRound();
      return;
    }
    if (action === "quit") {
      quitRun();
      return;
    }
    if (action === "dismiss-hint") {
      savePrefs({ hintDismissed: true });
      render("forward");
      return;
    }
    if (action === "storage-dismiss") {
      state.storageError = null;
      state.pendingSession = null;
      render("forward");
      return;
    }
    if (action === "storage-retry" && state.pendingSession) {
      const p = state.pendingSession;
      const append = appendSession({
        endedAt: p.endedAt,
        aggregatePct: p.aggregatePct,
        rounds: p.rounds,
        runMeta: p.runMeta,
      });
      if (append.ok) {
        state.storageError = null;
        state.pendingSession = null;
      } else {
        state.storageError = append.error ?? "save";
      }
      render("forward");
    }
  }

  return {
    bindScreenHandlers,
  };
}
