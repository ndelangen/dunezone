import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { observePublisherRequest } from './request-telemetry';

const identity = {
  GIT_SHA: 'a'.repeat(40),
  CF_VERSION_METADATA: { id: 'version-one', tag: 'release', timestamp: '2026-11-10T00:00:00Z' },
};
const request = new Request('https://dune.zone/published/factions/private-id/sheet.pdf?token=private-token', {
  headers: { 'CF-Ray': '0123456789abcdef-AMS', Authorization: 'Bearer private-header', Cookie: 'private-cookie' },
});

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('selective request telemetry', () => {
  test('leaves an unsampled response and its stream untouched while retaining application logs', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('document'));
        controller.close();
      },
    });
    const response = new Response(body, { headers: { ETag: 'original' } });
    const result = await observePublisherRequest(request, identity, async () => {
      console.log(JSON.stringify({ event: 'asset_publisher_cron', result: 'completed' }));
      return response;
    });
    expect(result).toBe(response);
    expect(result.bodyUsed).toBe(false);
    expect(result.headers.get('ETag')).toBe('original');
    await expect(result.text()).resolves.toBe('document');
    expect(console.log).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({ event: 'asset_publisher_cron', result: 'completed' })
    );
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  test.each([200, 302, 304])('samples a fast HTTP %i without recording request secrets', async (status) => {
    vi.mocked(Math.random).mockReturnValue(0.009);
    const response = new Response(null, { status });
    expect(await observePublisherRequest(request, identity, async () => response)).toBe(response);
    expect(console.log).toHaveBeenCalledOnce();
    const serialized = vi.mocked(console.log).mock.calls[0]![0] as string;
    expect(JSON.parse(serialized)).toEqual({
      event: 'publisher_request',
      reason: 'sample',
      method: 'GET',
      route: 'published',
      status,
      elapsedMs: 0,
      sampleRate: 0.01,
      rayId: '0123456789abcdef-AMS',
      gitSha: identity.GIT_SHA,
      workerVersionId: 'version-one',
    });
    expect(serialized).not.toContain('private');
  });

  test.each([400, 401, 403, 404, 429, 500, 503])(
    'keeps every HTTP %i even outside the success sample',
    async (status) => {
      await observePublisherRequest(request, identity, async () => new Response(null, { status }));
      const sink = status >= 500 ? console.error : console.warn;
      expect(sink).toHaveBeenCalledOnce();
      expect(JSON.parse(vi.mocked(sink).mock.calls[0]![0] as string)).toMatchObject({
        reason: 'http_error',
        status,
        sampleRate: 1,
      });
      expect(Math.random).not.toHaveBeenCalled();
    }
  );

  test.each([
    { elapsed: 999, logged: false },
    { elapsed: 1000, logged: true },
  ])('keeps slow responses at the threshold: $elapsed ms', async ({ elapsed, logged }) => {
    await observePublisherRequest(request, identity, async () => {
      vi.mocked(Date.now).mockReturnValue(1000 + elapsed);
      return new Response(null);
    });
    expect(console.warn).toHaveBeenCalledTimes(logged ? 1 : 0);
    if (logged) {
      expect(JSON.parse(vi.mocked(console.warn).mock.calls[0]![0] as string)).toMatchObject({
        reason: 'slow',
        elapsedMs: 1000,
        sampleRate: 1,
      });
      expect(Math.random).not.toHaveBeenCalled();
    }
  });

  test('logs a bounded exception graph and rethrows the original exception', async () => {
    const cause = new Error('R2 unavailable');
    const error = new Error('Read failed https://private.invalid/secret?token=secret', { cause });
    await expect(
      observePublisherRequest(request, identity, async () => {
        throw error;
      })
    ).rejects.toBe(error);
    const serialized = vi.mocked(console.error).mock.calls[0]![0] as string;
    expect(JSON.parse(serialized)).toMatchObject({
      reason: 'exception',
      sampleRate: 1,
      errors: [{ name: 'Error' }, { message: 'R2 unavailable' }],
    });
    expect(serialized).not.toContain('token=secret');
    expect(serialized).not.toContain('/secret');
    expect(Math.random).not.toHaveBeenCalled();
  });

  test.each([new Error('failed'), null, undefined])(
    'preserves any thrown value when the log sink fails: %s',
    async (error) => {
      vi.mocked(console.error).mockImplementation(() => {
        throw new Error('log sink failed');
      });
      await expect(
        observePublisherRequest(request, identity, async () => {
          throw error;
        })
      ).rejects.toBe(error);
    }
  );

  test('does not fail a response when logging fails or a request carries arbitrary path and ray data', async () => {
    const unknown = new Request('https://dune.zone/secret-name?token=secret', { headers: { 'CF-Ray': 'private-ray' } });
    const response = new Response(null, { status: 500 });
    expect(await observePublisherRequest(unknown, identity, async () => response)).toBe(response);
    expect(JSON.parse(vi.mocked(console.error).mock.calls[0]![0] as string)).toMatchObject({
      route: 'application',
      status: 500,
    });
    expect(vi.mocked(console.error).mock.calls[0]![0]).not.toContain('private-ray');
    vi.mocked(console.error).mockImplementation(() => {
      throw new Error('log sink failed');
    });
    expect(await observePublisherRequest(unknown, identity, async () => response)).toBe(response);
  });
});
