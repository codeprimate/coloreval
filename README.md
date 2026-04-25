# Coloreval

A minimal static SPA for a color-matching game: match reference swatches using HSV controls, score by accuracy, and keep history in `localStorage`. Gameplay is not implemented yet—this repo is tooling, layout, and hosting scaffolding.

## Prerequisites

- [nvm](https://github.com/nvm-sh/nvm) (assumed installed)
- Node.js matching [`.nvmrc`](.nvmrc) (LTS)

```bash
nvm use   # or: nvm install
npm install
```

Before merging, run `npm test && npm run build` (and fix any lint issues).

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
- [AGENTS.md](AGENTS.md) — conventions for agents and contributors

## Bootstrap

Product goals and constraints live in [bootstrap.md](bootstrap.md).
