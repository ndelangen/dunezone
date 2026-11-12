# Skills index

The skills agents can load in this repository, and how they are laid out.

## Layout

- `.agents/skills/<name>/` is the one home for every skill, vendored or ours.
- `.claude/skills/<name>` is a relative symlink back into it, because Claude Code reads only
  `.claude/skills`. Add a link when you add a skill; never a copy, because a copy drifts.
- [`skills-lock.json`](../../skills-lock.json) names the vendored skills: the Convex set from
  `get-convex/agent-skills` and the wayfinding set from `mattpocock/skills`. Those are refreshed from
  upstream, not edited here. Every other skill is
  repo-authored, and `bun run check:prose` sweeps it like any other markdown.

## Conventions

- Every skill has frontmatter `name` (matching its folder) and `description` with trigger wording
  ("Use when ...").
- Keep `SKILL.md` focused; move deep detail to `REFERENCE.md`, `references/`, or `EXAMPLES.md`.
- Say parallel work in tool-neutral words (sub-agents, read-only exploration) and name a tool only as
  an example, since more than one agent reads the same skill.
- Keep links valid and local to this repo.

## Skill precedence

- For UI implementation or refactors, `ui-create-standards` wins over `grill-me`.
- `grill-me` is for stress-testing a plan outside a domain-specific skill.
- `design-an-interface` explores the shape of one module's interface.
- `improve-codebase-architecture` finds coupling and frames a deep-module RFC.
- `convex` routes an underspecified Convex request to the right Convex skill.
- `wayfinder` plans an effort too big for one session as a map of decision tickets. It runs only
  when asked by name. [`docs/agents/issue-tracker.md`](../../docs/agents/issue-tracker.md) says how
  this repo stores maps, tickets, blockers and the frontier.
- `grilling` is the vendored companion `wayfinder` calls for grilling tickets; `grill-me` stays the
  general skill for stress-testing a plan outside a map.

## Local adaptations of the wayfinding set

The vendored files stay as upstream ships them. These repo rules apply on top of them:

- `domain-modeling` looks for `GLOSSARY.md` and `docs/adr/`. This repo's glossary is
  [`CONTEXT.md`](../../CONTEXT.md) for product terms and the Language section of
  [`AGENTS.md`](../../AGENTS.md) for technical terms. ADRs live in [`docs/adr/`](../../docs/adr/).
- `research` and the research tickets of `wayfinder` record findings as a resolution comment on the
  ticket, or under [`docs/research/`](../../docs/research/) when the notes are long. They never push
  a `research/*` branch, because agent sessions here push only to their assigned branch.

## Available skills

Repo-authored:

- `ui-create-standards`: where a UI concern lives in the taxonomy, how it is built with Mantine and
  the kit, and the guards to run.
- `grill-me`: general plan and design pressure testing through structured questioning.
- `write-a-skill`: authoring and structuring new local skills, including where they live here.
- `design-an-interface`: generate and compare radically different interface designs.
- `improve-codebase-architecture`: find architectural friction and propose deep-module refactors.

Vendored, named in `skills-lock.json`:

- `convex`: routes a general Convex request to the skill below that fits it.
- `convex-create-component`: builds reusable Convex components with isolated tables.
- `convex-migration-helper`: safe widen-migrate-narrow migration workflows.
- `convex-performance-audit`: Convex read/write hot-path and OCC performance audit workflow.
- `convex-setup-auth`: Convex auth provider setup and authorization guidance.
- `convex-quickstart`: Convex quickstart guidance, mostly for greenfield setup.
- `wayfinder`: charts and works a map of decision tickets on GitHub issues.
- `grilling`: relentless questioning of a plan, used by `wayfinder` grilling tickets.
- `domain-modeling`: sharpens the domain vocabulary and records decisions as ADRs.
- `research`: investigates a question against primary sources in a background agent.
- `prototype`: builds a throwaway UI or logic prototype to answer a design question.

## Maintenance checklist

- When a decision lands in `docs/technical/ui-design-decisions.md`, check that
  `ui-create-standards` still reflects it.
- When Convex migration guidance changes, update `docs/convex-migrations.md`; the vendored
  `convex-migration-helper` is refreshed from upstream, not edited here.
- After edits, run `bun run check:prose` and confirm every linked path exists.
