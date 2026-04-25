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
