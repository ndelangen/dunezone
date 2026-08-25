import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

const config = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'workers/storybook/wrangler.jsonc'), 'utf8')
) as Record<string, unknown>;

describe('public Storybook deployment', () => {
  test('owns only the isolated Storybook hostname', () => {
    expect(config.name).toBe('dune-zone-storybook');
    expect(config.routes).toEqual([{ pattern: 'storybook.dune.zone', custom_domain: true }]);
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
  });

  test('is a secret-free Static Assets deployment', () => {
    expect(config).not.toHaveProperty('main');
    expect(config).not.toHaveProperty('vars');
    expect(config).not.toHaveProperty('secrets');
    expect(config).not.toHaveProperty('r2_buckets');
    expect(config).not.toHaveProperty('browser');
    expect(config).not.toHaveProperty('images');
    expect(config.assets).toEqual({
      directory: '../../storybook-static',
      html_handling: 'none',
      not_found_handling: '404-page',
    });
  });
});
