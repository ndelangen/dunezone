import type { ChapterScript } from './chapterScript';
import { whatGoesWhere } from './whatGoesWhere';

/** The chapters built so far, by slug; every other chapter shows as coming soon. */
export const CHAPTER_SCRIPTS: Readonly<Record<string, ChapterScript>> = {
  [whatGoesWhere.slug]: whatGoesWhere,
};
