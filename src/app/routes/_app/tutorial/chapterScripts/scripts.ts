import type { ChapterScript } from './chapterScript';
import { lookingAround } from './lookingAround';
import { movingPieces } from './movingPieces';
import { thePrivateSideTable } from './thePrivateSideTable';
import { whatGoesWhere } from './whatGoesWhere';
import { windows } from './windows';
import { yourHandAndSpice } from './yourHandAndSpice';

/** The chapters built so far, by slug; every other chapter shows as coming soon. */
export const CHAPTER_SCRIPTS: Readonly<Record<string, ChapterScript>> = {
  [whatGoesWhere.slug]: whatGoesWhere,
  [lookingAround.slug]: lookingAround,
  [movingPieces.slug]: movingPieces,
  [windows.slug]: windows,
  [yourHandAndSpice.slug]: yourHandAndSpice,
  [thePrivateSideTable.slug]: thePrivateSideTable,
};
