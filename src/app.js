import { hsvToCssColor } from "./color.js";
import QRCode from "qrcode";
import {
  ROUNDS_PER_RUN,
  CHALLENGE_AUTHOR_NAME_MAX_LEN,
  createRun,
  createSeededRng,
  commitCurrentRound,
  buildFinishedSession,
  generateRunSeed,
  createChallengePayload,
  sanitizeChallengeAuthorName,
  buildChallengeUrl,
  parseRunLaunchContext,
  stripChallengeParamFromSearch,
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
import { selectTopSessionsByScore } from "./history.js";
import {
  transitionScreen,
  wireButtonAnimations,
  animateRoundAdvance,
  animateQuitShake,
  triggerResultAnimation,
} from "./animations.js";

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
    /** @type {{ username: string, url: string | null, qrDataUrl: string | null, error: string | null }} */
    challengeShare: { username: "", url: null, qrDataUrl: null, error: null },
    /** @type {string | null} */
    storageError: null,
    /** @type {{ endedAt: string, aggregatePct: number, rounds: object[], runMeta?: object } | null} */
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
      if (!confirm("Restart?")) return;
      clearDraft();
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
    } else if (state.screen === "challenge-share" && state.lastResult) {
      body = renderChallengeShare();
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
    const launch = parseRunLaunchContext({
      search: window.location.search,
      hash: window.location.hash,
    });
    const playLabel =
      launch.challenge && typeof launch.challenge.authorName === "string"
        ? `Play vs. ${escapeHtml(launch.challenge.authorName)}`
        : "Play";
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
            <button type="button" class="btn btn--primary" data-action="play">${playLabel}</button>
            <button type="button" class="btn btn--outline" data-action="history">Top 10</button>
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
    const challengeBanner =
      run.challenge && typeof run.challenge.authorName === "string"
        ? `<p class="challenge-banner">challenge vs. ${escapeHtml(run.challenge.authorName)}</p>`
        : "";

    return `
      <div class="shell shell--play">
        <div class="topbar">
          <div class="topbar__left">
            <button type="button" class="btn--back btn--back-icon" data-action="quit" aria-label="Quit run">
              <span aria-hidden="true">←</span>
              <span class="visually-hidden">Quit</span>
            </button>
          </div>
          <div class="topbar__center" aria-live="polite">
            <span class="tabular">${displayRound}</span><span class="progress-muted"> / ${n}</span>
          </div>
          <div class="topbar__right title">coloreval</div>
        </div>
        <main class="main main--play">
          ${challengeBanner}
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
    const challengeMeta = state.lastResult.runMeta?.challenge ?? null;
    const challengerName =
      challengeMeta && typeof challengeMeta.authorName === "string"
        ? challengeMeta.authorName
        : null;
    const challengerRounds = Array.isArray(challengeMeta?.challengerRounds)
      ? challengeMeta.challengerRounds
      : null;
    const showChallengerColumn =
      Boolean(challengerName) &&
      Array.isArray(challengerRounds) &&
      challengerRounds.length === rounds.length;
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
        const challengerRound = showChallengerColumn ? challengerRounds[roundIndex] : null;
        const yourWinnerClass =
          challengerRound && round.roundScore > challengerRound.roundScore
            ? " history-round-swatch--winner"
            : "";
        const challengerLoserClass =
          challengerRound && challengerRound.roundScore > round.roundScore
            ? " history-round-swatch--loser"
            : "";
        const challengerCell = showChallengerColumn
          ? `
            <span class="history-round-score tabular">${challengerRound.roundScore}%</span>
            <span class="history-round-swatch${challengerLoserClass}" style="background-color: ${hsvToCssColor(challengerRound.userHsv)}" aria-label="Round ${roundIndex + 1} challenger color"></span>
          `
          : "";
        return `
          <li class="history-round-row ${showChallengerColumn ? "history-round-row--challenge" : ""}">
            <span class="history-round-index tabular">R${roundIndex + 1}</span>
            <span class="history-round-swatch" style="background-color: ${targetCss}" aria-label="Round ${roundIndex + 1} target color"></span>
            <span class="history-round-score tabular">${round.roundScore}%</span>
            <span class="history-round-swatch${yourWinnerClass}" style="background-color: ${userCss}" aria-label="Round ${roundIndex + 1} your color"></span>
            ${challengerCell}
          </li>
        `;
      })
      .join("");

    return `
      <div class="shell shell--results">
        <main class="main main--results">
          <p class="score-line">
            <span class="score tabular">${aggregatePct}</span>
            <span class="score-meta">
              <span class="score-brand title">coloreval</span>
              <span class="score-suffix">% match</span>
            </span>
          </p>
          <div class="round-strip" aria-hidden="true">${dots}</div>
          <div class="history-detail" style="width:100%">
            <div class="history-round-columns ${showChallengerColumn ? "history-round-columns--challenge" : ""}" aria-hidden="true">
              <span></span>
              <span class="history-round-column-label">Target</span>
              <span></span>
              <span class="history-round-column-label">Yours</span>
              ${
                showChallengerColumn
                  ? `<span></span><span class="history-round-column-label">${escapeHtml(challengerName)}</span>`
                  : ""
              }
            </div>
            <ul class="history-round-list">${roundRows}</ul>
          </div>
          <div class="stack stack--actions" style="width:100%">
            <button type="button" class="btn btn--primary" data-action="again">Play again</button>
            <button type="button" class="btn btn--outline" data-action="share">Share challenge</button>
            <button type="button" class="btn btn--outline" data-action="history">Top 10</button>
            <button type="button" class="btn btn--outline" data-action="home">Home</button>
          </div>
        </main>
      </div>
    `;
  }

  function renderChallengeShare() {
    if (!state.lastResult || !state.lastResult.runMeta || !state.lastResult.runMeta.seed) {
      state.screen = "results";
      return renderResults();
    }
    const { aggregatePct, rounds } = state.lastResult;
    const targets = rounds
      .map(
        (r, i) =>
          `<span class="challenge-target-swatch" style="background-color:${hsvToCssColor(r.targetHsv)}" aria-label="Target swatch ${i + 1}"></span>`,
      )
      .join("");
    const username = escapeHtml(state.challengeShare.username);
    const urlPreview = state.challengeShare.url
      ? `
      <div class="challenge-link-row">
        <a class="challenge-link-title" href="${state.challengeShare.url}" target="_blank" rel="noopener noreferrer">coloreval Challenge</a>
        <button type="button" class="btn--icon challenge-copy-btn" data-action="challenge-copy" aria-label="Copy challenge link">⧉</button>
      </div>
    `
      : "";
    const qrHtml = state.challengeShare.qrDataUrl
      ? `<div class="challenge-qr-wrap"><img class="challenge-qr-image" src="${state.challengeShare.qrDataUrl}" alt="QR code for challenge link" /></div>`
      : "";
    const err = state.challengeShare.error
      ? `<p class="muted challenge-share-error">${escapeHtml(state.challengeShare.error)}</p>`
      : "";

    const shareAction = state.challengeShare.url
      ? ""
      : `
          <div class="stack stack--actions" style="width:100%">
            <button type="button" class="btn btn--primary" data-action="challenge-generate">Share</button>
          </div>
        `;

    return `
      <div class="shell shell--results shell--challenge-share">
        <div class="topbar topbar--share">
          <div class="topbar__left">
            <button type="button" class="btn--back" data-action="results">← Back</button>
          </div>
          <div class="topbar__title">Share challenge</div>
          <div class="topbar__right-spacer" aria-hidden="true"></div>
        </div>
        <main class="main main--results">
          <p class="score-line">
            <span class="score tabular">${aggregatePct}</span>
            <span class="score-meta">
              <span class="score-brand title">coloreval</span>
              <span class="score-suffix">% match</span>
            </span>
          </p>
          <div class="challenge-target-strip" aria-label="Target swatches">${targets}</div>
          <label class="challenge-name-field" for="challenge-username">
            Username
            <input
              id="challenge-username"
              class="challenge-name-input"
              type="text"
              maxlength="${CHALLENGE_AUTHOR_NAME_MAX_LEN}"
              value="${username}"
              placeholder="Your name"
            />
          </label>
          ${err}
          ${shareAction}
          ${urlPreview}
          ${qrHtml}
        </main>
      </div>
    `;
  }

  function renderHistory() {
    const sessions = selectTopSessionsByScore(loadSessions(), 10);
    if (sessions.length === 0) {
      return `
        <div class="shell shell--history">
          <div class="topbar">
            <div class="topbar__left">
              <button type="button" class="btn--back" data-action="home">← Back</button>
            </div>
            <div class="topbar__center">Top 10</div>
            <div class="topbar__right title">coloreval</div>
          </div>
          <main class="main">
            <p class="muted">No Top 10 runs yet.</p>
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
        const canRetry = Boolean(s.runMeta && typeof s.runMeta.seed === "string");
        const challengeMeta = s.runMeta && s.runMeta.challenge ? s.runMeta.challenge : null;
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
            <div class="history-row-actions">
              <button type="button" class="btn--icon history-retry-btn" data-action="history-retry" data-history-index="${historyIndex}" ${canRetry ? "" : "disabled"} aria-label="Retry this run" title="${canRetry ? "Retry this run" : "Retry unavailable"}">↻</button>
            </div>
            ${
              challengeMeta
                ? `<p class="history-challenge-note">⚑ ${escapeHtml(challengeMeta.authorName)}</p>`
                : ""
            }
            <div class="history-detail-wrap" aria-hidden="${isExpanded ? "false" : "true"}">
              <div class="history-detail">
                <div class="history-round-columns" aria-hidden="true">
                  <span></span>
                  <span class="history-round-column-label">Target</span>
                  <span></span>
                  <span class="history-round-column-label">Yours</span>
                </div>
                <ul class="history-round-list">${roundRows}</ul>
              </div>
            </div>
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
          <div class="topbar__center">Top 10</div>
          <div class="topbar__right title">coloreval</div>
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
    const authorName = sanitizeChallengeAuthorName(rawName);
    state.challengeShare.username = authorName;
    if (!authorName) {
      state.challengeShare.error = "Enter a username to share this challenge.";
      state.challengeShare.url = null;
      state.challengeShare.qrDataUrl = null;
      render("none");
      return;
    }
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
  function toggleHistoryRowInPlace(rowButton, index) {
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
    rowButton.focus();
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
      toggleHistoryRowInPlace(actionEl, index);
      return;
    }
    if (action === "history-retry") {
      const indexStr = actionEl.dataset.historyIndex;
      const index = Number(indexStr);
      if (!Number.isInteger(index)) return;
      retryFromHistoryIndex(index);
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

  if (tryBootstrapResume()) {
    bindGlobalPersist();
    render();
    return;
  }

  state.screen = "home";
  bindGlobalPersist();
  render();
}
