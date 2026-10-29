import type { CardDraw } from '@shared/play/cardDraw';
import { expect, test } from 'vite-plus/test';

import { cardDrawDuration, cardDrawPose, cardDrawPulse, DRAW_FLIGHT_MS, DRAW_STAGGER_MS } from './cardDrawMotion';

const draw: CardDraw = {
  epoch: 'room',
  revision: 1,
  recipient: 'fremen',
  count: 1,
  from: [4, 0.1, 1],
  to: [-3, 0.2, -2],
  orientation: 0.5,
  color: '#f8cd6f',
};

test('the flight starts at the deck, clears the table and disappears at the recipient', () => {
  expect(cardDrawPose(draw, -1).opacity).toBe(0);
  expect(cardDrawPose(draw, 0)).toMatchObject({ x: 4, z: 1, scale: 1, turn: 0.5, opacity: 1 });
  expect(cardDrawPose(draw, DRAW_FLIGHT_MS * 0.3).y).toBeGreaterThan(0.8);
  expect(cardDrawPose(draw, DRAW_FLIGHT_MS)).toMatchObject({ x: -3, z: -2, opacity: 0, turn: 0.5 });
  expect(cardDrawPose(draw, DRAW_FLIGHT_MS * 2).opacity).toBe(0);
});

test('four cards extend the receiving pulse until the last staggered flight has arrived', () => {
  expect(cardDrawDuration(4) - cardDrawDuration(1)).toBe(3 * DRAW_STAGGER_MS);
  expect(cardDrawPulse(DRAW_FLIGHT_MS - 1, 4).opacity).toBe(0);
  expect(cardDrawPulse(DRAW_FLIGHT_MS + 3 * DRAW_STAGGER_MS, 4).opacity).toBeGreaterThan(0);
  expect(cardDrawPulse(cardDrawDuration(4), 4).opacity).toBe(0);
});
