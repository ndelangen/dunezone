/* Refresh only public prototype fixtures; no mutation or authenticated reads. */
import { writeFile } from 'node:fs/promises';

import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';

const client = new ConvexHttpClient('https://exuberant-finch-263.eu-west-1.convex.cloud');
const query = (name: string, args: Record<string, string>) => client.query(makeFunctionReference<'query'>(name), args);
const { faction } = await query('factions:getBySlug', { slug: 'test-faction' });
const { recent } = await query('assets:cataloguePage', {});
const targets = [
  ['card', 'small-shirt', 'Treachery card'],
  ['round', 'water', 'Disc token'],
  ['landscape', 'immunity', 'Enhancement token'],
  ['deck', 'dreamrules-spice-deck', 'Deck'],
  ['bundle', 'gf9-techtokens', 'Token bundle'],
];
const cases = [
  {
    id: 'faction',
    name: faction.data.name,
    kind: 'Faction',
    type: 'faction',
    shape: 'round',
    text: faction.data.rules.advantages[0].text,
    textSource: 'First advantage',
    source: `https://dune.zone/factions/${faction.slug}`,
    remoteArtwork: `https://dune.zone/published/faction-tokens/${faction._id}/token.jpg`,
  },
];
for (const [id, slug, kind] of targets) {
  const row = recent.find((r: { slug: string }) => r.slug === slug);
  if (!row) throw new Error(`Missing public example: ${slug}`);
  cases.push({
    id,
    name: row.name,
    kind,
    type: row.type,
    shape: id === 'round' ? 'round' : id === 'landscape' ? 'landscape' : 'portrait',
    text: row.data.about ?? '',
    textSource: 'About',
    source: `https://dune.zone/assets/${row.type}/${row.slug}`,
    remoteArtwork: row.previewHref ? new URL(row.previewHref, 'https://dune.zone').href : '',
  });
}
const fixtures = [];
for (const item of cases) {
  let artwork = '';
  if (item.remoteArtwork) {
    const r = await fetch(item.remoteArtwork);
    if (!r.ok || !r.headers.get('content-type')?.startsWith('image/'))
      throw new Error(`Artwork unavailable: ${item.id}`);
    artwork = `/art/${item.id}.jpg`;
    await writeFile(new URL(`./public${artwork}`, import.meta.url).pathname, Buffer.from(await r.arrayBuffer()));
  }
  fixtures.push({
    ...item,
    artwork,
    note:
      item.id === 'faction'
        ? 'Public Test Faction, matching the earlier spike.'
        : 'Public catalogue example. Empty About remains empty.',
  });
}
fixtures.push(
  {
    ...fixtures[0],
    id: 'long',
    name: 'The Confederation of the Outer Worlds and the Houses Beyond the Great Spice Sea',
    text: 'During the revival phase, count every turn without a leader death, then take that much spice. This deliberately long passage continues beyond the excerpt limit to show how the card cuts text without shrinking every letter until it becomes unreadable. Extra words make the clipping visible.',
    note: 'Synthetic long title and excerpt on real faction artwork. Not saved to the faction.',
  },
  {
    ...fixtures[1],
    id: 'glyphs',
    name: 'Écuyers de Muad’Dib & House Ørnen',
    text: 'Arrakis • café • naïve • 10% • “spice” • Æsir • ©',
    note: 'Synthetic Latin glyph and punctuation check on real card artwork.',
  },
  {
    ...fixtures[0],
    id: 'missing',
    artwork: '',
    remoteArtwork: '',
    text: '',
    note: 'Synthetic unavailable artwork and empty excerpt. No placeholder publication is created.',
  }
);
await writeFile(
  new URL('./public/fixtures.json', import.meta.url).pathname,
  JSON.stringify({ capturedAt: new Date().toISOString(), fixtures }, null, 2)
);
console.log(`Prepared ${fixtures.length} public and marked synthetic examples.`);
