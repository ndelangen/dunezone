import { expect, test } from 'vitest';

import { safeAuthDestination } from './oauthDestination';

test.each([
  '//evil.example',
  '/\\evil.example',
  'https://evil.example/path',
  'javascript:alert(1)',
  'https://user@dune.zone/path',
  'https://dune.zone//evil.example/',
  '/.//evil.example/',
])('rejects external or credentialed destination %s', (next) => {
  expect(safeAuthDestination(next)).toBe('/');
});
test.each(['/profiles/central/edit?tab=methods#google', 'https://dune.zone/profiles/central'])(
  'keeps app destination %s',
  (next) => {
    const destination = new URL(next, 'https://dune.zone');
    expect(safeAuthDestination(next)).toBe(destination.pathname + destination.search + destination.hash);
  }
);
