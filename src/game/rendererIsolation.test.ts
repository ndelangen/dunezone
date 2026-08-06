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
      expect(source, name).not.toContain('/app/components/content/');
    }
  });
});
