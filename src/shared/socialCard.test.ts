import { describe, expect, test } from 'vitest';

import { parseSocialCard, socialCardHref, socialCardPath } from './socialCard';

const image = '/published/faction-tokens/k171dpxhhgjn9x3qmnhtywn33s848xq7/token.jpg?v=2026-10-01T19%3A38%3A43.575Z';
const href = socialCardHref({ name: 'Test Faction', kind: 'Faction', description: 'A test.', image, shape: 'round' });
const parse = (path: string) => parseSocialCard(new URL(path, 'https://dune.zone'));

describe('social image URL contract', () => {
  test('carries bounded words and the stable publication without needing a resolver', () => {
    expect(parse(href)).toMatchObject({
      name: 'Test Faction',
      text: 'A test.',
      v: '1',
      shape: 'round',
      art: image.split('?')[0],
      revision: '2026-10-01T19:38:43.575Z',
    });
    expect(socialCardPath(parse(href)!)).toBe(href);
  });

  test('canonicalizes whitespace, Unicode and field order', () => {
    const a = parse('/social/image.png?kind=Faction&v=1&name=Cafe%CC%81++house');
    const b = parse('/social/image.png?v=1&name=Caf%C3%A9+house&kind=Faction');
    expect(socialCardPath(a!)).toBe(socialCardPath(b!));
  });

  test.each([
    '&name=duplicate',
    '&unknown=x',
    '&__proto__=x',
    '&v=2',
    '&art=https://other.example/image.jpg',
    '&art=/published/factions/abcdefghijklmnop/sheet.pdf',
    '&art=/published/leaders/abcdefghijklmnop/leader.jpg',
    '&text=' + 'a'.repeat(181),
    '&revision=' + 'a'.repeat(65),
    '&shape=arbitrary',
    '&text=' + '%20'.repeat(1400),
  ])('rejects invalid input before work: %s', (suffix) => {
    expect(parse('/social/image.png?v=1&name=Example&kind=Faction' + suffix)).toBeNull();
  });

  test('bounds emitted text and keeps literal markup as text', () => {
    const result = parse(
      socialCardHref({ name: '𐐀'.repeat(100), kind: 'Faction', description: '<svg onload="x"> & '.repeat(50) })
    );
    expect(Array.from(result!.name)).toHaveLength(78);
    expect(Array.from(result!.text)).toHaveLength(180);
    expect(result!.text).toContain('<svg onload="x">');
    expect(result!.art).toBe('');
  });

  test('does not accept external artwork and changes URL when words or publication change', () => {
    expect(
      parse(socialCardHref({ name: 'A', kind: 'Asset', description: '', image: 'https://other.example/image.jpg' }))!
        .art
    ).toBe('');
    expect(href).not.toBe(socialCardHref({ name: 'Changed', kind: 'Faction', description: 'A test.', image }));
    expect(href).not.toBe(
      socialCardHref({
        name: 'Test Faction',
        kind: 'Faction',
        description: 'A test.',
        image: image.replace('2026', '2027'),
        shape: 'round',
      })
    );
  });
});
