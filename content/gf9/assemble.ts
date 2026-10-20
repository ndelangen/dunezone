import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { contentImportPackageSchema, validateImportData } from '../../src/shared/contentImports/package';
import type { ContentImportItem } from '../../src/shared/contentImports/package';
import { recalculateFactionComplexity } from '../../src/shared/factions/complexity';
import { FactionWriteSchema } from '../../src/shared/factions/schema';
import type { FactionInput } from '../../src/shared/factions/schema';

const directory = import.meta.dirname;
const assets = contentImportPackageSchema.parse(await Bun.file(path.join(directory, 'assets-package.json')).json());
const books = contentImportPackageSchema.parse(await Bun.file(path.join(directory, 'rulebooks-package.json')).json());
const base = (await Bun.file(path.join(directory, 'base-factions.json')).json()) as FactionInput[];
type Draft = {
  key: string;
  name: string;
  logo: FactionInput['logo'];
  themeColor: string;
  factionLeader: { name: string; image?: FactionInput['factionLeader']['image'] };
  leaders: (FactionInput['leaders'][number] & { applicability?: string })[];
  troops: FactionInput['troops'];
  rules: FactionInput['rules'];
  extras: string[];
};
const expansion = (await Bun.file(path.join(directory, 'expansion-factions.json')).json()).factions as Draft[];
const leaderLabels = (await Bun.file(path.join(directory, 'leader-labels.json')).json()).leaders as {
  faction: string;
  sourceName: string;
  displayName: string;
}[];
const usedLeaderLabels = new Set<(typeof leaderLabels)[number]>();

function leaderNameForPrint(faction: string, sourceName: string) {
  const label = leaderLabels.find((entry) => entry.faction === faction && entry.sourceName === sourceName);
  if (!label) {
    return sourceName;
  }
  usedLeaderLabels.add(label);
  return label.displayName;
}

const assetByKey = new Map(assets.items.map((item) => [item.key, item]));
const extrasAliases: Record<string, string> = {
  'hidden-mobile-stronghold': 'gf9-mobile-stronghold-token',
  'gf9-inflation-token': 'gf9-inflation-tokens',
};

function componentId(key: string) {
  const hex = createHash('sha256').update(`dunezone-gf9:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
function extrasFor(keys: string[], bindings: NonNullable<ContentImportItem['bindings']>) {
  return keys.map((raw, index) => {
    const key = extrasAliases[raw] ?? raw;
    const asset = assetByKey.get(key);
    if (!asset || asset.kind !== 'asset') {
      throw new Error(`Missing faction extra ${key}`);
    }
    bindings.push({ path: ['extras', String(index), 'slug'], key, field: 'slug' });
    return { type: asset.type, slug: asset.existing?.slug ?? slug((asset.data as { name: string }).name) };
  });
}

const factions: ContentImportItem[] = base.map((faction) => {
  const key = slug(faction.name);
  const bindings: NonNullable<ContentImportItem['bindings']> = [];
  const extraKeys =
    key === 'gf9-atreides'
      ? ['gf9-kwisatz-haderach-tokens', 'gf9-kwisatz-haderach-reference']
      : key === 'gf9-bene-gesserit'
        ? ['gf9-prediction-faction-deck', 'gf9-prediction-turn-deck']
        : [];
  const data = FactionWriteSchema.parse({
    ...faction,
    leaders: faction.leaders.map((leader) => ({ ...leader, name: leaderNameForPrint(key, leader.name) })),
    extras: extrasFor(extraKeys, bindings),
  });
  return { key, kind: 'faction', data, bindings, link: true };
});
const portraitNotes = [];
for (const draft of expansion) {
  const bindings: NonNullable<ContentImportItem['bindings']> = [];
  const portrait = draft.factionLeader.image ?? '/image/leader/ilya/cheap-hero.png';
  if (!draft.factionLeader.image) {
    portraitNotes.push({
      faction: draft.key,
      character: draft.factionLeader.name,
      image: portrait,
      note: 'Existing anonymous leader illustration. This is representative artwork, not an official portrait of the named character.',
    });
  }
  const input = {
    name: draft.name,
    logo: draft.logo,
    background: {
      image: '/image/texture/082.jpg',
      colors: [draft.themeColor, '#252527'],
      invert: false,
      definition: 0.5,
      influence: 0.65,
    },
    themeColor: draft.themeColor,
    colors: [
      draft.key === 'gf9-choam'
        ? 'Brown'
        : draft.key === 'gf9-ecaz'
          ? 'Purple'
          : draft.key === 'gf9-moritani'
            ? 'Teal'
            : draft.key === 'gf9-tleilaxu'
              ? 'Purple'
              : 'White',
    ],
    factionLeader: { name: draft.factionLeader.name, image: portrait, memberId: componentId(`${draft.key}:ruler`) },
    leaders: draft.leaders.map(({ applicability: _applicability, ...leader }) => ({
      ...leader,
      name: leaderNameForPrint(draft.key, leader.name),
      memberId: componentId(`${draft.key}:leader:${leader.name}`),
    })),
    troops: draft.troops.map((troop) => ({ ...troop, troopId: componentId(`${draft.key}:troop:${troop.name}`) })),
    decals: [],
    planet: [],
    rules: { ...draft.rules, fate: { ...draft.rules.fate, label: 'karama' as const } },
    extras: extrasFor(draft.extras, bindings),
  };
  const data = FactionWriteSchema.parse(recalculateFactionComplexity(input));
  factions.push({ key: draft.key, kind: 'faction', data, bindings, link: true });
}
for (const label of leaderLabels) {
  if (!usedLeaderLabels.has(label)) {
    throw new Error(`Unused leader label for ${label.faction}: ${label.sourceName}`);
  }
}

const factionSupplies = new Set(factions.flatMap((item) => item.bindings?.map((binding) => binding.key) ?? []));
const curatedAssets = assets.items.map((item) => {
  if (
    item.kind === 'asset' &&
    factionSupplies.has(item.key) &&
    (item.slot === 'custom' || item.slot === 'customTokens')
  ) {
    const { slot: _slot, ...supply } = item;
    return supply;
  }
  return item;
});
const bookOrder = ['core-rules', 'ixian-tleilaxu-rules', 'choam-richese-rules', 'ecaz-moritani-rules'];
const orderedBooks = [...books.items].sort((left, right) => bookOrder.indexOf(left.key) - bookOrder.indexOf(right.key));
const bundle = contentImportPackageSchema.parse({
  format: 'dunezone-package',
  version: 1,
  packageKey: 'gf9',
  items: [...curatedAssets, ...factions, ...orderedBooks],
});
for (const item of bundle.items) {
  validateImportData(item, item.data);
}
if (factions.length !== 12) {
  throw new Error('GF9 requires twelve factions.');
}
for (const item of factions) {
  const data = FactionWriteSchema.parse(item.data);
  if (data.troops.reduce((sum, troop) => sum + troop.count, 0) !== 20) {
    throw new Error(`${data.name} must have twenty troops.`);
  }
}
await writeFile(path.join(directory, 'package.json'), JSON.stringify(bundle, null, 2) + '\n');
await writeFile(path.join(directory, 'portrait-provenance.json'), JSON.stringify(portraitNotes, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      items: bundle.items.length,
      assets: assets.items.length,
      factions: factions.length,
      rulebooks: orderedBooks.length,
      bytes: Buffer.byteLength(JSON.stringify(bundle)),
      factionSupplies: [...factionSupplies],
    },
    null,
    2
  )
);
