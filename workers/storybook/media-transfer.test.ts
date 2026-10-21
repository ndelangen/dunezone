import { createHash } from 'node:crypto';

import { afterEach, expect, test, vi } from 'vite-plus/test';

import worker from './index';

const bytes = new TextEncoder().encode('The complete published image bytes');
const digest = createHash('sha256').update(bytes).digest('hex');
const source = 'https://dune.zone/image/rulebook-cover/stone-circle-small.jpg';
const request = () => new Request(source.replace('dune.zone', 'storybook.dune.zone'));
const assets = { fetch: async () => new Response('unused') };

function interruptedResponse() {
  let chunks = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (chunks++ === 0) {
          controller.enqueue(bytes.subarray(0, 7));
        } else {
          controller.error(new Error('The upstream body connection dropped'));
        }
      },
    }),
    { headers: { 'Content-Type': 'image/jpeg', 'X-Media-SHA256': digest } }
  );
}

afterEach(() => vi.restoreAllMocks());

test('an interrupted raster resumes without duplicating the prefix already sent', async () => {
  const upstream = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(interruptedResponse())
    .mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes.subarray(0, 3));
            controller.enqueue(bytes.subarray(3, 6));
            controller.enqueue(bytes.subarray(6));
            controller.close();
          },
        }),
        { headers: { 'Content-Type': 'image/jpeg', 'X-Media-SHA256': digest } }
      )
    );

  const response = await worker.fetch(request(), { ASSETS: assets });

  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect(response.headers.get('X-Media-SHA256')).toBe(digest);
  expect(upstream).toHaveBeenCalledTimes(2);
  expect(upstream).toHaveBeenNthCalledWith(2, source, { method: 'GET' });
});

test('two interrupted transfers exhaust the existing single retry', async () => {
  const upstream = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(interruptedResponse())
    .mockResolvedValueOnce(interruptedResponse());

  const response = await worker.fetch(request(), { ASSETS: assets });

  await expect(response.arrayBuffer()).rejects.toThrow('upstream body connection dropped');
  expect(upstream).toHaveBeenCalledTimes(2);
});

test('a header failure and then a body failure share the same retry allowance', async () => {
  const upstream = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValueOnce(new Error('The upstream headers never arrived'))
    .mockResolvedValueOnce(interruptedResponse());

  const response = await worker.fetch(request(), { ASSETS: assets });

  await expect(response.arrayBuffer()).rejects.toThrow('upstream body connection dropped');
  expect(upstream).toHaveBeenCalledTimes(2);
});

test('a replacement with a different digest cannot be spliced into the original image', async () => {
  const upstream = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(interruptedResponse())
    .mockResolvedValueOnce(
      new Response(bytes, { headers: { 'Content-Type': 'image/jpeg', 'X-Media-SHA256': 'a-different-image' } })
    );

  const response = await worker.fetch(request(), { ASSETS: assets });

  await expect(response.arrayBuffer()).rejects.toThrow('changed during transfer');
  expect(upstream).toHaveBeenCalledTimes(2);
});

test('the first chunk streams before the source finishes and cancellation reaches the source', async () => {
  const cancel = vi.fn();
  const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.subarray(0, 7));
        },
        cancel,
      }),
      { headers: { 'Content-Type': 'image/jpeg', 'X-Media-SHA256': digest } }
    )
  );

  const response = await worker.fetch(request(), { ASSETS: assets });
  const reader = response.body!.getReader();

  expect(await reader.read()).toEqual({ done: false, value: bytes.subarray(0, 7) });
  await reader.cancel('The browser left the story');
  expect(cancel).toHaveBeenCalledWith('The browser left the story');
  expect(upstream).toHaveBeenCalledTimes(1);
});

test.each([
  { label: 'unidentified', headers: { 'Content-Type': 'image/jpeg' } },
  { label: 'encoded', headers: { 'Content-Type': 'image/jpeg', 'X-Media-SHA256': digest, 'Content-Encoding': 'gzip' } },
])('an interrupted $label response cannot be resumed by joining unverifiable bytes', async ({ headers }) => {
  const response = interruptedResponse();
  const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(response.body, { headers }));

  const forwarded = await worker.fetch(request(), { ASSETS: assets });

  await expect(forwarded.arrayBuffer()).rejects.toThrow('upstream body connection dropped');
  expect(upstream).toHaveBeenCalledTimes(1);
});
