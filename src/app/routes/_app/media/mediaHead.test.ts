import { MEDIA_GALLERY_SLUGS } from '@shared/recordlessPublicPages';
import { describe, expect, test } from 'vitest';

import { mediaHead } from './mediaHead';
import { mediaKinds } from './mediaSearchParams';

const canonical = (head: ReturnType<typeof mediaHead>) =>
  'links' in head ? head.links?.find((link) => link.rel === 'canonical')?.href : undefined;
type Meta = { title?: string; name?: string; content?: string };
const metaOf = (head: ReturnType<typeof mediaHead>): Meta[] => ('meta' in head ? (head.meta ?? []) : []);
const description = (head: ReturnType<typeof mediaHead>) =>
  metaOf(head).find((meta) => meta.name === 'description')?.content;

describe('media page heads', () => {
  test('the public galleries are exactly the game galleries the router serves', () => {
    expect(MEDIA_GALLERY_SLUGS).toEqual(mediaKinds.map((kind) => kind.slug));
  });

  test('the overview is its own canonical page', () => {
    expect(canonical(mediaHead({}))).toBe('https://dune.zone/media');
  });

  test('every gallery is canonical at its path, with its own title and description', () => {
    const descriptions = new Set();
    for (const kind of mediaKinds) {
      const head = mediaHead({ source: 'game', kind: kind.slug });
      expect(canonical(head)).toBe(`https://dune.zone/media/game/${kind.slug}`);
      expect(metaOf(head).find((meta) => meta.title)?.title).toContain(kind.label);
      descriptions.add(description(head));
    }
    expect(descriptions.size).toBe(mediaKinds.length);
  });

  test.each(['topics', 'lucide'])('the %s icon library keeps the plain title without a canonical', (source) => {
    expect(mediaHead({ source })).toEqual({ meta: [{ title: 'Media catalogue · Dune Zone' }] });
  });

  test('an unknown gallery and a not-found match leave the title to the not-found page', () => {
    expect(mediaHead({ source: 'game', kind: 'missing' })).toEqual({});
    expect(mediaHead({}, { status: 'notFound' })).toEqual({});
    expect(mediaHead({ source: 'game', kind: 'leaders' }, { status: 'notFound' })).toEqual({});
  });
});
