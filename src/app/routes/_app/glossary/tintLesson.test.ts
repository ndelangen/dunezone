import { arrakisBoardCapture } from '@shared/play/fixtures/board';
import { describe, expect, test } from 'vite-plus/test';

import { tintLessonTerritories } from './tintLesson';

describe('the glossary tint lesson', () => {
  test('highlights every stronghold the saved board has, whatever its id', () => {
    const board = structuredClone(arrakisBoardCapture.definition);
    const arrakeen = Object.values(board.properties).find((territory) => territory.id === 'arrakeen')!;
    arrakeen.id = 'arrakeen_revised';
    const strongholds = tintLessonTerritories(board, 'strongholds');
    expect(strongholds).toContain('arrakeen_revised');
    expect(strongholds).toHaveLength(5);
  });

  test('highlights the spice-blow territories the board still has', () => {
    expect(tintLessonTerritories(arrakisBoardCapture.definition, 'spice')).toEqual([
      'the_great_flat',
      'funeral_plain',
      'habbanya_erg',
    ]);
    const board = structuredClone(arrakisBoardCapture.definition);
    const key = Object.keys(board.properties).find((k) => board.properties[k]!.id === 'funeral_plain')!;
    delete board.properties[key];
    expect(tintLessonTerritories(board, 'spice')).toEqual(['the_great_flat', 'habbanya_erg']);
  });

  test('highlights nothing before the board arrives', () => {
    expect(tintLessonTerritories(undefined, 'strongholds')).toEqual([]);
  });
});
