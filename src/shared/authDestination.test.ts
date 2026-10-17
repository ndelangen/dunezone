import { expect, test } from 'vite-plus/test';

import { safeAuthDestination, signInReturnFrom } from './authDestination';

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

test.each(['/factions?sort=recent#list', '/rulesets/base/faq?q=storm'])('returns to %s after sign-in', (href) => {
  expect(signInReturnFrom(href)).toEqual({ redirect: href });
});
test.each([
  '/',
  '/?welcome=1',
  '/auth/login',
  '/auth/login?redirect=%2Ffactions',
  '/auth',
  '/auth/oauth',
  '//evil.example',
  'https://evil.example/factions',
  7,
  undefined,
])('carries no return from %s', (href) => {
  expect(signInReturnFrom(href)).toEqual({});
});
