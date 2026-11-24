import { TokenFace } from '../schema';

/**
 * The Spice Mine token faces, the live Spice Mine token's background and size with a numbered mine symbol.
 * The number is the most spice a player may take from the bank, outlined over the middle of the mine;
 * the back repeats the front.
 */
export function spiceMineTokenFace(limit: number) {
  return TokenFace.parse({
    image: `/vector/icon/spice-mine-${limit}.svg`,
    background: {
      image: '/image/texture/001.jpg',
      colors: [
        '#000000',
        {
          type: 'radial',
          stops: [
            ['#DE9E31', 0.35],
            ['#DE9E31', 0.35],
            ['#FCFAAD', 1],
          ],
        },
      ],
      definition: 0,
      influence: 0.4,
      invert: true,
      source: { kind: 'preset', key: 'stock/spice-token' },
    },
    symbolScale: 2,
    symbolShadow: true,
    top: '',
    bottomFirst: '',
    bottomSecond: '',
    ring: false,
  });
}

/** The mines Dreamrules prints and the limit each card places. */
export const spiceMineLimits = {
  arsunt: 3,
  cielago_east: 3,
  bight_of_the_cliff: 4,
  cielago_west: 4,
  gaia_kulon: 5,
} as const;
