import { backgroundPresets } from '@game/data/backgrounds';
import { treacheryCardFixtures } from '@game/fixtures/treacheryCards';

import type { AssetFaceMember } from './AssetFace';

/*
 * Listing rows, which is what a caller hands `AssetFace`.
 * Written out here rather than pulled from the editors' stock tables, because a story fixture is the
 * one place a shape may be stated by hand: these stand in for stored `data`, which arrives untyped.
 * Only `BUNDLE`'s data is drawn, since every other face draws its `href`.
 */
export const TREACHERY = { ...treacheryCardFixtures.lasgun, about: '' };

export const DISC = {
  name: 'Spice',
  about: '',
  front: {
    image: '/vector/icon/eye.svg',
    background: backgroundPresets.special,
    symbolScale: 1,
    top: 'SPICE',
    bottomFirst: '',
    bottomSecond: '',
    ring: true,
  },
  back: { mode: 'same' },
};

const ENHANCE = {
  name: 'Lasgun array',
  about: '',
  front: { background: backgroundPresets.weapon, ring: true, decals: [], texts: [] },
  back: { mode: 'same' },
};

export const BUNDLE = { band: { background: backgroundPresets.weapon, label: 'Weapons' } };

export const publishedImage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1263"><rect width="900" height="1263" fill="#474620"/><text x="450" y="630" text-anchor="middle" fill="#eee0bb" font-size="70">Published face</text></svg>')}`;

/* A stored row's id is a branded Convex id, which a fixture can only state by assertion. */
function memberId(id: string) {
  return id as AssetFaceMember['id'];
}

export const MEMBERS: AssetFaceMember[] = [
  { id: memberId('a'), type: 'token-disc', name: 'Spice', data: DISC, previewHref: publishedImage },
  { id: memberId('b'), type: 'token-enhance', name: 'Lasgun array', data: ENHANCE, previewHref: publishedImage },
  { id: memberId('c'), type: 'token-plate', name: 'Shield', data: DISC, previewHref: publishedImage },
];
