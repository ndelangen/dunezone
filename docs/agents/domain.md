# Domain docs

This is a single-context repository.

Before exploring a domain, read:

- Root [`CONTEXT.md`](../../CONTEXT.md): the glossary is its `## Language` section, and it carries
  `_Avoid_:` lines naming terms this project deliberately rejects.
- Relevant decisions under [`docs/adr/`](../adr/).

Use that glossary's canonical vocabulary in issues, specifications, tests, and implementation. Surface conflicts with existing ADRs instead of silently overriding them. Missing domain files are not errors; the domain-modeling workflow creates them lazily when a term or durable decision is resolved.
