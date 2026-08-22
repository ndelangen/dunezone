> This tool lives inside the dunezone repo as a self-contained bun workspace
> (wayfinder #311). Repo-wide conventions live in the root AGENTS.md and
> docs/README.md; consult those first, and run gates from the repo root
> (\`bun run tool:typecheck\`, \`bun run tool:test\`). The workspace keeps its own
> code style and is excluded from root lint/format/knip because it is
> extraction-destined (a future public Netlify/npm release).

# Codex repository guide

## Project overview

- This is a browser-only React application for processing SVG files and exporting OBJ geometry.
- Keep file processing client-side. Do not add uploads, authentication, or a server unless the task explicitly requires one.
- Use Bun for dependency management and repository scripts. Do not introduce npm, pnpm, or yarn lockfiles.

## Commands

- Install dependencies: `bun install`
- Start the app: `bun run dev` (http://localhost:3000)
- Type-check: `bun run typecheck`
- Run unit tests: `bun run test`
- Run end-to-end tests: `bun run test:e2e`
- Run all tests: `bun run test:all`
- Build the static app: `bun run build`

## Code organization

- SVG ingestion and metadata live in `src/lib/svg/`.
- Pipeline orchestration lives in `src/lib/pipeline/`; transformation steps live in `src/lib/pipeline/steps/` and are registered in `src/lib/pipeline/registry.ts`.
- OBJ conversion lives in `src/lib/obj/`.
- Application state lives in `src/store/useAppStore.ts`.
- Feature components live in `src/components/feature/`; reusable primitives live in `src/components/ui/`.
- Unit tests are colocated in `__tests__/`; browser flows live in `e2e/`.
- `src/routeTree.gen.ts` is generated. Do not edit it manually.

## Implementation expectations

- Keep pipeline transformations isolated from React and deterministic for a given SVG input and step configuration.
- When adding a pipeline step, implement the existing step contract, register it, and add focused unit coverage.
- Preserve the existing path alias (`@/`) and component conventions.
- Avoid adding production dependencies when the current stack can handle the task cleanly.
- Preserve unrelated working-tree changes.

## Verification

- Run the narrowest relevant tests while developing, then run `bun run typecheck` before finishing code changes.
- Run `bun run build` after changes to routing, build configuration, dependencies, or application entry points.
- For UI or browser-behavior changes, run the relevant Playwright spec. When Codex browser control is available, also start the app, exercise the affected flow in the running UI, inspect the rendered state, and check the browser console for errors.
- Implement first and verify the completed change once. If verification reveals a problem, fix it and repeat the affected checks.
- Documentation-only or agent-configuration changes do not require runtime application verification.
