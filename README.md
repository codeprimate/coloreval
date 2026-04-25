# Coloreval

A static SPA color-matching game: match reference swatches with HSV controls, score at the end, keep history and in-progress drafts in `localStorage`.

**Static output:** `npm run build` writes a complete site to **`dist/`** (HTML, hashed JS/CSS). Deploy that directory to any static host (S3, nginx, GitHub Pages, Netlify, the included Docker image, etc.). Asset URLs are **relative** (`base: './'`) so the same files work at a subpath or from disk in browsers that allow local ES modules.

**Local dev:** `npm run dev` (Vite HMR). **Smoke the build:** `npm run preview` serves `dist/` over HTTP.

## Prerequisites

- [nvm](https://github.com/nvm-sh/nvm) (assumed installed)
- Node.js matching [`.nvmrc`](.nvmrc) (LTS)

```bash
nvm use   # or: nvm install
npm install
```

Before merging, run `npm run lint && npm run format:check && npm test && npm run build`.

## Scripts

| Command                | Description                |
| ---------------------- | -------------------------- |
| `npm run dev`          | Vite dev server            |
| `npm run build`        | Production build → `dist/` |
| `npm run preview`      | Preview `dist/` locally    |
| `npm test`             | Vitest (CI mode)           |
| `npm run lint`         | ESLint                     |
| `npm run format`       | Prettier write             |
| `npm run format:check` | Prettier check             |

## Static output

`npm run build` writes static assets to `dist/`, suitable for any static file host.

## Docker

Build and run the same static site in a container (nginx on port 80 inside the container):

```bash
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080) (host `8080` → container `80`).

## Docs

- [docs/architecture.md](docs/architecture.md) — build and deploy flow
- [docs/manual-browser-test.md](docs/manual-browser-test.md) — manual QA checklist
- [AGENTS.md](AGENTS.md) — conventions for agents and contributors

## Bootstrap

Product goals and constraints live in [bootstrap.md](bootstrap.md).
