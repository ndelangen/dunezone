---
name: write-a-skill
description: Create new agent skills with proper structure, progressive disclosure, and bundled resources. Use when user wants to create, write, or build a new skill.
---

# Writing skills

## Process

1. **Gather requirements** - ask user about:
 - What task/domain does the skill cover?
 - What specific use cases should it handle?
 - Does it need executable scripts or just instructions?
 - Any reference materials to include?

2. **Draft the skill** - create:
 - SKILL.md with concise instructions
 - Additional reference files if content exceeds 500 lines
 - Utility scripts if deterministic operations needed

3. **Review with user** - present draft and ask:
 - Does this cover your use cases?
 - Anything missing or unclear?
 - Should any section be more/less detailed?

## Where a skill lives in this repo

A skill's one home is `.agents/skills/<name>/`. Claude Code reads only `.claude/skills`, so add a
relative symlink there (`ln -s ../../.agents/skills/<name> .claude/skills/<name>`) rather than a
copy, because a copy drifts. List the skill in [`.agents/skills/README.md`](../README.md). The
vendored Convex skills are the ones `skills-lock.json` names; everything else is repo-authored and
swept by `bun run check:prose`, so write it in the house style: sentence-case headings, no em
dashes, straight quotes, no filler.

## Skill structure

```
skill-name/
├── SKILL.md           # Main instructions (required)
├── REFERENCE.md       # Detailed docs (optional)
├── EXAMPLES.md        # Usage examples (optional)
├── references/        # Alternative for multi-file references (optional)
└── scripts/           # Utility scripts (if needed)
    └── helper.js
```

## SKILL.md template

```md
---
name: skill-name
description: Brief description of capability. Use when [specific triggers].
---

# Skill Name

## Quick start

[Minimal working example]

## Workflows

[Step-by-step processes with checklists for complex tasks]

## Advanced features

[Link to separate files: See [REFERENCE.md](REFERENCE.md)]
```

## Description requirements

The description is **the only thing your agent sees** when deciding which skill to load. It's surfaced in the system prompt alongside all other installed skills. Your agent reads these descriptions and picks the relevant skill based on the user's request.

**Goal**: Give your agent just enough info to know:

1. What capability this skill provides
2. When/why to trigger it (specific keywords, contexts, file types)

**Format**:

- Max 1024 chars
- Write in third person
- First sentence: what it does
- Second sentence: "Use when [specific triggers]"

**Good example**:

```
Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when user mentions PDFs, forms, or document extraction.
```

**Bad example**:

```
Helps with documents.
```

The bad example gives your agent no way to distinguish this from other document skills.

## When to add scripts

Add utility scripts when:

- Operation is deterministic (validation, formatting)
- Same code would be generated repeatedly
- Errors need explicit handling

Scripts save tokens and improve reliability vs generated code.

## When to split files

Split into separate files when:

- SKILL.md exceeds ~120-150 lines
- Content has distinct domains (finance vs sales schemas)
- Advanced features are rarely needed

## Review checklist

After drafting, verify:

- [ ] Description includes triggers ("Use when...")
- [ ] SKILL.md is concise; split references when it grows too large
- [ ] No time-sensitive info
- [ ] Consistent terminology
- [ ] Concrete examples included
- [ ] References one level deep
- [ ] The `.claude/skills` symlink exists and `bun run check:prose` passes
