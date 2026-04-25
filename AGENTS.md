# Agent and contributor notes

## Stack

- **Vite** — dev server and production bundle to `dist/`
- **Vitest** — unit tests under `tests/`
- **ESLint** (flat config) + **Prettier** — lint and format
- **Plain JS** (ES modules) in `src/` — no UI framework in scaffolding

## Node version

Use the version in [`.nvmrc`](.nvmrc) via nvm before installing or running scripts:

```bash
nvm use
npm install
```

The [Dockerfile](Dockerfile) build stage uses a `node` image tag aligned with `.nvmrc`; keep them in sync when bumping Node.

## Commands

- `npm run dev` — local development (long-running)
- `npm run build`, `npm test`, `npm run lint`, `npm run format:check` — short-running; safe for automation

**Do not start long-running servers** (e.g. `npm run dev`) unless the user explicitly asks.

## Development process (before calling work done)

Treat a task as **unfinished** until all of the following have happened:

1. **Test development** — When behavior or public APIs change, add or update tests under `tests/` so regressions are caught. New logic should land with coverage appropriate to the change (unit tests for pure modules; adjust existing suites when wiring changes).
2. **Test execution** — Run **`npm test`** and fix failures before reporting completion.
3. **Lint and format** — Run **`npm run lint`** and **`npm run format:check`** (or apply **`npm run format`** where auto-fix is acceptable) and resolve issues.
4. **Production build** — Run **`npm run build`** so the Vite bundle succeeds and import/asset problems surface the same way CI and Docker builds will.

Only after these steps pass should you describe the work as **done** (or equivalent) to the user.

## Layout

- `index.html` — Vite HTML entry
- `src/` — application source (`main.js`, `styles/`)
- `public/` — static assets copied as-is
- `tests/` — Vitest tests
- `docs/` — human-facing architecture notes
- `nginx/` — nginx config for the Docker image

## Conventions

- Prefer small, focused changes; no game logic in scaffolding PRs unless requested.
- No extra UI frameworks until the product needs them.
