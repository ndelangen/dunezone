import type { Browser, Page } from '@cloudflare/playwright';
import { describe, expect, test, vi } from 'vitest';

import {
  assertCaptureDiagnostics,
  assertCapturedPdfOutput,
  PublisherBrowserSession,
  publisherCaptureCookies,
  registerCaptureDiagnostics,
} from './browser';

describe('production capture output validation', () => {
  test('accepts only the two-page A4 portrait contract', () => {
    expect(() =>
      assertCapturedPdfOutput({ pageCount: 2, pageWidthMm: 209.9, pageHeightMm: 297.04 })
    ).not.toThrow();
    expect(() =>
      assertCapturedPdfOutput({ pageCount: 1, pageWidthMm: 210, pageHeightMm: 297 })
    ).toThrow(/exactly two pages/);
    expect(() =>
      assertCapturedPdfOutput({ pageCount: 2, pageWidthMm: 211, pageHeightMm: 297 })
    ).toThrow(/MediaBoxes/);
  });

  test('collects page exceptions, request failures, and HTTP error responses', () => {
    const listeners = new Map<string, (...args: never[]) => void>();
    const page = {
      on: vi.fn((name: string, listener: (...args: never[]) => void) => {
        listeners.set(name, listener);
      }),
    } as unknown as Page;
    const diagnostics = registerCaptureDiagnostics(page);

    listeners.get('pageerror')?.(new Error('post-ready exception') as never);
    listeners.get('requestfailed')?.({
      method: () => 'GET',
      url: () => 'https://assets.example/missing.svg',
      failure: () => ({ errorText: 'connection reset' }),
    } as never);
    listeners.get('response')?.({
      status: () => 404,
      url: () => 'https://assets.example/missing.png',
      request: () => ({ method: () => 'GET' }),
    } as never);

    expect(diagnostics.issues).toEqual([
      'page: post-ready exception',
      expect.stringMatching(/^request: .*connection reset/),
      expect.stringMatching(/^http: .*HTTP 404/),
    ]);
    expect(() => assertCaptureDiagnostics(diagnostics)).toThrow(/Capture issues/);
  });

  test('bounds noisy capture diagnostics while retaining dropped issue volume', () => {
    const listeners = new Map<string, (...args: never[]) => void>();
    const page = {
      on: vi.fn((name: string, listener: (...args: never[]) => void) => {
        listeners.set(name, listener);
      }),
    } as unknown as Page;
    const diagnostics = registerCaptureDiagnostics(page);

    for (let index = 0; index < 20; index += 1) {
      listeners.get('pageerror')?.(new Error(`issue ${index} ${'x'.repeat(1_000)}`) as never);
    }

    expect(diagnostics.issues).toHaveLength(12);
    expect(diagnostics.issues.every((issue) => issue.length <= 512)).toBe(true);
    expect(diagnostics.dropped).toBe(8);
    expect(() => assertCaptureDiagnostics(diagnostics)).toThrow(/8 additional issues dropped/);
  });

  test('diagnostics never retain signed artwork URL credentials, paths, queries, or fragments', () => {
    const signedUrl =
      'https://signed-user:SECRET_PASSWORD@cdn.example.com/private/SECRET_PATH/art.png?token=SECRET_QUERY#SECRET_FRAGMENT';
    const listeners = new Map<string, (...args: never[]) => void>();
    const page = {
      on: vi.fn((name: string, listener: (...args: never[]) => void) => {
        listeners.set(name, listener);
      }),
    } as unknown as Page;
    const diagnostics = registerCaptureDiagnostics(page);
    listeners.get('console')?.({
      type: () => 'error',
      text: () => `console ${signedUrl}`,
    } as never);
    listeners.get('pageerror')?.(new Error(`page ${signedUrl}`) as never);
    listeners.get('requestfailed')?.({
      method: () => 'GET',
      url: () => signedUrl,
      failure: () => ({ errorText: `network ${signedUrl}` }),
    } as never);
    listeners.get('response')?.({
      status: () => 403,
      url: () => signedUrl,
      request: () => ({ method: () => 'GET' }),
    } as never);
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).toContain('https://cdn.example.com/<redacted>');
    for (const secret of [
      'signed-user',
      'SECRET_PASSWORD',
      'SECRET_PATH',
      'SECRET_QUERY',
      'SECRET_FRAGMENT',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  test('keeps the item claim in an HttpOnly host cookie rather than a URL or referrer', () => {
    const claimToken = 'claim-token-0000000000000001';
    const cookies = publisherCaptureCookies(
      'https://publisher.example.com',
      claimToken,
      Date.now() + 30_000
    );
    const claimCookie = cookies.find((cookie) => cookie.value === claimToken);
    expect(claimCookie).toMatchObject({
      url: 'https://publisher.example.com',
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
    });
    expect(claimCookie).not.toHaveProperty('domain');
    expect(claimCookie?.url).not.toContain(claimToken);
  });

  test('closes the provider Browser session exactly once', async () => {
    const close = vi.fn(async () => {});
    const browser = { close } as unknown as Browser;
    const session = new PublisherBrowserSession(browser, 'https://publisher.example.com');

    await session.close();

    expect(close).toHaveBeenCalledOnce();
  });
});
