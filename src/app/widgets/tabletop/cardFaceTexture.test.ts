import { describe, expect, test } from 'vite-plus/test';

import { downscaleSteps, TABLE_CARD_FACE_WIDTH, tableCardFaceKey } from './cardFaceTexture';

describe('downscaleSteps', () => {
  test('scales a published card face straight to the table width', () => {
    expect(downscaleSteps(900, 1263, TABLE_CARD_FACE_WIDTH)).toEqual([[512, 719]]);
  });

  test('halves a large image while a further halving stays above the target', () => {
    expect(downscaleSteps(2400, 3368, 512)).toEqual([
      [1200, 1684],
      [600, 842],
      [512, 719],
    ]);
  });

  test('stops halving once the next halving would reach the target', () => {
    expect(downscaleSteps(2048, 2874, 512)).toEqual([
      [1024, 1437],
      [512, 719],
    ]);
  });
});

describe('tableCardFaceKey', () => {
  test('keeps a table card apart from the full-size image of the same URL', () => {
    const href = '/play-fixtures/snooper.jpg';
    expect(tableCardFaceKey(href)).not.toBe(href);
    expect(tableCardFaceKey(href).startsWith(href)).toBe(true);
  });
});
