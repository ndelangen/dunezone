# ADR-0006: Creator tutorials run on a practice copy of the site

**Status:** Accepted (2026-11-02)

## Context

The Play tutorial teaches at a real table that runs in the browser. Norbert asked for the same kind
of tutorial for making content: guide a learner through creating their own faction, in memory, never
writing to the database. A written article at `/create/faction` was not what he meant.

A first cut held only the faction editor's form in memory and had no Save. That teaches the form but
not the site: saving, the new faction's own page and its editor all stay out of reach. Norbert asked
whether a route could run on a database in memory, as Storybook's page stories do, so it can be reset
to any state (2026-11-02). Page stories already run every Convex function, unchanged, over seeded rows
in a Web Worker (`src/app/db/storybook`). The same machinery can serve a page of the site.

## Decision

A creator tutorial shows a **practice copy** of the site (`src/app/db/sandbox/SandboxApp.tsx`):

- The copy's backend is the page stories' worker: the real Convex functions over rows seeded in the
  browser. It has no environment variables and its `fetch` throws, so it reaches nothing outside the
  tab.
- `SandboxConvexClient` answers the part of `ConvexReactClient` that Convex's hooks and Convex Auth
  reach, so every page and hook under it works unchanged. A write re-runs the watched queries.
- The copy is signed in as the tutorial's learner through an in-memory Convex Auth store. The visitor's
  own session never enters it, and its sign-in calls go to `https://sandbox.invalid`.
- The copy's router is a copy of the application route tree with a memory history and without the
  document shell or the site's header and footer. Its links move round the copy and leave the address
  bar alone.
- While the copy is open, `db` in `@db/core` sends route loaders to it (`enterSandbox`), and the site's own
  router preloads nothing on hover, since a preload would read the copy. It leaves
  when the copy unmounts and as soon as the site's own router starts loading another page, so no real
  page reads the copy.
- Reset starts a fresh copy. Whatever the learner made dies with the tab and has no address to share.

The faction tutorial at `/create/faction` is the first user: the rail and arrow of the Play tutorial
beside the real `/factions/create`, through Save to the new faction's page. Every other creator
tutorial can use the same copy, since every editor runs on it.

## Consequences

- The production build bundles the worker and the Convex functions it loads, lazily, only for a page
  that opens a copy. `vite.config.ts` lowers the worker's async functions and gives it the Zone.js
  `AsyncLocalStorage`, as the Storybook build does; the server build keeps Node's own.
- A function that needs an outside service, such as capturing a published asset, cannot finish in a
  copy. A tutorial that reaches one stubs it in the copy's seed or avoids it.
- Under Storybook the page stories' own database already serves every hook, so a copy inside a story
  shows the story's rows.
