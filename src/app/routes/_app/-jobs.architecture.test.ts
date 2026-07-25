import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

const routeSource = readFileSync(new URL('./[_]_jobs.tsx', import.meta.url), 'utf8');

describe('/__jobs route contract', () => {
  test('shows the authorization result and agreed operational fields', () => {
    expect(routeSource).toContain('Not authorized');
    expect(routeSource).toContain('Renderer revisions');
    expect(routeSource).toContain('Publisher pickup');
    expect(routeSource).toContain('Attempts');
    expect(routeSource).toContain('Lease expires');
    expect(routeSource).toContain('Last error');
  });

  test('does not expose embedded job data or manual job actions', () => {
    expect(routeSource).not.toContain('asset_data');
    expect(routeSource).not.toMatch(/delete.*job/i);
    expect(routeSource).not.toMatch(/retry.*job/i);
  });
});
