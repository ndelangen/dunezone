import { describe, expect, test } from 'vitest';

import { countOf, profileLink, publicDescription, publicPageHead } from './publicPage';

describe('public metadata excerpts', () => {
  test('reads marked prose and lists as plain text', () => {
    expect(publicDescription('*Important* -words- with _emphasis_.\n\n- First item\n- Second item')).toBe(
      'Important words with emphasis. First item Second item'
    );
  });

  test('keeps empty excerpts empty and bounds Unicode text without splitting a character', () => {
    expect(publicDescription(undefined)).toBe('');
    expect(publicDescription('  ')).toBe('');
    expect(publicDescription('A'.repeat(199) + '🌕tail')).toBe('A'.repeat(199) + '🌕');
  });
});

type Meta = Record<string, unknown>;
const metaOf = (head: ReturnType<typeof publicPageHead>) => (head.meta ?? []) as Meta[];
const graphOf = (head: ReturnType<typeof publicPageHead>) =>
  (metaOf(head).find((meta) => 'script:ld+json' in meta)?.['script:ld+json'] as { '@graph': Meta[] } | undefined)?.[
    '@graph'
  ];

describe('public page heads', () => {
  const faction = {
    name: 'Atreides',
    kind: 'Custom faction',
    pathname: '/factions/atreides',
    description: 'Prescience.',
    trail: [{ name: 'Factions', pathname: '/factions' }],
    author: profileLink({ slug: 'paul', username: 'Paul' }),
  };

  test('titles name the kind of page for the tab and for sharing', () => {
    const meta = metaOf(publicPageHead(faction));
    expect(meta).toContainEqual({ title: 'Atreides · Custom faction · Dune Zone' });
    expect(meta).toContainEqual({ property: 'og:title', content: 'Atreides · Custom faction · Dune Zone' });
    expect(meta).toContainEqual({ name: 'twitter:title', content: 'Atreides · Custom faction · Dune Zone' });
  });

  test('a detail page carries its breadcrumb trail and its creator', () => {
    expect(graphOf(publicPageHead(faction))).toEqual([
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Dune Zone', item: 'https://dune.zone/' },
          { '@type': 'ListItem', position: 2, name: 'Factions', item: 'https://dune.zone/factions' },
          { '@type': 'ListItem', position: 3, name: 'Atreides', item: 'https://dune.zone/factions/atreides' },
        ],
      },
      {
        '@type': 'CreativeWork',
        name: 'Atreides',
        url: 'https://dune.zone/factions/atreides',
        image: 'https://dune.zone/video/band-poster.jpg',
        description: 'Prescience.',
        author: { '@type': 'Person', name: 'Paul', url: 'https://dune.zone/profiles/paul' },
      },
    ]);
  });

  test('the homepage names the site, and a profile names a person', () => {
    expect(graphOf(publicPageHead({ name: '', pathname: '/', description: 'Home.' }))).toEqual([
      { '@type': 'WebSite', name: 'Dune Zone', url: 'https://dune.zone/' },
    ]);
    const profile = graphOf(
      publicPageHead({ name: 'Paul', pathname: '/profiles/paul', description: '', trail: [], profile: true })
    );
    expect(profile?.[1]).toMatchObject({
      '@type': 'ProfilePage',
      mainEntity: { '@type': 'Person', name: 'Paul', url: 'https://dune.zone/profiles/paul' },
    });
  });

  test('catalogues and creatorless pages add no structured data they cannot back', () => {
    expect(graphOf(publicPageHead({ name: 'Factions', pathname: '/factions', description: '' }))).toBeUndefined();
    expect(profileLink({ slug: 'ghost', username: null })).toBeNull();
    expect(graphOf(publicPageHead({ ...faction, author: null }))?.map((node) => node['@type'])).toEqual([
      'BreadcrumbList',
    ]);
  });

  test('a page that threw notFound has no head at all', () => {
    expect(publicPageHead({ ...faction, match: { status: 'notFound' } })).toEqual({});
  });

  test('counts read naturally', () => {
    expect(countOf(1, 'faction')).toBe('1 faction');
    expect(countOf(3, 'Group')).toBe('3 Groups');
  });
});
