/* Procedural game materials and fallback artwork. These values are independent of the UI theme. */
export const gameAssetColors = {
  traitorCardBase: '#d5ba8c',
  pieceAccent: '#ead9bb',
  spiceStack: '#b8842f',
  spiceFallbackFace: '#f6d77f',
  spiceIcon: '#6b431d',
  mapStronghold: '#f7ba7a',
  mapRock: '#a67a3e',
  mapSand: '#f6d979',
  phaseDisc: '#eee7ad',
  phaseInk: '#111111',
  predictionPaper: '#e3dbb3',
  predictionInk: '#1c140d',
  spiceDisc: '#999582',
} as const;

/* Neutral material values: white leaves a texture untinted; black supplies opaque ink or an underlay. */
export const rendererColors = {
  black: '#000000',
  white: '#ffffff',
} as const;
