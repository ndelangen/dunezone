import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ConvexHttpClient } from 'convex/browser';

import { api } from '../convex/_generated/api';
import { assetSupplySchema, factionDefinitionSchema, rulesetSupplySchema } from '../src/shared/play/capture';
import { playDraftableFactionsSchema } from '../src/shared/play/drafting';
import { TUTORIAL_RECIPE } from '../src/shared/tutorial/recipe';

/*
 * Copies the tutorial's content from the public catalogue: the answers the game Worker reads when it creates the tutorial game.
 * Only public queries, the same ones a signed-out visitor's game reads; nothing is written anywhere but `catalogue.json`.
 * Usage: TUTORIAL_CONVEX_URL=<the site's Convex URL> bun run tutorial:pull
 */

const OUTPUT = path.join(import.meta.dirname, '../src/app/routes/_app/tutorial/setup/catalogue.json');

const url = process.env.TUTORIAL_CONVEX_URL;
if (!url) {
  throw new Error('Set TUTORIAL_CONVEX_URL to the Convex deployment whose public catalogue the tutorial copies.');
}
const client = new ConvexHttpClient(url);
const { ruleset } = TUTORIAL_RECIPE;
/* Each answer is checked as the Worker will read it, and kept exactly as the catalogue sent it, since the Worker parses it again. */
const checked = <Value>(schema: { parse: (value: unknown) => Value }, raw: unknown) => ({
  raw,
  value: schema.parse(raw),
});

const { raw: rulesetSupply, value: supply } = checked(
  rulesetSupplySchema.nullable(),
  await client.query(api.playCatalogue.rulesetSupply, { rulesetId: ruleset.id })
);
if (!supply || supply.ruleset.slug !== ruleset.slug) {
  throw new Error(`The catalogue has no ruleset ${ruleset.slug} at ${ruleset.id}.`);
}
const assets: Record<string, unknown> = {};
for (const { asset } of supply.slots) {
  const { raw, value } = checked(
    assetSupplySchema.nullable(),
    await client.query(api.playCatalogue.assetSupply, { type: asset.type, slug: asset.slug })
  );
  if (!value) {
    throw new Error(`The ruleset slots ${asset.type}/${asset.slug}, which the catalogue does not supply.`);
  }
  assets[`${asset.type}/${asset.slug}`] = raw;
}
const { raw: draftableFactions, value: draftable } = checked(
  playDraftableFactionsSchema,
  await client.query(api.playCatalogue.draftableFactions, { rulesetId: ruleset.id })
);
const factions: Record<string, unknown> = {};
for (const slug of TUTORIAL_RECIPE.factions) {
  const entry = draftable.factions.find((faction) => faction.slug === slug);
  if (!entry?.published) {
    throw new Error(`The faction ${slug} is not in the draft, or its token is not published.`);
  }
  factions[slug] = checked(
    factionDefinitionSchema,
    await client.query(api.playCatalogue.factionDefinition, { factionId: entry.id })
  ).raw;
}

await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(
  OUTPUT,
  `${JSON.stringify(
    {
      pulledFrom: new URL(url).hostname,
      pulledAt: new Date().toISOString(),
      rulesetSupply,
      assetSupply: assets,
      draftableFactions,
      factionDefinitions: factions,
    },
    null,
    2
  )}\n`
);
console.log(
  `Wrote ${path.relative(process.cwd(), OUTPUT)}: ${Object.keys(assets).length} slotted assets, ${Object.keys(factions).length} factions.`
);
