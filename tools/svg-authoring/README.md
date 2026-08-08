# SVG Pipeline Tool

A browser-only tool for batch-normalizing SVG files. Crop to content, normalize
aspect ratio and scale, mirror, optimize dirty paths, and (later) export to OBJ —
all client-side, no server, no auth. Nothing you upload ever leaves your machine.

## Stack

- [TanStack Start](https://tanstack.com/start) in SPA mode (static hosting)
- React 19 + Vite
- Tailwind CSS v4 + shadcn/ui components
- Zustand for state
- Vitest (unit) + Playwright (E2E)

## Getting started

```bash
bun install
bun run dev      # http://localhost:3000
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start the dev server |
| `bun run build` | Build static output |
| `bun run preview` | Preview the production build |
| `bun run test` | Run Vitest unit tests |
| `bun run test:e2e` | Run Playwright E2E tests |
| `bun run test:all` | Run unit + E2E |
| `bun run typecheck` | Type-check with tsc |

## Pipeline

Each transformation is an isolated, testable pipeline step operating on SVG
strings. Default order: **crop → aspect ratio → scale → flip → optimize**.

Steps live in `src/lib/pipeline/steps/` and are registered in
`src/lib/pipeline/registry.ts`. Pipeline logic is UI-agnostic and unit-tested
under jsdom; user flows are covered by Playwright E2E specs in `e2e/`.

## Deployment

Static output works on any host. For SPA routing, `public/_redirects` provides
the Netlify fallback (`/* /index.html 200`).
