// @vitest-environment jsdom

import { afterEach, expect, test, vi } from 'vite-plus/test';

import { BrowserDiagnostics } from './browserDiagnostics';

afterEach(() => vi.restoreAllMocks());

test('captures console levels, exceptions and rejections, redacts credentials, and restores console methods', () => {
  const original = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const diagnostics = new BrowserDiagnostics();
  const stop = diagnostics.listen(window);
  console.warn('request failed', { accessToken: 'PRIVATE', state: 'Battle', email: 'person@example.com' });
  window.dispatchEvent(
    new ErrorEvent('error', { error: new TypeError('render failed'), filename: 'play.js', lineno: 7 })
  );
  const rejection = new Event('unhandledrejection');
  Object.defineProperty(rejection, 'reason', { value: new Error('socket stopped') });
  window.dispatchEvent(rejection);
  stop();
  expect(console.warn).toBe(original);
  const report = diagnostics.snapshot();
  expect(report.logs.map((entry) => entry.level)).toEqual(['warn', 'uncaught', 'unhandledrejection']);
  expect(JSON.stringify(report)).not.toContain('PRIVATE');
  expect(JSON.stringify(report)).not.toContain('person@example.com');
  expect(report.logs[0]?.text).toContain('Battle');
  expect(report.logs[1]?.text).toContain('render failed');
});

test('bounds the browser history and reports dropped entries', () => {
  const diagnostics = new BrowserDiagnostics();
  for (let i = 0; i < 502; i++) {
    diagnostics.record('log', [`entry ${i}`]);
  }
  expect(diagnostics.snapshot().logs).toHaveLength(500);
  expect(diagnostics.snapshot().droppedLogs).toBe(2);
  expect(diagnostics.snapshot().logs[0]?.text).toBe('entry 2');
});

test('logging an object does not invoke its getters', () => {
  const getter = vi.fn(() => 'secret');
  const diagnostics = new BrowserDiagnostics();
  diagnostics.record('debug', [Object.defineProperty({}, 'value', { get: getter, enumerable: true })]);
  expect(getter).not.toHaveBeenCalled();
});
