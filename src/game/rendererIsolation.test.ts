import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const rendererDirectory = new URL('.', import.meta.url);

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
      /* The interface kit and the application, by their aliases. `/app/components/content/` used to
         stand here; that path stopped existing when every component moved to `src/ui`, which made
         this assertion pass for the wrong reason. */
      expect(source, name).not.toContain("from '@ui/");
      expect(source, name).not.toContain("from '@app/");
    }
  });
});
