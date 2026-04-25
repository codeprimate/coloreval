import { hsvToCssColor } from "./color.js";
import {
  ROUNDS_PER_RUN,
  createRun,
  commitCurrentRound,
  buildFinishedSession,
  hydrateRunFromDraft,
  runToDraftSnapshot,
  currentRoundIndex,
  currentTargetHsv,
} from "./run.js";
import {
  appendSession,
  clearDraft,
  loadDraftRaw,
  loadPrefs,
  loadSessions,
  saveDraft,
  savePrefs,
} from "./storage.js";
import {
  transitionScreen,
  wireButtonAnimations,
  animateRoundAdvance,
  animateQuitShake,
  triggerResultAnimation,
} from "./animations.js";

/** @typedef {'home' | 'play' | 'results' | 'history'} Screen */
/** @typedef {"forward"|"back"|"up"} TransitionDirection */

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
    /** @type {{ aggregatePct: number, rounds: object[] } | null} */
    lastResult: null,
    /** @type {string | null} */
    storageError: null,
    /** @type {{ endedAt: string, aggregatePct: number, rounds: object[] } | null} */
    pendingSession: null,
    /** @type {number | null} */
    expandedHistoryIndex: null,
  };

  let sliderHintTimer = null;
  let isRoundAdvance = false;

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
    animateQuitShake(() => {
      if (!confirm("Abandon this run? Progress will not be saved.")) return;
      clearDraft();
      state.run = null;
      state.screen = "home";
      render("back");
    });
  }

  function startNewRun() {
    clearDraft();
    state.run = createRun(ROUNDS_PER_RUN);
    const res = saveDraft(runToDraftSnapshot(state.run));
    if (!res.ok) {
      state.storageError = res.error ?? "save";
    }
    state.screen = "play";
    render("forward");
  }

  function finishRunToResults() {
    if (!state.run) return;
    const { aggregatePct, rounds } = buildFinishedSession(state.run);
    const endedAt = new Date().toISOString();
    const append = appendSession({ endedAt, aggregatePct, rounds });
    if (!append.ok) {
      state.storageError = append.error ?? "save";
      state.pendingSession = { endedAt, aggregatePct, rounds };
    } else {
      state.pendingSession = null;
    }
    clearDraft();
    state.lastResult = { aggregatePct, rounds };
    state.run = null;
    state.screen = "results";
    render("up");
  }

  function onCommitRound() {
    if (!state.run) return;
    const n = state.run.roundsPerRun;
    const idx = currentRoundIndex(state.run);
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

  function hsvToRangeValues(hsv) {
    return {
      hue: Math.round(((hsv.h % 360) + 360) % 360),
      sat: Math.round(hsv.s * 100),
      val: Math.round(hsv.v * 100),
    };
  }

  function parseSliders(form) {
    const fd = new FormData(form);
    return {
      h: Number(fd.get("hue")),
      s: Number(fd.get("saturation")) / 100,
      v: Number(fd.get("value")) / 100,
    };
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
    } else if (state.screen === "history") {
      body = renderHistory();
    } else {
      state.screen = "home";
      body = renderHome();
    }

    const shouldAnimateRoundAdvance = isRoundAdvance;
    isRoundAdvance = false;
    const banner = storageBannerHtml();

    if (shouldAnimateRoundAdvance) {
      root.innerHTML = banner + body;
      bindScreenHandlers();
      animateRoundAdvance();
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

  function storageBannerHtml() {
    if (!state.storageError && !state.pendingSession) return "";
    const showRetry = Boolean(state.pendingSession);
    return `
      <div class="storage-banner" role="alert">
        <p class="storage-banner__text">Can't save scores</p>
        <div class="storage-banner__actions">
          ${
            showRetry
              ? `<button type="button" class="btn btn--small" data-action="storage-retry">Retry</button>`
              : ""
          }
          <button type="button" class="link btn--small" data-action="storage-dismiss">Continue without saving</button>
        </div>
      </div>
    `;
  }

  function renderHome() {
    const prefs = loadPrefs();
    const hint = !prefs.hintDismissed
      ? `<p class="hint">Match the target color by adjusting the HSV sliders.</p>
         <button type="button" class="hint-dismiss" data-action="dismiss-hint">Dismiss</button>`
      : "";

    return `
      <div class="shell shell--home">
        <main class="main">
          <div class="home-hero">
            <div class="wordmark">
              <h1 class="title">coloreval</h1>
              ${hint}
            </div>
            <div class="home-icon-wrap">
              <img
                class="home-icon"
                src="./android-chrome-192x192.png"
                alt=""
                width="192"
                height="192"
                decoding="async"
              />
            </div>
          </div>
          <div class="stack stack--actions">
            <button type="button" class="btn btn--primary" data-action="play">Play</button>
            <button type="button" class="btn btn--outline" data-action="history">History</button>
          </div>
        </main>
      </div>
    `;
  }

  function renderPlay() {
    const run = state.run;
    const idx = currentRoundIndex(run);
    const target = currentTargetHsv(run);
    if (idx === null || !target) {
      state.screen = "home";
      return renderHome();
    }
    const displayRound = idx + 1;
    const n = run.roundsPerRun;
    const isLast = idx === n - 1;
    const label = isLast ? "Finish" : "Next";
    const isCommitDisabled = !run.hasInteractedThisRound;
    const { hue, sat, val } = hsvToRangeValues(run.userHsv);
    const targetCss = hsvToCssColor(target);
    const yoursCss = hsvToCssColor(run.userHsv);

    return `
      <div class="shell shell--play">
        <div class="topbar">
          <div class="topbar__left">
            <button type="button" class="btn--back btn--back-icon" data-action="quit" aria-label="Quit run">
              <span aria-hidden="true">←</span>
              <img src="./favicon-32x32.png" alt="" width="18" height="18" decoding="async" />
              <span class="visually-hidden">Quit</span>
            </button>
          </div>
          <div class="topbar__center" aria-live="polite">
            <span class="tabular">${displayRound}</span><span class="progress-muted"> / ${n}</span>
          </div>
          <div class="topbar__right"></div>
        </div>
        <main class="main main--play">
          <div class="swatch-row">
            <div class="swatch-block">
              <div class="swatch" style="background-color: ${targetCss}" role="img" aria-label="Target color"></div>
              <span class="swatch-label">Target</span>
            </div>
            <div class="swatch-block">
              <div id="yours-swatch" class="swatch" style="background-color: ${yoursCss}" role="img" aria-label="Your color"></div>
              <span class="swatch-label">Yours</span>
            </div>
          </div>
          <form class="sliders" id="play-form" novalidate>
            <div class="field">
              <span class="slider-hint-arrow" data-role="slider-hint-arrow" aria-hidden="true">➜</span>
              <div class="field__control">
                <label for="hue">Hue</label>
                <input id="hue" name="hue" type="range" min="0" max="359" value="${hue}" />
              </div>
            </div>
            <div class="field">
              <span class="slider-hint-arrow" data-role="slider-hint-arrow" aria-hidden="true">➜</span>
              <div class="field__control">
                <label for="saturation">Saturation</label>
                <input id="saturation" name="saturation" type="range" min="0" max="100" value="${sat}" />
              </div>
            </div>
            <div class="field">
              <span class="slider-hint-arrow" data-role="slider-hint-arrow" aria-hidden="true">➜</span>
              <div class="field__control">
                <label for="value">Value</label>
                <input id="value" name="value" type="range" min="0" max="100" value="${val}" />
              </div>
            </div>
            <span class="visually-hidden" aria-live="polite">Adjust a slider to continue</span>
          </form>
          <div class="stack stack--actions">
            <button type="button" class="btn btn--primary" data-action="commit" ${isCommitDisabled ? "disabled" : ""}>${label}</button>
          </div>
        </main>
      </div>
    `;
  }

  function renderResults() {
    const { aggregatePct, rounds } = state.lastResult;
    const dots = rounds
      .map(
        (r, i) =>
          `<span class="round-dot" style="--dot-score: ${rounds[i].roundScore}; --i: ${i}" title="Round ${i + 1}: ${rounds[i].roundScore}%"></span>`,
      )
      .join("");
    const roundRows = rounds
      .map((round, roundIndex) => {
        const targetCss = hsvToCssColor(round.targetHsv);
        const userCss = hsvToCssColor(round.userHsv);
        return `
          <li class="history-round-row">
            <span class="history-round-index tabular">R${roundIndex + 1}</span>
            <span class="history-round-swatch" style="background-color: ${targetCss}" aria-label="Round ${roundIndex + 1} target color"></span>
            <span class="history-round-score tabular">${round.roundScore}%</span>
            <span class="history-round-swatch" style="background-color: ${userCss}" aria-label="Round ${roundIndex + 1} your color"></span>
          </li>
        `;
      })
      .join("");

    return `
      <div class="shell shell--results">
        <main class="main main--results">
          <p class="score-line">
            <span class="score tabular">${aggregatePct}</span><span class="score-suffix">% match</span>
          </p>
          <div class="round-strip" aria-hidden="true">${dots}</div>
          <div class="history-detail" style="width:100%">
            <div class="history-round-columns" aria-hidden="true">
              <span></span>
              <span class="history-round-column-label">Target</span>
              <span></span>
              <span class="history-round-column-label">Yours</span>
            </div>
            <ul class="history-round-list">${roundRows}</ul>
          </div>
          <div class="stack stack--actions" style="width:100%">
            <button type="button" class="btn btn--primary" data-action="again">Play again</button>
            <button type="button" class="btn btn--outline" data-action="home">Home</button>
          </div>
        </main>
      </div>
    `;
  }

  function renderHistory() {
    const sessions = loadSessions().slice().reverse();
    if (sessions.length === 0) {
      return `
        <div class="shell shell--history">
          <div class="topbar">
            <div class="topbar__left">
              <button type="button" class="btn--back" data-action="home">← Back</button>
            </div>
            <div class="topbar__center">History</div>
            <div class="topbar__right"></div>
          </div>
          <main class="main">
            <p class="muted">No runs yet.</p>
            <button type="button" class="btn btn--primary" data-action="play">Play your first game</button>
          </main>
        </div>
      `;
    }
    const rows = sessions
      .map((s, historyIndex) => {
        const d = new Date(s.endedAt);
        const dateStr = d.toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        const isExpanded = state.expandedHistoryIndex === historyIndex;
        const roundRows = s.rounds
          .map((round, roundIndex) => {
            const targetCss = hsvToCssColor(round.targetHsv);
            const userCss = hsvToCssColor(round.userHsv);
            return `
              <li class="history-round-row">
                <span class="history-round-index tabular">R${roundIndex + 1}</span>
                <span class="history-round-swatch" style="background-color: ${targetCss}" aria-label="Round ${roundIndex + 1} target color"></span>
                <span class="history-round-score tabular">${round.roundScore}%</span>
                <span class="history-round-swatch" style="background-color: ${userCss}" aria-label="Round ${roundIndex + 1} your color"></span>
              </li>
            `;
          })
          .join("");
        return `
          <li class="history-item ${isExpanded ? "history-item--expanded" : ""}">
            <button
              type="button"
              class="history-row"
              data-action="history-toggle"
              data-history-index="${historyIndex}"
              aria-expanded="${isExpanded ? "true" : "false"}"
            >
              <span class="history-date">${escapeHtml(dateStr)}</span>
              <span class="tabular history-pct">${s.aggregatePct}%</span>
            </button>
            ${
              isExpanded
                ? `<div class="history-detail">
                    <div class="history-round-columns" aria-hidden="true">
                      <span></span>
                      <span class="history-round-column-label">Target</span>
                      <span></span>
                      <span class="history-round-column-label">Yours</span>
                    </div>
                    <ul class="history-round-list">${roundRows}</ul>
                  </div>`
                : ""
            }
          </li>
        `;
      })
      .join("");

    return `
      <div class="shell shell--history">
        <div class="topbar">
          <div class="topbar__left">
            <button type="button" class="btn--back" data-action="home">← Back</button>
          </div>
          <div class="topbar__center">History</div>
          <div class="topbar__right"></div>
        </div>
        <main class="main">
          <ul class="history-list">${rows}</ul>
        </main>
      </div>
    `;
  }

  function escapeHtml(s) {
    return s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
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

  /** @param {Event} e */
  function onActionClick(e) {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const actionEl = t.closest("[data-action]");
    if (!(actionEl instanceof HTMLElement)) return;
    const action = actionEl.dataset.action;
    if (!action) return;

    if (action === "play") {
      startNewRun();
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
    if (action === "again") {
      startNewRun();
      return;
    }
    if (action === "history-toggle") {
      const indexStr = actionEl.dataset.historyIndex;
      const index = Number(indexStr);
      if (!Number.isInteger(index)) return;
      state.expandedHistoryIndex = state.expandedHistoryIndex === index ? null : index;
      render("forward");
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

  if (tryBootstrapResume()) {
    bindGlobalPersist();
    render();
    return;
  }

  state.screen = "home";
  bindGlobalPersist();
  render();
}
