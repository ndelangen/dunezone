import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { expect, test } from 'vitest';

import {
  parseExpectedRenderer,
  rendererKinds,
  rendererMismatch,
  rendererReport,
  runningChromium,
} from './verify-hosted-renderer';

/* The renderer strings CI and a Mac report, as recorded on #1322 and #1343. */
const swiftShader = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';
const metal = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)';

test.each(rendererKinds)('--expect-renderer accepts %s', (kind) => {
  expect(parseExpectedRenderer(kind)).toBe(kind);
});

test('without --expect-renderer no renderer is expected', () => {
  expect(parseExpectedRenderer(undefined)).toBeUndefined();
});

test('--expect-renderer refuses a value outside its set and names the set', () => {
  expect(() => parseExpectedRenderer('webgl2')).toThrow(
    '--expect-renderer must be one of webgpu, webgl2-swiftshader, webgl2-other, not webgl2.'
  );
});

test.each([
  [{ backend: 'webgl2', glRenderer: swiftShader }, 'webgl2-swiftshader'],
  [{ backend: 'webgl2', glRenderer: metal }, 'webgl2-other'],
  [{ backend: 'webgpu', adapter: { vendor: 'apple', architecture: 'metal-3' } }, 'webgpu'],
  [{ unidentified: 'the table renderer did not finish initialising' }, 'unidentified'],
] as const)('a table observed as %o records kind %s', (observation, kind) => {
  expect(rendererReport(observation).kind).toBe(kind);
});

test('the expected renderer passes when the table rendered with it', () => {
  const renderer = rendererReport({ backend: 'webgl2', glRenderer: swiftShader });
  expect(rendererMismatch('webgl2-swiftshader', renderer)).toBeUndefined();
});

test('without an expectation any renderer passes, an unidentified one included', () => {
  expect(rendererMismatch(undefined, rendererReport({ unidentified: 'no renderer' }))).toBeUndefined();
  expect(rendererMismatch(undefined, undefined)).toBeUndefined();
});

test.each([
  [
    'webgl2-swiftshader',
    rendererReport({ backend: 'webgpu', adapter: { vendor: 'apple', architecture: 'metal-3' } }),
    '--expect-renderer is webgl2-swiftshader, but the Play table rendered with webgpu (adapter apple metal-3).',
  ],
  [
    'webgpu',
    rendererReport({ backend: 'webgl2', glRenderer: swiftShader }),
    `--expect-renderer is webgpu, but the Play table rendered with webgl2-swiftshader (${swiftShader}).`,
  ],
  [
    'webgl2-swiftshader',
    rendererReport({ unidentified: 'the table renderer did not finish initialising' }),
    '--expect-renderer is webgl2-swiftshader, but the Play table rendered with unidentified (the table renderer did not finish initialising).',
  ],
  ['webgpu', undefined, '--expect-renderer is webgpu, but the flow opened no Play table, so no renderer was recorded.'],
] as const)('a table held to %s fails naming what it rendered with', (expected, renderer, message) => {
  expect(rendererMismatch(expected, renderer)).toBe(message);
});

test.each([
  [
    'HeadlessChrome/151.0.7922.34',
    '/cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell --disable-field-trial-config --headless --use-angle=swiftshader-webgl',
    {
      build: 'headless-shell',
      executable:
        '/cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',
    },
  ],
  [
    'Chrome/151.0.7922.34',
    '/cache/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing --disable-field-trial-config --headless',
    {
      build: 'full',
      executable:
        '/cache/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    },
  ],
  [
    'Chrome/151.0.7922.34',
    '/cache/ms-playwright/chromium-1234/chrome-linux64/chrome --disable-field-trial-config --use-angle=swiftshader',
    { build: 'full', executable: '/cache/ms-playwright/chromium-1234/chrome-linux64/chrome' },
  ],
])('the running browser %s identifies its build and executable', (product, commandLine, identity) => {
  expect(runningChromium(product, commandLine)).toEqual(identity);
});

test.each([
  [['--browser-only', '--expect-renderer', 'webgl2'], '--expect-renderer must be one of'],
  [['--expect-renderer', 'webgpu'], '--expect-renderer requires a browser flow.'],
])('the launcher refuses %j before it boots a stack', (args, message) => {
  /* A relative --backend-binary stops the launcher before it starts anything, so a refusal that regressed fails here without booting a stack. */
  const result = spawnSync(
    'bun',
    [
      '--no-env-file',
      path.resolve('scripts/verify-hosted-play-stack.ts'),
      ...args,
      '--backend-binary',
      'convex-local-backend',
    ],
    { encoding: 'utf8', timeout: 10_000 }
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(message);
});
