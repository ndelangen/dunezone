import { arrakisBoardCapture } from '@shared/boards/arrakisPreset';
import { describe, expect, test } from 'vite-plus/test';

import type { ArrakisBoard } from '@db/arrakis';

import { tutorialBoard } from './tutorialBoard';

describe('the board a tutorial table plays on', () => {
  test('is the saved Arrakis once it is read', () => {
    const capture = { ...arrakisBoardCapture, asset: { ...arrakisBoardCapture.asset, name: 'Arrakis Revised' } };
    expect(tutorialBoard({ capture } as unknown as ArrakisBoard)).toBe(capture);
  });

  test('is the bundled Arrakis on a site without a published one, so its tasks still have territories', () => {
    expect(tutorialBoard(null)).toBe(arrakisBoardCapture);
  });

  test('is not chosen while the saved one loads', () => {
    expect(tutorialBoard(undefined)).toBeUndefined();
  });
});
