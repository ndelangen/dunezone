import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const layoutDir = new URL('.', import.meta.url);

/*
 * A Layout is responsive by container query, so it lays out by the room it is given, not the size
 * of the window (DD-003). `PageLayout` is the one exemption: it is the shell's page frame, sized
 * against the viewport in concert with `AppHeader` through the `data-page-layout-*` bridge
 * (DD-018), so it is genuinely viewport-scoped and uses `@media`.
 */
const VIEWPORT_EXEMPT = new Set(['PageLayout.module.css']);

describe('layout responsiveness', () => {
  it('lays out by container query, not media query (PageLayout is the shell-frame exemption)', () => {
    const offenders = readdirSync(layoutDir)
      .filter((name) => name.endsWith('.module.css') && !VIEWPORT_EXEMPT.has(name))
      // Any `@media` at-rule — `@media (…)`, `@media screen and (…)`, `@media only screen …`.
      .filter((name) => /@media\b/.test(readFileSync(new URL(name, layoutDir), 'utf8')));

    expect(offenders).toEqual([]);
  });
});
