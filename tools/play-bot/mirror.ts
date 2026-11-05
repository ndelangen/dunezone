/*
 * A read-only copy of one ruleset's Play catalogue, as `bun run play:bot:pull` took it from the live site's public queries:
 * the same four answers the game Worker reads when it creates a game and deals factions, plus the published images they name.
 * A local game that answers from it plays with the real decks, factions, leaders and Traitors, under their real art.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { matchPublishedPath, publishedR2Key } from '../../src/shared/asset-publishing/publicationTargets';
import { assetSupplySchema, factionDefinitionSchema, rulesetSupplySchema } from '../../src/shared/play/capture';
import type { AssetSupply, RulesetSupply } from '../../src/shared/play/capture';
import { playDraftableFactionsSchema } from '../../src/shared/play/drafting';
import type { DraftFaction } from '../../src/shared/play/drafting';

export const mirrorFileSchema = z.object({
  pulledFrom: z.string(),
  /* The tutorial's catalogue (`bun run tutorial:pull`) has the same answers without the images, so both fields default. */
  mediaOrigin: z.string().url().default('https://dune.zone'),
  pulledAt: z.string(),
  /* Each answer is kept exactly as the catalogue sent it, since the Worker parses it again. */
  rulesetSupply: z.unknown(),
  assetSupply: z.record(z.string(), z.unknown()),
  draftableFactions: z.unknown(),
  factionDefinitions: z.record(z.string(), z.unknown()),
  /* Every published image the answers name, by its path under /published/, and the local file holding its bytes. */
  media: z.array(z.object({ path: z.string(), file: z.string(), contentType: z.string() })).default([]),
});
export type MirrorFile = z.infer<typeof mirrorFileSchema>;

export type Mirror = {
  file: MirrorFile;
  directory: string;
  ruleset: RulesetSupply;
  draftable: DraftFaction[];
  assets: Map<string, AssetSupply>;
  factions: Map<string, z.infer<typeof factionDefinitionSchema>>;
};

export const MIRROR_FILE = 'catalogue.json';
/** The ruleset's Rulebooks as Markdown, beside the catalogue. */
export const RULEBOOK_FILE = 'rulebook.md';

/** Every `/published/...` path a value names, without its cache buster: the images a game on this catalogue draws. */
export function publishedPaths(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (entry: unknown) => {
    if (typeof entry === 'string') {
      const match = /\/published\/[^"?\s]+/u.exec(entry);
      if (match && matchPublishedPath(match[0])) {
        found.add(match[0]);
      }
    } else if (Array.isArray(entry)) {
      entry.forEach(visit);
    } else if (entry && typeof entry === 'object') {
      Object.values(entry).forEach(visit);
    }
  };
  visit(value);
  return [...found].sort();
}

/** The local storage key a published path is served from, the same key the live site stores it under. */
export function publishedKey(publishedPath: string): string {
  const match = matchPublishedPath(publishedPath);
  if (!match) {
    throw new Error(`${publishedPath} is not a published image.`);
  }
  return publishedR2Key(match.assetType, match.assetId);
}

/** The answers name images on the site they came from; a local game serves the same paths from its own origin. */
function localImages<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value).replaceAll(/https?:\/\/[^/"]+\/published\//gu, '/published/')) as Value;
}

/**
 * Reads a mirror directory, or a catalogue file such as the tutorial's. The draft offers only factions the mirror can deal,
 * those it holds a definition for.
 */
export function readMirror(location: string): Mirror {
  const isFile = location.endsWith('.json');
  const directory = isFile ? path.dirname(location) : location;
  const parsed = mirrorFileSchema.parse(JSON.parse(readFileSync(isFile ? location : path.join(location, MIRROR_FILE), 'utf8')));
  const defined = new Set(
    Object.values(parsed.factionDefinitions).map((answer) => (answer as { faction: { id: string } }).faction.id)
  );
  const draftable = parsed.draftableFactions as { factions: { id: string }[] };
  const file = { ...parsed, draftableFactions: { ...draftable, factions: draftable.factions.filter((f) => defined.has(f.id)) } };
  const local = localImages(file);
  return {
    file,
    directory,
    ruleset: rulesetSupplySchema.parse(local.rulesetSupply),
    draftable: playDraftableFactionsSchema.parse(local.draftableFactions).factions,
    assets: new Map(Object.entries(local.assetSupply).map(([key, answer]) => [key, assetSupplySchema.parse(answer)])),
    factions: new Map(
      Object.values(local.factionDefinitions).map((answer) => {
        const definition = factionDefinitionSchema.parse(answer);
        return [definition.faction.id, definition];
      })
    ),
  };
}

/**
 * The raw answers the catalogue queries give for this mirror, keyed the way the Worker asks: `localRulesetId` stands in for
 * the mirrored ruleset, since a local game is created on a ruleset the local backend holds.
 * Returns undefined for a question the mirror does not answer, which then goes to the local backend.
 */
export function mirrorAnswer(mirror: Mirror, localRulesetId: string, name: string, args: Record<string, unknown>) {
  const raw = localImages(mirror.file);
  const supply = raw.rulesetSupply as { ruleset: { id: string } };
  const isRuleset = (id: unknown) => id === localRulesetId || id === supply.ruleset.id;
  switch (name) {
    case 'playCatalogue:rulesetSupply':
      return isRuleset(args.rulesetId) ? raw.rulesetSupply : undefined;
    case 'playCatalogue:draftableFactions':
      return isRuleset(args.rulesetId) ? raw.draftableFactions : undefined;
    case 'playCatalogue:factionDefinition':
      return Object.values(raw.factionDefinitions).find(
        (answer) => (answer as { faction: { id: string } }).faction.id === args.factionId
      );
    case 'playCatalogue:assetSupply':
      return raw.assetSupply[`${String(args.type)}/${String(args.slug)}`] ?? undefined;
    default:
      return undefined;
  }
}
