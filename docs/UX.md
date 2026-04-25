# Coloreval — UX specification

This document captures product UX decisions for the color-matching SPA: reference and user swatches stay visible together (matching, not recall), minimal copy, end-of-run scoring, and history in the browser.

---

## Principles

- **Simplicity and minimal chrome** override decoration; layout teaches before copy does.
- **Matching, not memory** — the target swatch is never hidden; the player compares and adjusts continuously.
- **One stable play surface** — between rounds, only colors (and progress) change; controls and layout stay put.
- **Score at the end** — no per-round percentage during play unless a future mode explicitly adds it.
- **Trust** — numbers on Results and History come from the same stored fields (no divergent formulas).

---

## Information architecture

| Place    | Role |
|----------|------|
| **Home** | Entry: start a run, open history, optional aggregates. |
| **Play** | Single run: `N` rounds with fixed layout (target + yours + HSV + commit). |
| **Results** | End-of-run headline score and optional per-round strip; **Again** / **Home**. |
| **History** | Past runs (summary list); optional row detail if full session data is kept. |
| **Settings** | Optional: toggles, clear history, dismissed hint — keep thin or defer. |

**Navigation (conceptual):** Home → Play → Results → (Again → Play | Home → Home). Home ↔ History at any time.

Implementation may use in-memory “screen” state, hash routes, or both; IA is unchanged.

---

## User journey

### 1. Arrival (Home)

- Quiet viewport: generous neutral background, focal content slightly above optical center on small screens.
- **Primary:** Play. **Secondary:** History (text link or low-emphasis control).
- Optional one-line derived stat (e.g. best or last match %) — omit entirely for strict minimalism.

### 2. First run hint (optional, once)

- At most one line (e.g. *Match the target color*) or no line if **Target** / **Yours** labels suffice.
- Persist “dismissed” in settings so it does not repeat.

### 3. Entering Play

- Short transition (fade or crossfade); title/chrome may shrink or move aside so **swatches own the screen**.
- Show **`1 / N`** (or equivalent) immediately so session length is clear.

### 4. Each round (core loop)

- **Target** — static reference swatch for the round.
- **Yours** — same size and surround as target; updates live with sliders.
- **Whitespace** between the two patches for comfortable comparison (not for hiding).
- **Hue · Saturation · Value** — one column of sliders, large hit targets; consistent order every round.
- **Next** — same position every round; on the last round, label becomes **Finish** (or **Score** if a sharper game tone is preferred — pick one product-wide).

**Between rounds:** advance on tap; subtle transition on the target color (e.g. short crossfade). Avoid full-screen flash. Reset “Yours” per product rules (e.g. default neutral or carry over — document the choice in implementation).

### 5. Results

- Dominant **`n%`** with a quiet **match** label (or single line **`n% match`**).
- Optional: compact per-round indicator row (dots or thin bar), no per-round numbers unless detail view exists.
- **Again** (primary) · **Home** (secondary).

More whitespace than Play so the score reads as the climax.

### 6. History

- List: **date** + **`n%`**; tabular figures or monospace for alignment.
- Empty: **No runs yet** + **Play**.
- Row tap optional; detail view repeats aggregate and optional stored rounds.

### 7. Settings (if shipped)

- Short list of real toggles; **Clear history** with explicit confirm.

---

## Copy system

| Context | Preferred copy |
|---------|----------------|
| Home primary | **Play** |
| Home secondary | **History** |
| Swatch labels | **Target** · **Yours** (use consistently) |
| Sliders | **Hue** · **Saturation** · **Value** (or **H** · **S** · **V** if space-constrained) |
| Mid-run commit | **Next** |
| Last-round commit | **Finish** (or **Score**) |
| Progress | **`i / N`** |
| Results | **`n% match`** (headline) |
| Results actions | **Again** · **Home** |
| History title | **History** |
| History empty | **No runs yet** |
| Storage failure (rare) | **Can’t save scores** + **Retry** / **Continue without saving** |

Avoid long CTAs (*Submit match*, *Lock in*). Avoid redundant “My” / “Your” except in **Yours**.

---

## Visual system

- **Chrome is neutral** — saturation lives in the swatches, not the UI frame.
- **Typography:** one family; two clear levels (body vs score); weight changes used sparingly.
- **Motion:** rare, short (e.g. 150–200 ms), purposeful; respect **prefers-reduced-motion**.
- **Touch:** primary action and sliders sit in comfortable thumb reach on phones.

---

## State and persistence (UX alignment)

Rough split:

| Kind | Where | UX role |
|------|--------|---------|
| Live run | Memory | Current targets, slider state, round index, pending per-round scores until commit/finish. |
| Completed runs | `localStorage` | Append-only **sessions** with stable aggregate % (and optional `rounds[]` for Results/History detail). |
| Preferences | `localStorage` | Hint dismissed, toggles, schema version inside blob if needed. |

**Writes:** avoid persisting on every slider move; persist on **Finish** (and optionally per **Next** if crash recovery is required later — if so, add a draft-run concept and a resume rule on Home).

**Reads:** Home aggregates (if shown) are **derived** from stored sessions (e.g. max or last by `endedAt`). History list reads **session summaries** only unless opening detail.

Exact key names and JSON shape belong in implementation notes or `docs/architecture.md` when built.

---

## Accessibility notes

- Sufficient contrast for labels and **Next** / **Finish** against the neutral chrome.
- Visible focus for keyboard slider use on desktop.
- If a timed or motion-heavy variant is ever added, provide reduced-motion and static-comparison alternatives — not required for the baseline described here.

---

## Related documents

- [`architecture.md`](architecture.md) — static SPA, build/hosting, persistence overview.
- [`../bootstrap.md`](../bootstrap.md) — original product intent dump.
