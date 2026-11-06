import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { expect, it } from 'vite-plus/test';

import { resolveComponentDeliveryResponseSchema } from '../../src/shared/asset-publishing/componentPublication';
import { startExecutorProxy } from './catalogue-proxy';
import { MIRROR_COMPONENT_REVISION, mirroredLeaders } from './mirror';
import type { Mirror } from './mirror';

const leader = 'k17fybprvb614pr3r0bpy410q58a086q.fcd6c3b3-2f8e-42f8-8d1b-9eb24fdad094';
const mirror = {
  file: {
    pulledAt: '2026-11-05T20:00:00.000Z',
    media: [
      { path: `/published/leaders/${leader}/leader.jpg`, file: `media/leaders/${leader}/leader.jpg`, contentType: 'image/jpeg' },
      { path: '/published/round-tokens/ns76wk6vyqcnb1wfn8jb5ggya98cx6k7/token.jpg', file: 'media/t.jpg', contentType: 'image/jpeg' },
    ],
  },
} as unknown as Mirror;

it("says each mirrored Leader is published and sends every other executor call to the backend", async () => {
  expect(mirroredLeaders(mirror.file).map((entry) => entry.assetId)).toEqual([leader]);
  const site = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ forwarded: request.url }));
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  const proxy = await startExecutorProxy({ mirror, siteUrl: `http://127.0.0.1:${(site.address() as AddressInfo).port}` });
  const ask = async (assetId: string) =>
    (await fetch(`${proxy.url}/asset-publishing/executor/component/resolve-delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1, assetId, assetType: 'faction-leader' }),
    })).json();
  expect(resolveComponentDeliveryResponseSchema.parse(await ask(leader))).toMatchObject({
    status: 'found',
    revision: MIRROR_COMPONENT_REVISION,
  });
  expect(await ask('k17otherfaction00000000000000000.fcd6c3b3-2f8e-42f8-8d1b-9eb24fdad094')).toEqual({
    forwarded: '/asset-publishing/executor/component/resolve-delivery',
  });
  await proxy.close();
  await new Promise((resolve) => site.close(resolve));
});
