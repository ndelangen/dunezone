import { TokenFace } from '../schema';

/** Accepted GF9 component proof data, recorded in issue #2362. These are renderer fixtures, not saved records. */
function hidden(image: string, colors: [string, string]) {
  return TokenFace.parse({
    image,
    background: {
      image: '/image/texture/hiereg-discovery.png',
      colors,
      definition: 0.55,
      influence: 0.95,
      invert: true,
    },
    symbolScale: 2,
    symbolShadow: false,
    top: '',
    bottomFirst: '',
    bottomSecond: '',
    ring: false,
  });
}

export const discoveryTokenFronts = {
  'gf9-hiereg-discovery-marker': {
    type: 'token-disc' as const,
    name: 'Hiereg',
    face: hidden('/vector/logo/fremen.svg', ['#d9b14d', '#61451e']),
  },
  'gf9-smuggler-discovery-marker': {
    type: 'token-disc' as const,
    name: 'Smuggler',
    face: hidden('/vector/logo/guild.svg', ['#6d7978', '#26373b']),
  },
  'gf9-spice-location-marker': {
    type: 'token-disc' as const,
    name: 'Spice',
    face: TokenFace.parse({
      image: '/vector/icon/spice.svg',
      background: {
        image: '/image/texture/082.jpg',
        colors: ['#bd7931', '#eedc9f'],
        definition: 0.25,
        influence: 0.55,
        invert: false,
      },
      symbolScale: 1.4,
      top: '',
      bottomFirst: '',
      bottomSecond: '',
      ring: false,
    }),
  },
};

function radial(center: string, rim: string) {
  return {
    type: 'radial' as const,
    x: 50,
    y: 50,
    r: 50,
    stops: [
      [center, 0],
      [center, 0.61],
      [rim, 0.65],
      [rim, 1],
    ],
  };
}

export const discoveryOutcomeFronts = [
  {
    name: 'Orgiz Processing Station',
    face: TokenFace.parse({
      ...discoveryTokenFronts['gf9-hiereg-discovery-marker'].face,
      image: '/vector/decal/orgiz-processing-station.svg',
      symbolScale: 1.85,
      symbolFill: '#07120f',
      symbolStroke: '#f3edbf',
      symbolStrokeWidth: 5.5,
      symbolShadow: true,
      background: {
        image: '/image/texture/082.jpg',
        colors: [radial('#d3bd59', '#453e1c'), radial('#827026', '#1d1e0f')],
        definition: 0.55,
        influence: 0.7,
        invert: false,
      },
    }),
  },
  {
    name: 'Ecological Testing Station',
    face: TokenFace.parse({
      ...discoveryTokenFronts['gf9-hiereg-discovery-marker'].face,
      image: '/vector/decal/ecological-testing-station.svg',
      symbolScale: 1.85,
      symbolFill: '#07120f',
      symbolStroke: '#f3edbf',
      symbolStrokeWidth: 5.5,
      symbolShadow: true,
      background: {
        image: '/image/texture/082.jpg',
        colors: [radial('#51491b', '#c2a541'), radial('#252a12', '#7e7025')],
        definition: 0.55,
        influence: 0.7,
        invert: false,
      },
    }),
  },
];
