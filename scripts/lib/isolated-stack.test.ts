import { expect, test } from 'vitest';

import { loopbackOrigin } from './isolated-stack';

test('an explicit loopback URL yields its origin', () => {
  expect(loopbackOrigin('http://127.0.0.1:3210/', '--convex-url')).toBe('http://127.0.0.1:3210');
});

test('a missing value is refused', () => {
  expect(() => loopbackOrigin(undefined, '--convex-url')).toThrow(
    '--convex-url is required; only an isolated local backend is supported.'
  );
});

test.each([
  ['a remote backend', 'https://production.convex.cloud'],
  ['a host name', 'http://localhost:3210'],
  ['another scheme', 'https://127.0.0.1:3210'],
  ['a default port', 'http://127.0.0.1/'],
  ['a path', 'http://127.0.0.1:3210/path'],
  ['a query', 'http://127.0.0.1:3210/?query'],
  ['a fragment', 'http://127.0.0.1:3210/#fragment'],
  ['a username', 'http://user@127.0.0.1:3210/'],
  ['a password', 'http://:password@127.0.0.1:3210/'],
])('refuses %s', (_, value) => {
  expect(() => loopbackOrigin(value, '--convex-url')).toThrow(
    '--convex-url must be an explicit http://127.0.0.1:PORT origin.'
  );
});
