import { describe, expect, test } from 'vite-plus/test';

import { countOf, profileLink, publicDescription, publicPageHead, workDescription } from './publicPage';

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

describe('work descriptions', () => {
  test('lead with the work, the game and its creator, then its own text', () => {
    expect(
      workDescription({
        name: 'House Atreides',
        noun: 'custom faction',
        creator: 'IHasPinecone',
        text: 'You have limited Prescience.',
      })
    ).toBe('House Atreides, a custom faction for the Dune board game by IHasPinecone. You have limited Prescience.');
  });

  test('stand alone without a creator or text, and choose the article', () => {
    expect(workDescription({ name: 'Crysknife', noun: 'enhance token' })).toBe(
      'Crysknife, an enhance token for the Dune board game.'
    );
  });

  test('stay within the excerpt bound', () => {
    expect(Array.from(workDescription({ name: 'X', noun: 'ruleset', text: '🌕'.repeat(300) }))).toHaveLength(200);
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
    image: '/published/atreides.png',
    trail: [{ name: 'Factions', pathname: '/factions' }],
    entity: { type: 'work', author: profileLink({ slug: 'paul', username: 'Paul' }) },
  } as const;

  test('titles name the kind of page for the tab and for sharing', () => {
    const meta = metaOf(publicPageHead(faction));
    expect(meta).toContainEqual({ title: 'Atreides · Custom faction · Dune Zone' });
    expect(meta).toContainEqual({ property: 'og:title', content: 'Atreides · Custom faction · Dune Zone' });
    expect(meta).toContainEqual({ name: 'twitter:title', content: 'Atreides · Custom faction · Dune Zone' });
  });

  test('a social card names the page kind unless it names its own', () => {
    const cardOf = (head: ReturnType<typeof publicPageHead>) =>
      new URL(String(metaOf(head).find((meta) => meta.property === 'og:image')?.content)).searchParams;
    expect([...cardOf(publicPageHead({ ...faction, social: { shape: 'round' } })).values()]).toContain(
      'Custom faction'
    );
    expect([
      ...cardOf(publicPageHead({ ...faction, social: { kind: 'FAQ question', shape: 'round' } })).values(),
    ]).toContain('FAQ question');
  });

  test('a detail page carries its breadcrumb trail and its work with the artwork and creator', () => {
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
        image: 'https://dune.zone/published/atreides.png',
        description: 'Prescience.',
        author: { '@type': 'Person', name: 'Paul', url: 'https://dune.zone/profiles/paul' },
      },
    ]);
  });

  test('the homepage names the site, and a profile names a person', () => {
    expect(
      graphOf(publicPageHead({ name: '', pathname: '/', description: 'Home.', entity: { type: 'site' } }))
    ).toEqual([{ '@type': 'WebSite', name: 'Dune Zone', url: 'https://dune.zone/' }]);
    const profile = graphOf(
      publicPageHead({
        name: 'Paul',
        pathname: '/profiles/paul',
        description: '',
        trail: [],
        entity: { type: 'person' },
      })
    );
    expect(profile?.[1]).toEqual({
      '@type': 'ProfilePage',
      url: 'https://dune.zone/profiles/paul',
      mainEntity: { '@type': 'Person', name: 'Paul', url: 'https://dune.zone/profiles/paul' },
    });
  });

  test('catalogues and creatorless works add no structured data they cannot back', () => {
    expect(graphOf(publicPageHead({ name: 'Factions', pathname: '/factions', description: '' }))).toBeUndefined();
    expect(profileLink({ slug: 'ghost', username: null })).toBeNull();
    const work = graphOf(publicPageHead({ ...faction, image: null, entity: { type: 'work', author: null } }))?.[1];
    expect(work).not.toHaveProperty('author');
    expect(work).not.toHaveProperty('image');
  });

  test('a blog post names itself as a posting with its author and publication date', () => {
    const post = publicPageHead({
      name: 'Why Dune?',
      kind: 'Blog',
      pathname: '/blog/why-dune',
      description: 'How a group of players came to Dune.',
      image: '/m/board.webp',
      trail: [{ name: 'Blog', pathname: '/blog' }],
      entity: {
        type: 'article',
        author: { name: 'Central419', pathname: '/profiles/central' },
        published: '2026-10-14',
      },
    });
    expect(graphOf(post)?.[1]).toEqual({
      '@type': 'BlogPosting',
      headline: 'Why Dune?',
      url: 'https://dune.zone/blog/why-dune',
      image: 'https://dune.zone/m/board.webp',
      description: 'How a group of players came to Dune.',
      datePublished: '2026-10-14',
      author: { '@type': 'Person', name: 'Central419', url: 'https://dune.zone/profiles/central' },
    });
    expect(metaOf(post)).toContainEqual({ property: 'og:type', content: 'article' });
    expect(metaOf(post)).toContainEqual({ property: 'article:published_time', content: '2026-10-14' });
    expect(metaOf(post)).toContainEqual({
      property: 'article:author',
      content: 'https://dune.zone/profiles/central',
    });
    expect(metaOf(publicPageHead(faction))).toContainEqual({ property: 'og:type', content: 'website' });
  });

  test('an author without a verified profile is named without inventing a profile URL', () => {
    const post = publicPageHead({
      name: 'A new post',
      pathname: '/blog/new-post',
      description: 'A development note.',
      entity: { type: 'article', author: { name: 'Guest author' }, published: '2026-10-14' },
    });
    expect(graphOf(post)?.[0]).toMatchObject({ author: { '@type': 'Person', name: 'Guest author' } });
    expect(graphOf(post)?.[0].author).not.toHaveProperty('url');
    expect(metaOf(post).some((meta) => meta.property === 'article:author')).toBe(false);
  });

  test('a page that threw notFound has no head at all', () => {
    expect(publicPageHead({ ...faction, match: { status: 'notFound' } })).toEqual({});
  });

  test('counts read naturally', () => {
    expect(countOf(1, 'faction')).toBe('1 faction');
    expect(countOf(3, 'Group')).toBe('3 Groups');
  });
});
