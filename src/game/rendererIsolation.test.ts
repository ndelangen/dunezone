import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const rendererDirectory = new URL('.', import.meta.url);

/**
 * Any spelling that resolves a module: `import x from`, `export … from`, a bare side-effect
 * `import`, and `import(...)`, in either quote style.
 *
 * Two ways to reach the app: the aliases (`@ui`/`@app`/`@db`), and a relative climb `../app/…`
 * (`@ui` and `@db` both resolve under `src/app`, so a relative reach into either also passes
 * through an `app/` segment). Catching only the aliases would leave the relative spelling as a
 * silent hole — no oxlint override guards `src/game`, so this test is the only fence.
 *
 * The alias or the climb is followed by either a `/` (a deeper path) or the closing quote (a bare
 * `import x from '@db'` at a package/index entry). Requiring the slash alone would miss the bare
 * form. A trailing character other than those two — `@database`, `../data/` — is a different module
 * and correctly not matched.
 */
const FORBIDDEN_MODULE_REACH =
  /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](?:@(?:ui|app|db)|(?:\.\.\/)+app)(?:\/|['"])/;

describe('renderer isolation', () => {
  it('keeps the renderer independent from application UI frameworks', () => {
    const rendererSources = readdirSync(rendererDirectory, { recursive: true })
      .map(String)
      .filter(
        (name) =>
          /\.(?:ts|tsx|css)$/.test(name) && !name.includes('.test.') && !name.includes('.stories.')
      );

    for (const name of rendererSources) {
      const source = readFileSync(new URL(name, rendererDirectory), 'utf8');
      expect(source, name).not.toContain('@mantine');
      expect(source, name).not.toContain('@radix-ui');
      expect(source, name).not.toContain('ConnectedTabs');
      /* The interface kit and the application, by their aliases — in every spelling that reaches a
         module, not just the one that is easy to grep. `/app/components/content/` used to stand here
         and stopped existing when the components moved, which made this pass for the wrong reason;
         checking only `from '@ui/` would have repeated the mistake in a smaller way, since a
         side-effect import, a dynamic import, a re-export or a double quote all get there too. */
      expect(source, name).not.toMatch(FORBIDDEN_MODULE_REACH);
    }
  });
});
