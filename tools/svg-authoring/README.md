# SVG Pipeline Tool

A browser-only tool for authoring dunezone vector sources. Crop to content with a
proportional margin, mirror, optimize dirty paths, recolor, set the #root id, stamp
provenance, pretty-format, and export OBJ previews — all client-side, no server, no
auth. Nothing you upload ever leaves your machine.

Scale/aspect normalization is deliberately NOT here: the dunezone build generator
normalizes every source into the shared 0 0 100 100 space (wayfinder #294). This tool
authors media/vector sources; the train owns the coordinate space. The OBJ chain is
shared with the build (src/shared/svgToObj.ts).

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
