import { hsvToCssColor } from "../color.js";
import {
  CHALLENGE_AUTHOR_NAME_MAX_LEN,
  currentRoundIndex,
  currentTargetHsv,
  parseRunLaunchContext,
} from "../run.js";
import { loadPrefs, loadSessions } from "../storage.js";
import { selectTopSessionsByScore } from "../history.js";
import { escapeHtml, hsvToRangeValues } from "./utils.js";

/**
 * @param {{ state: object }} deps
 */
export function createRenderers({ state }) {
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
    const urlLaunch = parseRunLaunchContext({
      search: window.location.search,
      hash: window.location.hash,
    });
    const launch = state.pendingLaunch ?? urlLaunch;
    const hasChallengeLaunch = Boolean(
      (state.pendingLaunch && state.pendingLaunch.challenge) || urlLaunch.challenge,
    );
    const playLabel =
      launch.challenge && typeof launch.challenge.authorName === "string"
        ? `Play vs. ${escapeHtml(launch.challenge.authorName)}`
        : "Play";
    const playNewButton = hasChallengeLaunch
      ? `<button type="button" class="btn btn--outline" data-action="play-new">Play new</button>`
      : "";
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
            ${playNewButton}
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
    const challengerTotalPct =
      challengeMeta && typeof challengeMeta.authorScore === "number"
        ? challengeMeta.authorScore
        : null;
    const challengerRounds = Array.isArray(challengeMeta?.challengerRounds)
      ? challengeMeta.challengerRounds
      : null;
    const showChallengerColumn =
      Boolean(challengerName) &&
      Array.isArray(challengerRounds) &&
      challengerRounds.length === rounds.length;
    const showWinnerWreaths =
      showChallengerColumn &&
      typeof challengerTotalPct === "number" &&
      aggregatePct > challengerTotalPct;
    const winnerColumn =
      showChallengerColumn && typeof challengerTotalPct === "number"
        ? aggregatePct > challengerTotalPct
          ? "yours"
          : challengerTotalPct > aggregatePct
            ? "challenger"
            : null
        : null;
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
            <span class="history-round-swatch" style="background-color: ${targetCss}" aria-label="Round ${roundIndex + 1} target color"></span>
            <span class="history-round-score tabular">${round.roundScore}%</span>
            <span class="history-round-swatch${yourWinnerClass}" style="background-color: ${userCss}" aria-label="Round ${roundIndex + 1} your color"></span>
            ${challengerCell}
          </li>
        `;
      })
      .join("");
    const challengeTotalsRow =
      showChallengerColumn && typeof challengerTotalPct === "number"
        ? `
            <div class="history-round-totals history-round-totals--challenge" aria-label="Challenge totals">
              <span></span>
              <span></span>
              <span class="history-round-total-pct tabular">${aggregatePct}%</span>
              <span></span>
              <span class="history-round-total-pct tabular">${challengerTotalPct}%</span>
            </div>
          `
        : "";

    return `
      <div class="shell shell--results">
        <main class="main main--results">
          <p class="score-line">
            ${showWinnerWreaths ? '<span class="score-wreath" aria-hidden="true">🏆</span>' : ""}
            <span class="score tabular">${aggregatePct}</span>
            <span class="score-meta">
              <span class="score-brand title">coloreval</span>
              <span class="score-suffix">% match</span>
            </span>
            ${showWinnerWreaths ? '<span class="score-wreath" aria-hidden="true">🏆</span>' : ""}
          </p>
          <div class="round-strip" aria-hidden="true">${dots}</div>
          <div class="history-detail" style="width:100%">
            ${
              showChallengerColumn
                ? `<div class="history-round-awards history-round-awards--challenge" aria-hidden="true">
                     <span></span>
                     <span></span>
                     <span class="history-round-award">${winnerColumn === "yours" ? "🏆" : ""}</span>
                     <span></span>
                     <span class="history-round-award">${winnerColumn === "challenger" ? "🏆" : ""}</span>
                   </div>`
                : ""
            }
            <div class="history-round-columns ${showChallengerColumn ? "history-round-columns--challenge" : ""}" aria-hidden="true">
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
            ${challengeTotalsRow}
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
    const hasShareUrl = Boolean(state.challengeShare.url);
    const isSubmitted = Boolean(state.challengeShare.submitted || hasShareUrl);
    const smsHref = state.challengeShare.url
      ? `sms:?&body=${encodeURIComponent(`Try my coloreval challenge: ${state.challengeShare.url}`)}`
      : "";
    const urlPreview = state.challengeShare.url
      ? `
      <div class="challenge-link-row">
        <a class="challenge-link-title" href="${state.challengeShare.url}" target="_blank" rel="noopener noreferrer">coloreval Challenge</a>
        <a class="btn--icon challenge-copy-btn challenge-sms-link" href="${smsHref}" aria-label="Share challenge via text message">📱</a>
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

    const usernameSection = isSubmitted
      ? `<p class="challenge-name-title" aria-label="Challenge username"><span class="challenge-name-title__username">${username}</span> has created a challenge</p>`
      : `
          <label class="challenge-name-field" for="challenge-username">
            Name
            <input
              id="challenge-username"
              class="challenge-name-input"
              type="text"
              maxlength="${CHALLENGE_AUTHOR_NAME_MAX_LEN}"
              value="${username}"
              placeholder="Your name"
            />
          </label>
        `;
    const shareAction = isSubmitted
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
          ${usernameSection}
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
        const canShare = !challengeMeta;
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
          challengerRounds.length === s.rounds.length;
        const challengerTotalPct =
          challengeMeta && typeof challengeMeta.authorScore === "number"
            ? challengeMeta.authorScore
            : null;
        const challengeBadgeIcon =
          typeof challengerTotalPct === "number" && s.aggregatePct > challengerTotalPct
            ? "🏆"
            : "🥊";
        const roundRows = s.rounds
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
                <span class="history-round-swatch" style="background-color: ${targetCss}" aria-label="Round ${roundIndex + 1} target color"></span>
                <span class="history-round-score tabular">${round.roundScore}%</span>
                <span class="history-round-swatch${yourWinnerClass}" style="background-color: ${userCss}" aria-label="Round ${roundIndex + 1} your color"></span>
                ${challengerCell}
              </li>
            `;
          })
          .join("");
        const challengeTotalsRow =
          showChallengerColumn && typeof challengerTotalPct === "number"
            ? `
                <div class="history-round-totals history-round-totals--challenge" aria-label="Challenge totals">
                  <span></span>
                  <span></span>
                  <span class="history-round-total-pct tabular">${s.aggregatePct}%</span>
                  <span></span>
                  <span class="history-round-total-pct tabular">${challengerTotalPct}%</span>
                </div>
              `
            : "";
        return `
          <li
            class="history-item ${isExpanded ? "history-item--expanded" : ""}"
            data-action="history-toggle"
            data-history-index="${historyIndex}"
          >
            <button
              type="button"
              class="history-row"
              aria-expanded="${isExpanded ? "true" : "false"}"
            >
              <span class="history-date">${escapeHtml(dateStr)}</span>
            </button>
            <div class="history-row-actions">
              ${
                canShare
                  ? `<button type="button" class="btn--icon history-share-btn" data-action="history-share" data-history-index="${historyIndex}" aria-label="Share this challenge" title="Share this challenge">🥊</button>`
                  : ""
              }
              ${
                canRetry
                  ? `<button type="button" class="btn--icon history-retry-btn" data-action="history-retry" data-history-index="${historyIndex}" aria-label="Retry this run" title="Retry">↻</button>`
                  : ""
              }
              <span class="tabular history-pct">${s.aggregatePct}%</span>
            </div>
            ${
              challengeMeta
                ? `<p class="history-challenge-note">${challengeBadgeIcon} <span class="history-challenge-note-vs">vs.</span> ${escapeHtml(challengeMeta.authorName)}</p>`
                : ""
            }
            <div class="history-detail-wrap" aria-hidden="${isExpanded ? "false" : "true"}">
              <div class="history-detail">
                <div class="history-round-columns ${showChallengerColumn ? "history-round-columns--challenge" : ""}" aria-hidden="true">
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
                ${challengeTotalsRow}
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

  return {
    storageBannerHtml,
    renderHome,
    renderPlay,
    renderResults,
    renderChallengeShare,
    renderHistory,
  };
}
