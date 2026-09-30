import { PLANET } from '@shared/assetIds';

export const CURATED_PLANET_IMAGES = PLANET.options.map((image) => {
  const name = image
    .split('/')
    .at(-1)!
    .replace(/\.png$/, '');
  const original = /^\d{2}$/.test(name);
  return {
    id: `planet-${name}`,
    image,
    label: original
      ? `Planet illustration ${name}`
      : name.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
  };
});
