import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import { afterAll, expect, it } from 'vite-plus/test';

import { startCatalogueProxy } from './catalogue-proxy';
import { readMirror } from './mirror';

/* The tutorial's catalogue has the same answers a pulled mirror holds. */
const mirror = readMirror(path.join(import.meta.dirname, '../../src/app/routes/_app/tutorial/setup/catalogue.json'));

/* A stand-in backend that answers every query with its own path, so a forwarded call is easy to tell apart. */
const backend = createServer((request, response) => {
  let body = '';
  request.on('data', (chunk: Buffer) => (body += chunk.toString()));
  request.on('end', () => {
    const { path: name } = JSON.parse(body) as { path: string };
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: 'success', value: `backend:${name}`, logLines: [] }));
  });
});
await new Promise<void>((resolve) => backend.listen(0, '127.0.0.1', resolve));
const backendUrl = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`;
const proxy = await startCatalogueProxy({ mirror, backendUrl, localRulesetId: () => 'local-ruleset' });
const client = new ConvexHttpClient(proxy.url, { logger: false });

afterAll(async () => {
  await proxy.close();
  await new Promise((resolve) => backend.close(resolve));
});

it('answers the local ruleset from the mirror', async () => {
  const supply = (await client.query(anyApi.playCatalogue.rulesetSupply, { rulesetId: 'local-ruleset' })) as {
    ruleset: { name: string };
  };
  expect(supply.ruleset.name).toBe(mirror.ruleset.ruleset.name);
  const draftable = (await client.query(anyApi.playCatalogue.draftableFactions, { rulesetId: 'local-ruleset' })) as {
    factions: unknown[];
  };
  expect(draftable.factions).toHaveLength(mirror.factions.size);
});

it('answers mirrored factions and decks, with images under the local origin', async () => {
  const [id] = [...mirror.factions.keys()];
  const faction = (await client.query(anyApi.playCatalogue.factionDefinition, { factionId: id! })) as {
    token: string | null;
  };
  expect(faction.token).toMatch(/^\/published\//u);
  const [key] = [...mirror.assets.keys()];
  const [type, slug] = key!.split('/');
  expect(await client.query(anyApi.playCatalogue.assetSupply, { type: type!, slug: slug! })).not.toBeNull();
});

it('passes everything else to the backend', async () => {
  expect(await client.query(anyApi.playCatalogue.rulesetSupply, { rulesetId: 'another' })).toBe(
    'backend:playCatalogue:rulesetSupply'
  );
  expect(await client.query(anyApi.playAdmission.something, {})).toBe('backend:playAdmission:something');
});
