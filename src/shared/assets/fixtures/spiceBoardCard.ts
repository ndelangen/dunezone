import type { z } from 'zod';

import type { CustomCardTokens, SpiceBoardLink } from '../schema';
import { publishingTokenFace } from './publishingTokenFace';

const disc = (name: string, image: string, colors: [string, string]) => ({
  type: 'token-disc' as const,
  name,
  face: {
    ...publishingTokenFace,
    image: image as typeof publishingTokenFace.image,
    background: { ...publishingTokenFace.background, colors },
    top: '',
    bottomFirst: '',
    bottomSecond: '',
    symbolScale: 1.2,
  },
});

/** Spice, spice mine and discovery tokens, as a Spice card's linked tokens resolve them. */
export const spiceBoardTokens: z.infer<typeof CustomCardTokens> = {
  'spice-token': disc('Spice', '/vector/icon/spice.svg', ['#C7701B', '#8A4210']),
  'spice-mine-token': disc('Spice mine', '/vector/icon/spice-mine.svg', ['#6B3A17', '#3A1E0B']),
  'discovery-token': disc('Discovery', '/vector/icon/eye.svg', ['#2F5F6B', '#173640']),
};

/** A discovery card on Arrakis: a filled tint with a sticker, an outline-only tint, a type-wide tint, two instances of one token and a token placed outside every tint. */
export const spiceBoardLink: z.infer<typeof SpiceBoardLink> = {
  asset_id: 'arrakis-board',
  tints: [
    { id: 'strongholds', name: 'Strongholds', color: '#d63a2a40', territories: [], types: ['stronghold'] },
    { id: 'blow', name: 'Spice blow', color: '#e8b923b0', territories: ['funeral_plain'], stamps: ['spice'] },
    { id: 'smuggler', name: 'Smuggler', color: '#2f7fe0', territories: ['pasty_mesa'], outline: true },
  ],
  tokens: [
    { layerId: 't1', asset_id: 'spice-token', x: 150, y: 370, size: 46, rotation: 0 },
    { layerId: 't2', asset_id: 'spice-token', x: 186, y: 392, size: 46, rotation: 20 },
    { layerId: 't3', asset_id: 'discovery-token', x: 270, y: 395, size: 56, rotation: -10 },
    { layerId: 't4', asset_id: 'spice-mine-token', x: 380, y: 120, size: 64, rotation: 0 },
  ],
};
