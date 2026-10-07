import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ConvexHttpClient } from 'convex/browser';
import { getFunctionName, makeFunctionReference } from 'convex/server';
import type { DefaultFunctionArgs, FunctionArgs, FunctionReference } from 'convex/server';

import { api, internal } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { playGameNameVocabulary } from '../convex/lib/playGameNames';
import { publishingSpiceCard } from '../src/shared/assets/fixtures/publishingSpiceCard';
import { normalizePlayGameSlug } from '../src/shared/play/gameNames';
import { createLocalDevelopmentInstance, localDevelopmentEnvironmentOverrides } from './local-dev-instance';
import {
  backendUp,
  commandEnvironment,
  composeDown,
  configureLocalAuth,
  localApplicationEnvironment,
  pushCode,
} from './provision';

/** The HTTP transport carries admin authorization; the SDK's public-reference type alone does not model it. */
function httpReference<Type extends 'query' | 'mutation', Args extends DefaultFunctionArgs, Result>(
  reference: FunctionReference<Type, 'internal', Args, Result>
) {
  return makeFunctionReference<Type, Args, Result>(getFunctionName(reference));
}

/** Admin impersonation stays inside this disposable backend and never authenticates a hosted request. */
function localClient(url: string, adminKey: string, subject?: string) {
  assert.equal(new URL(url).hostname, '127.0.0.1');
  const identity = subject
    ? Buffer.from(JSON.stringify({ subject, issuer: 'address-proof' })).toString('base64')
    : null;
  return new ConvexHttpClient(url, {
    logger: false,
    fetch: Object.assign(
      (input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]) => {
        assert.equal(new URL(input instanceof Request ? input.url : input).origin, url);
        const headers = new Headers(init?.headers);
        const credentials = identity ? `${adminKey}:${identity}` : adminKey;
        headers.set('Authorization', `Convex ${credentials}`);
        return fetch(input, { ...init, headers });
      },
      { preconnect: fetch.preconnect }
    ),
  });
}

/** The allocation cases share one fresh catalogue and independently issued requests. */
async function proveAllocation(
  admin: ConvexHttpClient,
  viewers: ConvexHttpClient[],
  request: FunctionArgs<typeof api.playGames.createGame>,
  absentGameId: Id<'play_games'>
) {
  async function named(client: ConvexHttpClient, name: string): Promise<Id<'play_games'>> {
    const result = await client.mutation(httpReference(internal.playGames.createNamedGame), { ...request, name });
    assert(result.ok, `Creation refused: ${JSON.stringify(result)}`);
    return result.gameId;
  }
  const gameIds: Id<'play_games'>[] = [];
  for (let round = 0; round < 2; round += 1) {
    /* A separate HTTP client per request prevents the SDK's per-client mutation queue from serializing this proof. */
    const batch = await Promise.all(viewers.map((viewer) => named(viewer, 'Arrakeen surprise party')));
    gameIds.push(...batch);
  }
  const simultaneous = await admin.query(httpReference(internal.playGameNamesTesting.inspect), { gameIds });
  assert.equal(new Set(simultaneous.map(({ slug }) => slug)).size, 16);
  assert(simultaneous.every(({ name }) => name === 'Arrakeen surprise party'));
  const expected = Array.from({ length: 16 }, (_, suffix) =>
    suffix ? `arrakeen-surprise-party-${suffix.toString(36)}` : 'arrakeen-surprise-party'
  );
  const actual = simultaneous.map(({ slug }) => slug!);
  actual.sort((a, b) => a.localeCompare(b));
  expected.sort((a, b) => a.localeCompare(b));
  assert.deepEqual(actual, expected);
  console.log(
    'PASS: two simultaneous batches of eight creations committed 16 distinct addresses with one display name.'
  );

  const existingId = gameIds[0]!;
  const existingNamedId = await named(viewers[0]!, existingId);
  const absentNamedId = await named(viewers[1]!, absentGameId);
  const legacy = await admin.query(httpReference(internal.playGameNamesTesting.inspect), {
    gameIds: [existingId, absentGameId, existingNamedId, absentNamedId],
  });
  assert(legacy[0]!.legacyToken && legacy[1]!.legacyToken);
  assert.equal(legacy[1]!.name, undefined);
  assert.equal(legacy[2]!.slug, `${existingId}-1`);
  assert.equal(legacy[3]!.slug, `${absentGameId}-1`);
  assert.equal(legacy[2]!.name, existingId);
  assert.equal(legacy[3]!.name, absentGameId);
  console.log('PASS: an existing legacy game ID and an accepted ID token without a record both received -1.');

  const generatedIds = await Promise.all(
    viewers.slice(2).map(async (viewer) => {
      const result = await viewer.mutation(api.playGames.createGame, request);
      assert(result.ok);
      return result.gameId;
    })
  );
  const generated = await admin.query(httpReference(internal.playGameNamesTesting.inspect), {
    gameIds: generatedIds,
  });
  const vocabulary = new Set(playGameNameVocabulary().map(({ name }) => name));
  assert(generated.every(({ name, slug }) => vocabulary.has(name!) && slug?.startsWith(normalizePlayGameSlug(name!))));
  console.log('PASS: six legacy creation requests kept their response shape and received reviewed names.');
  console.log(JSON.stringify({ simultaneous, legacy, generated }, null, 2));
}

/** The existing Asset counter adapter faces the same independent HTTP contention as Play. */
async function proveCounterAllocation(viewers: ConvexHttpClient[]) {
  const allocated = [];
  for (let round = 0; round < 4; round += 1) {
    allocated.push(
      ...(await Promise.all(
        viewers.slice(0, 4).map((viewer) =>
          viewer.mutation(api.assets.create, {
            type: 'card-spice',
            data: { ...publishingSpiceCard, name: 'Shared suffix proof' },
          })
        )
      ))
    );
  }
  assert.equal(new Set(allocated.map(({ slug }) => slug)).size, 16);
  assert.deepEqual(
    allocated.map(({ slug }) => slug).sort(),
    Array.from({ length: 16 }, (_, suffix) =>
      suffix ? `shared-suffix-proof-${suffix.toString(36)}` : 'shared-suffix-proof'
    ).sort()
  );
  const legacy = allocated[0]!;
  const saved = await viewers[0]!.mutation(api.assets.update, {
    id: legacy.id,
    data: { ...publishingSpiceCard, name: 'Shared suffix proof!' },
  });
  assert.equal(saved.slug, legacy.slug);
  console.log(
    'PASS: the common counter adapter committed 16 distinct Asset addresses and preserved a spelling-only save.'
  );
  console.log(JSON.stringify({ assets: allocated, saved }, null, 2));
}

async function proveRecovery(
  admin: ConvexHttpClient,
  viewers: ConvexHttpClient[],
  request: FunctionArgs<typeof api.playGames.createGame>
) {
  await admin.mutation(httpReference(internal.slugAllocationTesting.seedDense), {});
  const results = await Promise.all(
    viewers.map((viewer) =>
      viewer.mutation(httpReference(internal.playGames.createNamedGame), {
        ...request,
        name: 'Caladan dense picnic',
      })
    )
  );
  const gameIds = results.map((result) => {
    assert(result.ok);
    return result.gameId;
  });
  const dense = await admin.query(httpReference(internal.playGameNamesTesting.inspect), { gameIds });
  assert.equal(new Set(dense.map(({ slug }) => slug)).size, 8);
  assert(
    dense.every(
      ({ slug, name }) => /^caladan-dense-picnic-[a-z0-9]{13}$/.test(slug!) && name === 'Caladan dense picnic'
    )
  );
  const policy = await admin.mutation(httpReference(internal.slugAllocationTesting.policySelection), {});
  assert.equal(policy.word, 'policy-dinner-bae');
  assert.match(policy.window, /^policy-window-[a-z0-9]{13}$/);
  console.log(
    'PASS: eight simultaneous creations recovered a dense out-of-order window; server policy skipped a rejected counter word and a full window.'
  );
  console.log(JSON.stringify({ dense, policy }, null, 2));
}

async function main() {
  const instance = createLocalDevelopmentInstance({});
  const environment = commandEnvironment(
    localApplicationEnvironment(process.env),
    localDevelopmentEnvironmentOverrides(instance)
  );
  const directory = mkdtempSync(path.join(tmpdir(), 'dunezone-game-addresses-'));
  try {
    console.log(`Creating disposable address-proof backend ${instance.composeProjectName}.`);
    const deployment = await backendUp(environment, { url: instance.backendUrl });
    configureLocalAuth(deployment, environment, { siteUrl: instance.appUrl, artifactsDirectory: directory });
    pushCode(deployment, environment);
    const admin = localClient(deployment.url, deployment.adminKey);
    const { rulesetId } = await admin.mutation(httpReference(internal.playTesting.seedRealGameCatalogue), {});
    const { subjects, absentGameId } = await admin.mutation(httpReference(internal.playGameNamesTesting.seed), {});
    const viewers = subjects.map((subject) => localClient(deployment.url, deployment.adminKey, subject));
    const request = { rulesetId, minimumPlayers: 4 as const };
    await proveAllocation(admin, viewers, request, absentGameId);
    await proveCounterAllocation(viewers);
    const fresh = await admin.mutation(httpReference(internal.playGameNamesTesting.seed), {});
    await proveRecovery(
      admin,
      fresh.subjects.map((subject) => localClient(deployment.url, deployment.adminKey, subject)),
      request
    );
  } finally {
    try {
      composeDown(environment);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    console.log('Removed the proof backend, its volume and temporary credentials.');
  }
}

await main();
