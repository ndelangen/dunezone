# ADR-0004: Chromatic captures each UI capability once; CI runs every story

**Status:** Accepted (2026-10-24)

## Context

Every story used to be a Chromatic snapshot as well as a Vitest test. Chromatic bills per snapshot,
and a full build re-captures every story whenever a shared file changes, which most merged pull
requests do. About a third of the stories were behaviour tests whose long plays timed out
Chromatic's capture. Many others showed one component again with different data, or showed content
rather than UI: every emblem, every card in a deck, every documentation page. New media then changed
snapshots that had nothing to do with UI code, and each change cost a capture and a review.

The Vitest story shards already run every story's play on every pull request at no per-story cost.

## Decision

Storybook shows UI code. Content and media are only there because a capability cannot be shown
without data, and the production media gallery is where the content itself is shown.

- **A visual story shows a UI capability, and Chromatic captures it once.** Every component is
  captured at least once, covering each capability it has: an image, an SVG logo, wrapped text, an
  empty state, a narrow width. A second story that renders the same capability with different data
  is a duplicate. It is deleted, or it moves to a testing story when its play checks something.
- **A testing story drives behaviour, and CI runs it.** It clicks, types, waits on a server or
  repeats a screen already captured elsewhere. Its file builds its meta from `testingPreview`, which
  turns Chromatic snapshots off, and its play still runs in the Vitest story shards on every pull
  request. Moving a story to a testing file never loses a check.
- **Stories use fixed fixture data, not live catalogues.** A story that lists `LOGO.options` or the
  stock collections changes whenever art is added. It picks a fixed handful instead.
- **Captures and plays run with reduced motion.** Chromatic and the Vitest story shards both set
  `prefers-reduced-motion: reduce`, so a capture never lands on a moving frame. A story that checks an
  animation pins `globals: { motion: 'on' }`, which the story run honours.
- **A file holds stories of one kind.** A component with both kinds has a pair:
  `name.stories.tsx` for the visual stories and `name.testing.stories.tsx` for the testing ones,
  under the same `title`. Shared helpers live in `name.stories.fixture.ts(x)`.

## Consequences

- A full Chromatic build captured about 1,148 stories before this decision and about 835 after it.
- A new story starts as a testing story unless it shows a capability no other story shows.
- A capture failure still fails the Chromatic workflow; a slow play is a sign the story belongs in a
  testing file.

## Considered options

- Wrapping each testing story in a helper that sets `disableSnapshot`. Rejected: it touches every
  story and makes Storybook migrations harder. A second `definePreview` is the framework's own seam.
- Running Chromatic only on main. Rejected: visual changes would reach main unreviewed.
- Deleting the testing stories. Rejected: their plays are part of the pull request checks.
