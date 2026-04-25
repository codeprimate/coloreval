import { animate, stagger } from "motion";
import confetti from "canvas-confetti";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ─── Screen transitions ─────────────────────────────────── */

/**
 * Animate the current shell out, run the swap, animate the new shell in.
 * @param {() => void} swap - callback that performs the innerHTML replacement
 * @param {"forward"|"back"|"up"} [direction]
 * @returns {Promise<void>}
 */
export async function transitionScreen(swap, direction = "forward") {
  if (reducedMotion()) {
    swap();
    return;
  }

  const app = document.getElementById("app");
  const current = app?.querySelector(".shell");

  if (current) {
    const yExit = direction === "back" ? 10 : -10;
    await animate(
      current,
      { opacity: [1, 0], y: [0, yExit] },
      { duration: 0.15, easing: "ease-in" },
    );
  }

  swap();

  const next = app?.querySelector(".shell");
  if (next) {
    const yEnter = direction === "up" ? 20 : direction === "back" ? -10 : 10;
    const dur = direction === "up" ? 0.35 : 0.22;
    animate(
      next,
      { opacity: [0, 1], y: [yEnter, 0] },
      { duration: dur, easing: [0.22, 1, 0.36, 1] },
    );
  }
}

/* ─── Button press ripple ────────────────────────────────── */

/**
 * Wire up scale-press animation to all .btn--primary and .btn--outline
 * elements inside a given root. Safe to call multiple times (uses WeakSet).
 * @param {Element} root
 */
const _wiredButtons = new WeakSet();

export function wireButtonAnimations(root) {
  if (reducedMotion()) return;
  root.querySelectorAll(".btn--primary, .btn--outline").forEach((btn) => {
    if (_wiredButtons.has(btn)) return;
    _wiredButtons.add(btn);
    btn.addEventListener("pointerdown", () => {
      animate(btn, { scale: 0.96 }, { duration: 0.08, easing: "ease-in" });
    });
    const release = () => {
      animate(btn, { scale: 1 }, { duration: 0.2, easing: [0.22, 1, 0.36, 1] });
    };
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("pointerleave", release);
  });
}

/* ─── Round advance ──────────────────────────────────────── */

/**
 * Gentle fade-in of the two swatches only — no sliding, no full-screen flash.
 */
export function animateRoundAdvance() {
  if (reducedMotion()) return;
  const shell = document.querySelector(".shell--play");
  if (!shell) return;

  const target = shell.querySelector(".swatch-block:first-child .swatch");
  const yours = shell.querySelector("#yours-swatch");

  if (target) {
    animate(target, { opacity: [0, 1] }, { duration: 0.25, easing: "ease-out" });
  }
  if (yours) {
    animate(
      yours,
      { opacity: [0, 1], scale: [0.97, 1] },
      { duration: 0.2, easing: [0.22, 1, 0.36, 1] },
    );
  }
}

/* ─── Quit shake ─────────────────────────────────────────── */

/**
 * Shake the play shell, then call onDone (which shows the confirm dialog).
 * @param {() => void} onDone
 */
export function animateQuitShake(onDone) {
  if (reducedMotion()) {
    onDone();
    return;
  }
  const btn = document.querySelector(".btn--back");
  if (!btn) {
    onDone();
    return;
  }
  animate(btn, { x: [0, -8, 8, -5, 5, -3, 3, 0] }, { duration: 0.32, easing: "ease-in-out" }).then(
    onDone,
  );
}

/* ─── Results animations ─────────────────────────────────── */

/**
 * Count the score element up from 0 to target.
 * @param {Element} el
 * @param {number} target
 */
function animateScoreCountUp(el, target) {
  if (reducedMotion()) {
    el.textContent = String(target);
    return;
  }
  const start = performance.now();
  const duration = 700;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    el.textContent = String(Math.round(easeOut(t) * target));
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/**
 * Animate round dots in with a stagger.
 */
function animateDots() {
  if (reducedMotion()) {
    document.querySelectorAll(".round-dot").forEach((d) => {
      d.style.opacity = "1";
    });
    return;
  }
  const dots = document.querySelectorAll(".round-dot");
  if (dots.length === 0) return;
  animate(
    dots,
    { opacity: [0, 1], scaleX: [0.4, 1] },
    {
      duration: 0.3,
      delay: stagger(0.07),
      easing: [0.22, 1, 0.36, 1],
    },
  );
}

/** Confetti burst for high scores (≥ 90). */
function fireConfetti() {
  if (reducedMotion()) return;

  const shared = {
    particleCount: 100,
    spread: 70,
    colors: ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#ff922b", "#cc5de8"],
  };

  confetti({ ...shared, origin: { x: 0.3, y: 0.55 }, angle: 75 });
  setTimeout(() => {
    confetti({ ...shared, origin: { x: 0.7, y: 0.55 }, angle: 105 });
  }, 120);
}

/** Sad droop animation for low scores (≤ 50). */
function animateDroop() {
  if (reducedMotion()) return;
  const scoreLine = document.querySelector(".score-line");
  if (!scoreLine) return;

  animate(scoreLine, { y: [0, 14, 0] }, { duration: 0.9, easing: [0.36, 0, 0.66, -0.3] }).then(
    () => {
      animate(
        scoreLine,
        { opacity: [1, 0.5, 1] },
        { duration: 0.8, repeat: 1, easing: "ease-in-out" },
      );
    },
  );
}

/**
 * Trigger the appropriate result animation based on score.
 * @param {number} pct  0–100
 */
export function triggerResultAnimation(pct) {
  const scoreEl = document.querySelector(".score");
  if (scoreEl) {
    setTimeout(() => animateScoreCountUp(scoreEl, pct), 200);
  }

  animateDots();

  if (pct >= 90) {
    setTimeout(fireConfetti, 400);
  } else if (pct <= 50) {
    setTimeout(animateDroop, 350);
  }
}
