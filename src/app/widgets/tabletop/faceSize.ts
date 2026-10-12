import { card } from '@game/data/sizes';

/* The side of a token's face shown flat and large, by the peek and the Alt close-up alike. */
export const TOKEN_SIZE_PX = 240;

/* A card face's width in pixels at the given height, in the printed card's proportions. */
export const cardWidthFor = (height: number) => Math.round((height * card.width) / card.height);
