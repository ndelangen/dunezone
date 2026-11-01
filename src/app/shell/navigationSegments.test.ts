import { describe, expect, it } from 'vite-plus/test';

import { NAV_SEGMENTS, navSegmentFor } from './navigationSegments';

describe('navSegmentFor', () => {
  it.each([
    '/',
    '/factions',
    '/factions/house-atreides',
    '/rulesets/dreamrules',
    '/rulesets/dreamrules/faq/create',
    '/assets/card-treachery/lasgun',
    '/blog/why-dune',
    '/glossary',
    '/play/create',
    '/tutorial/welcome',
    '/profiles/central/edit',
    '/auth/login',
  ])('puts %s under Playing Dune', (pathname) => {
    expect(navSegmentFor(pathname)).toBe('play');
  });

  it.each([
    '/create',
    '/create/faction',
    '/media',
    '/media/game/leaders',
    '/factions/create',
    '/factions/house-atreides/edit',
    '/assets/card-custom/create',
    '/assets/card-custom/arrakeen/edit/face',
    '/rulesets/create',
    '/rulesets/dreamrules/edit',
    '/rulesets/dreamrules/rulebooks/dream-rulebook/edit',
    '/groups/create',
  ])('puts %s under Creating content', (pathname) => {
    expect(navSegmentFor(pathname)).toBe('create');
  });

  it('gives each segment a switch target inside itself', () => {
    for (const segment of NAV_SEGMENTS) {
      expect(navSegmentFor(String(segment.to))).toBe(segment.id);
    }
  });
});
