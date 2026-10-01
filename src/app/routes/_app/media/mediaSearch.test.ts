import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import metadata from './media-index.json';
import { mediaEntries, catalogueEntries, validateMediaSearch } from './mediaCatalogue';
import { mediaLocation, mediaPathSearch, validateMediaQuery } from './mediaNavigation';
import { filterCatalogue, searchMedia } from './mediaSearch';
import { mediaSubjects } from './mediaSubjects';

const paths = (query: string) => searchMedia(query).map((entry) => entry.value);
const search = (input: Record<string, unknown>) => filterCatalogue(validateMediaSearch(input));

describe('media search index', () => {
  test('covers every source image and vector, with descriptions tied to the reviewed bytes', () => {
    const files = readdirSync('media', { recursive: true })
      .map(String)
      .filter((file) => /\.(svg|png|jpe?g|pdf)$/i.test(file))
      .map((file) => `/${file}`);
    expect(Object.keys(metadata).sort()).toEqual(files.sort());
    expect(mediaEntries.map((entry) => entry.value).sort()).toEqual(files.sort());
    const knownSubjects = new Set<string>(mediaSubjects.map((subject) => subject.value));
    for (const [path, item] of Object.entries(metadata)) {
      expect(item.description.trim().length, path).toBeGreaterThan(0);
      expect(item.tags.length, path).toBeGreaterThan(0);
      expect(item.subjects.length, path).toBeGreaterThan(0);
      expect(
        item.subjects.every((subject) => knownSubjects.has(subject)),
        path
      ).toBe(true);
      expect(new Set(item.subjects).size, path).toBe(item.subjects.length);
      expect(
        createHash('sha256')
          .update(readFileSync(`media${path}`))
          .digest('hex'),
        `Review changed artwork: ${path}`
      ).toBe(item.sourceHash);
    }
  });

  test('finds visible subjects without knowing the card title', () => {
    expect(paths('dagger')).toContain('/vector/decal/extortion.svg');
    expect(paths('building')).toContain('/vector/decal/choam-share.svg');
    expect(paths('hooded sniper')).toContain('/vector/troop/needle-sniper.svg');
    expect(paths('person carrying water')).toContain('/vector/troop/water-keeper.svg');
    expect(paths('white marble').some((path) => path.startsWith('/image/texture/'))).toBe(false);
    expect(paths('black hole')).toContain('/image/planet/non-spheres/the-quiet-maw.png');
    expect(paths('sandworm moon').some((path) => path.startsWith('/image/rulebook-cover/'))).toBe(true);
  });

  test('matches all words in either order, normalizes punctuation and spelling variants', () => {
    expect(paths('crossed knives')).toEqual(paths('knives crossed'));
    expect(paths('crossed knives')).toContain('/vector/logo/fremen.svg');
    expect(paths('crossed knife')).toEqual(paths('crossed knives'));
    expect(paths('syringe')).toContain('/vector/decal/suringe.svg');
    expect(paths('BÉNE-GESSERIT')).toEqual(paths('bene gesserit'));
    expect(paths('/vector/decal/extortion.svg')[0]).toBe('/vector/decal/extortion.svg');
  });

  test('ranks exact titles first without matching every sibling in a collection', () => {
    expect(searchMedia('Fremen')[0]?.label).toBe('Fremen');
    expect(searchMedia('Duncan').map((entry) => entry.label)).toEqual(['Duncan']);
    expect(paths('dagger')).not.toContain('/vector/decal/whip.svg');
    expect(searchMedia('no-such-artwork-zqx')).toEqual([]);
  });

  test('matches misspellings within the selected facets and labels entirely approximate results', () => {
    const result = search({ q: 'daggar', kind: 'decal', subject: 'weapons' });
    expect(result.approximate).toBe(true);
    expect(result.matches.some((entry) => entry.value === '/vector/decal/extortion.svg')).toBe(true);
    expect(result.matches.every((entry) => entry.kind === 'decal' && entry.subjects.includes('weapons'))).toBe(true);
    expect(search({ q: 'dagger' }).approximate).toBe(false);
  });

  test('finds knives by meaning without inheriting unrelated collection keywords', () => {
    for (const q of ['knife', 'knfie', 'knive']) {
      expect(paths(q)).toContain('/vector/decal/poison-blade.svg');
      expect(paths(q)).toContain('/vector/decal/crysknife.svg');
      expect(paths(q)).toContain('/vector/decal/slip-tip.svg');
      expect(paths(q)).not.toContain('/vector/decal/wire.svg');
    }
    expect(paths('blade')).not.toContain('/vector/decal/wire.svg');
    expect(paths('blade')).not.toContain('/vector/decal/gravity-hammer.svg');
    expect(paths('crossed knives')).not.toContain('/vector/decal/poison-blade.svg');
    expect(searchMedia('blade')[0]?.label).toBe('Blade');
    expect(paths('assasination')).toContain('/vector/decal/assassination.svg');
  });

  test('facet counts reflect the other filters and every gallery includes all its files', () => {
    const filtered = search({ kind: 'troop', subject: 'weapons' });
    expect(filtered.subjectCounts.find((subject) => subject.value === 'weapons')?.count).toBe(filtered.matches.length);
    expect(filtered.kindCounts.find((kind) => kind.value === 'troop')?.count).toBe(filtered.matches.length);
    for (const kind of ['all', 'leader', 'decal']) {
      const result = search({ kind });
      const visible = result.groups.flatMap((group) => group.entries.map((entry) => entry.value));
      expect(visible.sort()).toEqual(
        catalogueEntries
          .filter((entry) => kind === 'all' || entry.kind === kind)
          .map((entry) => entry.value)
          .sort()
      );
      expect(new Set(visible).size).toBe(visible.length);
    }
    expect(validateMediaSearch({ subject: 'invented' }).subject).toBeUndefined();
  });
});

describe('media path navigation', () => {
  test('uses stable category paths and keeps query, subject, collection and focused artwork', () => {
    const selection = validateMediaSearch({
      kind: 'leader',
      q: 'hood',
      subject: 'people',
      group: 'Custom portraits / Desert robes',
      item: '/image/leader/official/aramsham.png',
    });
    const location = mediaLocation(selection);
    expect(location.to).toBe('/media/$source/$kind');
    expect(location.params).toEqual({ source: 'game', kind: 'leaders' });
    expect(mediaPathSearch(validateMediaQuery(location.search), location.params!)).toEqual(selection);
    expect(mediaLocation(validateMediaSearch({ source: 'topics' })).params).toEqual({ source: 'topics' });
    expect(mediaLocation(validateMediaSearch({})).to).toBe('/media');
    expect(validateMediaQuery({ source: 'topics', kind: 'leader', q: 'eye' })).toEqual({ q: 'eye' });
  });
});

test('leader and decal search results keep their collection and can expand to the complete group', () => {
  for (const [kind, q] of [
    ['leader', 'Aramsham'],
    ['decal', 'Extortion'],
  ]) {
    const filtered = search({ kind, q });
    expect(filtered.groups).toHaveLength(1);
    const group = filtered.groups[0]!;
    expect(group.collection).toBe(group.entries[0]!.collection);
    expect(group.entries).toHaveLength(1);
    expect(group.total).toBeGreaterThan(1);
    const expanded = search({ kind, group: group.collection });
    expect(expanded.groups.flatMap((item) => item.entries)).toHaveLength(group.total);
    expect(expanded.matches.every((entry) => entry.collection === group.collection)).toBe(true);
  }
});
