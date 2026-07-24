const textureIds = [
  ...Array.from({ length: 59 }, (_, index) => index + 1),
  ...Array.from({ length: 14 }, (_, index) => index + 69),
];

export type BackgroundPatternOption = {
  image: string;
  label: string;
};

export const BACKGROUND_PATTERN_CATALOGUE: readonly BackgroundPatternOption[] = [
  { image: '/vector/background/map.svg', label: 'Map lines' },
  { image: '/vector/background/moon.svg', label: 'Moons' },
  ...textureIds.map((id) => {
    const number = String(id).padStart(3, '0');
    return {
      image: `/image/texture/${number}.jpg`,
      label: `Texture ${number}`,
    };
  }),
];
