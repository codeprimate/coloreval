# Manual browser integration test (Coloreval)

This document is a **full manual integration checklist** for the Coloreval SPA in a real browser. Use it for release QA, regression passes, or to brief an **LLM agent** executing a scripted walkthrough.

**How humans should use it:** work top to bottom for a smoke pass, or pick **story IDs** (e.g. US-4) when verifying a specific fix.

**How LLM agents should use it:**

1. Read **Prerequisites** and **Storage reset** first.
2. Execute stories **in numeric order** unless the user scopes a subset.
3. For each story, perform every **Step**, then confirm every **Pass criteria** before marking the story complete.
4. If a step cannot be performed (e.g. no DevTools access), record _blocked_ and the reason.

---

## Prerequisites

| Item        | Detail                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runtime** | Node per [`.nvmrc`](../.nvmrc); `nvm use` then `npm install` from repo root.                                                                                                                                                                                                                                                                                                                                                  |
| **App URL** | Prefer `npm run dev` (long-running) or `npm run build && npm run preview` (serves the static **`dist/`** output over HTTP). That matches real deployment (any static host). `file://` may fail in some browsers for ES modules; if you open files from disk, use a URL served from `dist/` (e.g. preview). Use a normal browser profile (not “always block third-party cookies” if your browser ties `localStorage` to that). |
| **Tools**   | Browser **DevTools** → **Application** (Chrome) or **Storage** (Firefox) → **Local Storage** for the origin you are testing.                                                                                                                                                                                                                                                                                                  |

---

## Storage reset (clean slate)

Before **US-1** or whenever you need a known state, clear site data for the app origin **or** delete these keys only:

| Key                     | Purpose                           |
| ----------------------- | --------------------------------- |
| `coloreval_sessions_v1` | Completed runs (history).         |
| `coloreval_draft_v1`    | In-progress run (resume on load). |
| `coloreval_prefs_v1`    | Hint dismissed, etc.              |

After deletion, **hard reload** the page (`Cmd+Shift+R` / `Ctrl+Shift+R`) so the app reads empty storage.

### Console helpers (humans and agents)

With the app **loaded** on the origin you are testing, open DevTools → **Console**:

| Call                           | Effect                                                       |
| ------------------------------ | ------------------------------------------------------------ |
| `colorevalDev.clearAll()`      | Removes sessions, draft, and prefs (full reset).             |
| `colorevalDev.clearSessions()` | History / completed runs only.                               |
| `colorevalDev.clearDraft()`    | In-progress run only (stops resume-on-load until a new run). |
| `colorevalDev.clearPrefs()`    | Preferences only (e.g. hint dismissed).                      |
| `colorevalDev.keys`            | Read-only map of `localStorage` key strings.                 |
| `colorevalDev.help()`          | Prints a short usage reminder.                               |

Each mutator returns a small result object (`ok`, keys touched, optional `error`). After **`clear*`**, **hard reload** so the UI matches empty storage (bootstrap may have already hydrated from the old draft).

Implementation: [`../src/console-helpers.js`](../src/console-helpers.js) (attached from [`../src/main.js`](../src/main.js)).

---

## Quick matrix (what each story proves)

| ID   | Area                                                      |
| ---- | --------------------------------------------------------- |
| US-1 | Home, hint, navigation chrome                             |
| US-2 | Full play loop, **Next** / **Finish**, Results, **Again** |
| US-3 | History list and empty state                              |
| US-4 | Draft persistence + **resume on reload** (no Home hop)    |
| US-5 | **Home** after run; **Play** starts a new run             |
| US-6 | Optional: storage failure banner (needs contrived setup)  |
| US-7 | Optional: keyboard / a11y smoke on Play                   |
| US-8 | **Quit** mid-run → Home, draft cleared                    |

---

## US-1 — First visit, Home, hint dismissal

**User story:** As a new visitor, I see Home with **Play** and **History**, I can read the one-line hint once and dismiss it so it does not return after reload.

**Steps**

1. Reset storage (see above). Open the app root URL.
2. Confirm the first screen is **Home** (title “Coloreval”, primary **Play**, secondary **History**).
3. Confirm optional copy: line _Match the target color._ and control **Dismiss hint** (if `coloreval_prefs_v1` was cleared).
4. Click **Dismiss hint**. Reload the page.
5. Confirm the hint block **does not** appear again (preference persisted).

**Pass criteria**

- [ ] Home shows **Play** and **History**.
- [ ] After dismiss + reload, hint is gone (or only **Play** / **History** without hint copy).

---

## US-2 — Complete run: Play → Results → Again

**User story:** As a player, I complete all rounds, see an aggregate **% match** on Results, use **Again** to start a new run in **Play**.

**Steps**

1. From Home, click **Play**.
2. Confirm you are on **Play**: labels **Target** and **Yours**, sliders **Hue**, **Saturation**, **Value**, progress `1 / 5` (or `1 / N` matching [`ROUNDS_PER_RUN`](../src/run.js)).
3. Move sliders so **Yours** visibly differs from **Target**; note colors.
4. Click **Next** (not **Finish** yet). Confirm progress advances (`2 / 5`), **Yours** resets to a **neutral gray** (new round), **Target** color changes.
5. Repeat until the header shows the last round (`5 / 5`). Confirm the primary button label is **Finish** (not **Next**).
6. Adjust sliders, click **Finish**.
7. Confirm **Results**: large numeric score + suffix **`% match`**, a row of small **round strip** markers (five), buttons **Again** (primary) and **Home** (secondary).
8. In DevTools → Application → Local Storage, confirm **`coloreval_draft_v1` is absent** (draft cleared on finish).
9. Confirm **`coloreval_sessions_v1`** exists and parses as JSON with a `sessions` array containing at least one object with `aggregatePct`, `endedAt`, and `rounds` length 5.
10. Click **Again**. Confirm you are on **Play** at `1 / 5` with new targets.

**Pass criteria**

- [ ] **Next** / **Finish** labels match round position (last round = **Finish**).
- [ ] After **Next**, user color resets to neutral gray; target updates.
- [ ] Results aggregate is an integer 0–100; strip shows one dot per round.
- [ ] Draft key removed after finish; session appended.
- [ ] **Again** starts a fresh run at round 1.

---

## US-3 — History: empty and populated

**User story:** As a player, I can open **History** from Home, see past runs with date and **%**, and use **Play** from empty history when applicable.

**Part A — Empty history**

1. Reset storage. Complete **US-1** step 1–2 only (stay on Home).
2. Click **History**.
3. Confirm copy **No runs yet** and primary **Play**.
4. Click **Home** (link) if shown, or navigate back if your build only offers **Play** from empty history.

**Part B — Populated history**

1. Ensure at least one completed session exists (complete **US-2** through step 7, or use leftover data from prior testing).
2. From Home, click **History**.
3. Confirm a list row shows a **human-readable date/time** and a **%** value aligned with the last run’s Results aggregate (same trust field as stored `aggregatePct`).
4. Click **Home** when available.

**Pass criteria**

- [ ] Empty history shows **No runs yet** + **Play**.
- [ ] After a run, history lists newest-relevant row with **%** matching Results for that run.

---

## US-4 — Draft resume on reload (no Continue tap)

**User story:** As a player who closed the tab mid-run, I reopen the app and land **directly in Play** with the same round, target, and slider positions restored.

**Steps**

1. Reset storage. From Home, **Play**.
2. On round `1 / 5`, set **Hue**, **Saturation**, and **Value** to non-default positions (remember approximate values).
3. Optionally advance one round with **Next** and adjust sliders again (stronger test: resume on round 2+).
4. Confirm `coloreval_draft_v1` exists in Local Storage and JSON includes `targets`, `committed`, `userHsv`, `roundsPerRun`.
5. **Hard reload** the full page (same origin).
6. Confirm you **do not** land on Home first: UI should be **Play** immediately with the same **progress** fraction, same **Target** swatch, and **Yours** matching pre-reload sliders.
7. Complete the run through **Finish** and confirm Results + draft cleared (as in US-2).

**Pass criteria**

- [ ] After reload, screen is **Play** without manual **Continue**.
- [ ] Round index, target, and **Yours** match pre-reload state within slider resolution.
- [ ] Completing the run still persists a session and removes the draft.

---

## US-5 — Home after Results; new **Play**

**User story:** After scoring, I return **Home** and can start **Play** again without stale UI.

**Steps**

1. Complete a run to **Results** (or use existing Results state).
2. Click **Home**.
3. Confirm **Home** screen (Coloreval, **Play**, **History**).
4. Click **Play**; confirm `1 / 5` and fresh targets.

**Pass criteria**

- [ ] **Home** navigates away from Results cleanly.
- [ ] **Play** from Home starts a new run from round 1.

---

## US-6 — Storage failure banner (optional / advanced)

**User story:** If persisting a completed run fails, I see **Can’t save scores**, **Retry**, and **Continue without saving**, and can recover or dismiss.

**Setup (pick one)**

- **Blocked storage:** In Chrome DevTools → Application → Storage, enable **“Simulate custom storage quota”** and set a very small quota, then finish a run; or use a private window policy that blocks storage (behavior varies by browser).
- **Manual corrupt / full:** Less portable; skip if unavailable.

**Steps**

1. Trigger a failed `appendSession` after **Finish** (exact UI depends on environment).
2. Confirm a top **alert** region with text **Can’t save scores**, **Retry**, **Continue without saving**.
3. If **Retry** succeeds, confirm banner clears and **History** eventually lists the run after navigating there.
4. If you click **Continue without saving**, confirm banner clears; accept that the run may be missing from **History** if retry never succeeded.

**Pass criteria**

- [ ] Failure path shows the three copy elements above (when failure is reproducible).
- [ ] **Retry** / **Continue** do not leave the app in a broken state (no uncaught errors in console).

---

## US-7 — Keyboard and focus smoke (optional)

**User story:** As a keyboard user, I can operate **Play** without a pointer.

**Steps**

1. From **Play**, press `Tab` repeatedly until focus enters the **Hue** slider, then **Saturation**, **Value**, **Finish**/**Next**.
2. Change values with arrow keys where supported.
3. Activate **Finish**/**Next** with `Space`/`Enter` when focus is on the button.

**Pass criteria**

- [ ] Visible **focus** ring (or browser default) on sliders and primary button.
- [ ] Commit still advances rounds / completes run without mouse.

---

## US-8 — Quit mid-run (start over)

**User story:** As a player, I can **Quit** from **Play** to return **Home** and discard the in-progress run (no resume until I start **Play** again).

**Steps**

1. From **Home**, **Play**. Confirm `coloreval_draft_v1` exists in Local Storage after the screen loads.
2. Click **Quit** (link-style control under **Next** / **Finish**).
3. In the browser **confirm** dialog, choose **Cancel**. Confirm you remain on **Play** and draft still exists.
4. Click **Quit** again; choose **OK** / **Leave** in the confirm dialog.
5. Confirm **Home** ( **Play** / **History** ).
6. Confirm **`coloreval_draft_v1`** is removed from Local Storage.
7. Reload the page; confirm you land on **Home** (not auto-resume into **Play**).

**Pass criteria**

- [ ] **Quit** + confirm **OK** clears draft, clears run, shows Home.
- [ ] **Quit** + confirm **Cancel** leaves Play and progress unchanged.
- [ ] After quit + reload, no draft resume.

---

## Evidence checklist (for reports)

When filing a bug or agent log, attach:

- Browser name + version
- **US-ID** and step number
- Screenshot or short description of UI
- Whether `coloreval_draft_v1` / `coloreval_sessions_v1` / `coloreval_prefs_v1` were present and redacted JSON snippets if relevant
- Any console errors (copy full stack)

---

## Related documents

- [`UX.md`](UX.md) — product copy and flow expectations.
- [`architecture.md`](architecture.md) — `localStorage` keys and bootstrap resume behavior.
