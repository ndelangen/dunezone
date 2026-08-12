import { describe, expect, test, vi } from 'vitest';

import {
  publisherErrorMessage,
  serializePublisherLogEvent,
} from '../../src/shared/asset-publishing/publisher-diagnostics';
import { PublisherHttpError, postJson, readBoundedJson, runWithDeadline } from './http';

describe('bounded Convex HTTP client', () => {
  test.each([
    'https://signed-user:SECRET_PASSWORD@cdn.example.com/private/SECRET_PATH/fetch?token=SECRET_QUERY#SECRET_FRAGMENT',
    '//signed-user:SECRET_PASSWORD@cdn.example.com/private/SECRET_PATH/fetch?token=SECRET_QUERY#SECRET_FRAGMENT',
    '`//signed-user:SECRET_PASSWORD@cdn.example.com/private/SECRET_PATH/fetch?token=SECRET_QUERY#SECRET_FRAGMENT`',
    '//signed-user:SECRET_PASSWORD@cdn.example.com/private/<REDACTED>/SECRET_PATH?token=SECRET_QUERY#SECRET_FRAGMENT',
  ])('redacts rejected fetcher messages before HTTP propagation: %s', async (signedUrl) => {
    const fetcher: typeof fetch = async () => {
      throw new Error(`Fetcher rejected ${signedUrl}`);
    };
    const error = await postJson('https://convex.example.com', 'token', {}, { fetcher }).catch(
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(PublisherHttpError);
    expect((error as Error).message).toContain('https://cdn.example.com/<redacted>');
    for (const secret of [
      'signed-user',
      'SECRET_PASSWORD',
      'SECRET_PATH',
      'SECRET_QUERY',
      'SECRET_FRAGMENT',
    ]) {
      expect((error as Error).message).not.toContain(secret);
    }
  });

  test('keeps one canonical marker through PublisherHttpError, conversion, and serialization', async () => {
    const signedUrl =
      '`//signed-user:SECRET_PASSWORD@cdn.example.com/private/SECRET_PATH/fetch?token=SECRET_QUERY#SECRET_FRAGMENT`';
    const fetcher: typeof fetch = async () => {
      throw new Error(`Fetcher rejected ${signedUrl}`);
    };
    const error = await postJson('https://convex.example.com', 'token', {}, { fetcher }).catch(
      (caught: unknown) => caught
    );
    const converted = publisherErrorMessage(error);
    const serialized = serializePublisherLogEvent({ error: converted });
    expect(JSON.parse(serialized)).toEqual({
      error: 'Publisher request failed: Fetcher rejected `https://cdn.example.com/<redacted>`',
    });
    expect(serialized.match(/<redacted>/g)).toHaveLength(1);
  });

  test.each([
    [503, true],
    [429, true],
    [400, false],
  ] as const)(
    'classifies HTTP %s before parsing its diagnostic body',
    async (status, transient) => {
      const fetcher: typeof fetch = async () => new Response('<html>not JSON</html>', { status });
      const error = await postJson('https://convex.example.com', 'token', {}, { fetcher }).catch(
        (caught: unknown) => caught
      );
      expect(error).toBeInstanceOf(PublisherHttpError);
      expect((error as PublisherHttpError).transient).toBe(transient);
    }
  );

  test('rejects a successful response above the actual streamed-byte limit', async () => {
    const response = new Response(JSON.stringify({ value: 'x'.repeat(100) }));
    await expect(readBoundedJson(response, 20)).rejects.toThrow(/size limit/);
  });

  test('an already-expired deadline rejects before fetch or helper work starts', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      postJson(
        'https://convex.example.com',
        'token',
        {},
        {
          fetcher,
          deadlineAt: 100,
          now: () => 100,
        }
      )
    ).rejects.toMatchObject({ transient: true });
    expect(fetcher).not.toHaveBeenCalled();

    const operation = vi.fn(async () => 'started');
    await expect(runWithDeadline(99, operation, () => 100)).rejects.toMatchObject({
      transient: true,
    });
    expect(operation).not.toHaveBeenCalled();
  });

  test('aborts a request whose response headers never resolve', async () => {
    const fetcher: typeof fetch = async () => await new Promise<Response>(() => {});
    const started = Date.now();
    await expect(
      postJson(
        'https://convex.example.com',
        'token',
        {},
        {
          fetcher,
          deadlineAt: started + 15,
        }
      )
    ).rejects.toMatchObject({ transient: true });
    expect(Date.now() - started).toBeLessThan(500);
  });

  test('aborts a successful response whose body never ends', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"ok":true'));
          },
        })
      );
    const started = Date.now();
    await expect(
      postJson(
        'https://convex.example.com',
        'token',
        {},
        {
          fetcher,
          deadlineAt: started + 15,
        }
      )
    ).rejects.toMatchObject({ transient: true });
    expect(Date.now() - started).toBeLessThan(500);
  });
});
