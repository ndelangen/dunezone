import { describe, expect, it } from 'vitest';

import { APP_TITLE, pageHead, pageTitle } from './pageTitle';

describe('pageTitle', () => {
  it('puts the entity name first and the app second', () => {
    expect(pageTitle('Atreides')).toBe('Atreides · Dune Zone');
  });

  it('is the app name alone without a name', () => {
    expect(pageTitle()).toBe(APP_TITLE);
    expect(pageTitle(null)).toBe('Dune Zone');
  });

  it('treats a blank name as no name and trims the rest', () => {
    expect(pageTitle('   ')).toBe('Dune Zone');
    expect(pageTitle('  Rulesets ')).toBe('Rulesets · Dune Zone');
  });
});

describe('pageHead', () => {
  it('carries the title as the only meta tag by default', () => {
    expect(pageHead('Factions')).toEqual({ meta: [{ title: 'Factions · Dune Zone' }] });
  });

  it('adds the robots tag for noindex pages', () => {
    expect(pageHead('Game lobby', { noindex: true })).toEqual({
      meta: [{ title: 'Game lobby · Dune Zone' }, { name: 'robots', content: 'noindex' }],
    });
  });

  it('yields no title for a match that threw notFound', () => {
    expect(pageHead('Asset', { match: { status: 'notFound' } })).toEqual({});
  });

  it('keeps the title for a match that loaded', () => {
    expect(pageHead('Asset', { match: { status: 'success' } })).toEqual({ meta: [{ title: 'Asset · Dune Zone' }] });
  });
});
