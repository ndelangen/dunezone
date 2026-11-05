/*
 * Copies one ruleset's Play catalogue from the live site for a local game against the bot: the answers the game Worker
 * reads when it creates a game and deals factions, and every published image those answers name.
 * It uses only public queries and public image addresses, the same ones a signed-out visitor's game reads, and writes nothing anywhere but here.
 *
 *   bun run play:bot:pull                       # the GF9 ruleset
 *   bun run play:bot:pull -- --ruleset <slug>   # another ruleset
 *
 * Options: --convex-url (the site's Convex deployment), --media-origin (where its images are served), --out (a directory),
 * --require (factions the copy must be able to deal; Fremen, Harkonnen and Emperor by default).
 * The copy lands in tools/play-bot/out/mirror/<slug>/; `bun run play:bot:stack -- --mirror <that directory>` plays on it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import type { FunctionReference } from 'convex/server';

import { assetSupplySchema, factionDefinitionSchema, rulesetSupplySchema } from '../../src/shared/play/capture';
import { playDraftableFactionsSchema } from '../../src/shared/play/drafting';
import { MIRROR_FILE, publishedKey, publishedPaths } from './mirror';
import type { MirrorFile } from './mirror';

const { values } = parseArgs({
  options: {
    ruleset: { type: 'string', default: 'gf9' },
    'convex-url': { type: 'string', default: 'https://exuberant-finch-263.eu-west-1.convex.cloud' },
    'media-origin': { type: 'string', default: 'https://dune.zone' },
    out: { type: 'string' },
    require: { type: 'string', default: 'fremen,harkonnen,emperor' },
  },
});
const slug = values.ruleset!;
const directory = path.resolve(values.out ?? path.join(import.meta.dirname, 'out/mirror', slug));
const client = new ConvexHttpClient(values['convex-url']!, { logger: false });

/* Each answer is checked as the Worker will read it, and kept exactly as the catalogue sent it. */
async function checked<Value>(schema: { parse: (value: unknown) => Value }, name: string, args: Record<string, unknown>) {
  const [module, fn] = name.split(':') as [string, string];
  const query = (anyApi as unknown as Record<string, Record<string, FunctionReference<'query'>>>)[module]![fn]!;
  const raw: unknown = await client.query(query, args);
  return { raw, value: schema.parse(raw) };
}

const page = (await client.query(anyApi.rulesets.page, { slug })) as { ruleset?: { _id: string; name: string } } | null;
const rulesetId = page?.ruleset?._id;
if (!rulesetId) {
  throw new Error(`The site has no ruleset at /rulesets/${slug}.`);
}
console.log(`Copying ${page.ruleset!.name} (${rulesetId}) from ${values['convex-url']}...`);

const ruleset = await checked(rulesetSupplySchema.nullable(), 'playCatalogue:rulesetSupply', { rulesetId });
if (!ruleset.value) {
  throw new Error(`The catalogue does not supply the ruleset ${slug}.`);
}
const assetSupply: Record<string, unknown> = {};
async function pullAsset(type: string, assetSlug: string) {
  const key = `${type}/${assetSlug}`;
  if (key in assetSupply) {
    return;
  }
  const { raw, value } = await checked(assetSupplySchema.nullable(), 'playCatalogue:assetSupply', {
    type,
    slug: assetSlug,
  });
  if (!value) {
    throw new Error(`The catalogue does not supply ${key}.`);
  }
  assetSupply[key] = raw;
}
for (const { asset } of ruleset.value.slots) {
  await pullAsset(asset.type, asset.slug);
}

/* Only the ruleset's own factions are kept, so the local draft offers exactly what this ruleset plays with. */
const draftable = await checked(playDraftableFactionsSchema, 'playCatalogue:draftableFactions', { rulesetId });
const linked = draftable.value.factions.filter((faction) => faction.linked && faction.published);
/* A copy that cannot deal the factions a game needs is refused here, not at the table. */
const { namesFaction } = await import('./lobby');
const absent = (values.require ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter((name) => name && !linked.some((faction) => namesFaction(faction.name, name)));
if (absent.length) {
  throw new Error(
    `${page.ruleset!.name} has no published ${absent.join(', ')}. Its factions: ${linked.map((faction) => faction.name).join(', ')}.`
  );
}
for (const slot of ['treachery', 'spice'] as const) {
  if (!ruleset.value.slots.some((entry) => entry.slot === slot)) {
    throw new Error(`${page.ruleset!.name} has no ${slot} deck in its slots, so a game on it could not start.`);
  }
}
const kept = new Set(linked.map((faction) => faction.id));
const draftableFactions = {
  ...(draftable.raw as { factions: { id: string }[] }),
  factions: (draftable.raw as { factions: { id: string }[] }).factions.filter((faction) => kept.has(faction.id)),
};
const factionDefinitions: Record<string, unknown> = {};
for (const faction of linked) {
  const { raw, value } = await checked(factionDefinitionSchema, 'playCatalogue:factionDefinition', {
    factionId: faction.id,
  });
  factionDefinitions[faction.slug] = raw;
  /* A faction's Extras are captured with it, so they come along too. */
  for (const extra of (value.data as { extras?: { type: string; slug: string }[] } | null)?.extras ?? []) {
    await pullAsset(extra.type, extra.slug);
  }
}

/* Every leader of a required faction needs a published Traitor card, or setup deals a short Traitor deck. */
const unpublished: string[] = [];
for (const faction of linked.filter((entry) => (values.require ?? '').split(',').some((name) => name && namesFaction(entry.name, name.trim())))) {
  const answer = factionDefinitionSchema.parse(factionDefinitions[faction.slug]);
  const missingTraitors = (answer.traitors ?? []).filter((traitor) => !traitor.front).length;
  const missingLeaders = answer.leaders.filter((leader) => !leader.front).length;
  if (!answer.token || missingTraitors || missingLeaders) {
    unpublished.push(`${faction.name}: ${[!answer.token && 'token', missingLeaders && `${missingLeaders} leaders`, missingTraitors && `${missingTraitors} Traitor cards`].filter(Boolean).join(', ')} unpublished`);
  }
}
if (unpublished.length) {
  console.warn(`Warning, some faces are not published on the site:\n  ${unpublished.join('\n  ')}`);
}

const answers = { rulesetSupply: ruleset.raw, assetSupply, draftableFactions, factionDefinitions };
const media: MirrorFile['media'] = [];
const mediaDirectory = path.join(directory, 'media');
mkdirSync(mediaDirectory, { recursive: true });
const paths = publishedPaths(answers);
console.log(`Downloading ${paths.length} images from ${values['media-origin']}...`);
const missing: string[] = [];
for (const publishedPath of paths) {
  const response = await fetch(new URL(publishedPath, values['media-origin']));
  if (!response.ok) {
    missing.push(`${publishedPath} (${response.status})`);
    continue;
  }
  const file = path.join('media', publishedKey(publishedPath));
  mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
  writeFileSync(path.join(directory, file), Buffer.from(await response.arrayBuffer()));
  media.push({
    path: publishedPath,
    file,
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
  });
}

const mirror: MirrorFile = {
  pulledFrom: new URL(values['convex-url']!).hostname,
  mediaOrigin: values['media-origin']!,
  pulledAt: new Date().toISOString(),
  ...answers,
  media,
};
writeFileSync(path.join(directory, MIRROR_FILE), `${JSON.stringify(mirror, null, 2)}\n`);
console.log(
  [
    `Wrote ${directory}:`,
    `  ${Object.keys(assetSupply).length} decks and bundles, ${linked.length} factions (${linked.map((faction) => faction.name).join(', ')}),`,
    `  ${media.length} images${missing.length ? `; ${missing.length} could not be downloaded:\n    ${missing.join('\n    ')}` : '.'}`,
  ].join('\n')
);
