import preview from '@sb/preview';
import type { ReactNode } from 'react';

import { ChapterComplete } from './ChapterComplete';
import { whatGoesWhere } from './chapterScripts/whatGoesWhere';

/* A plain link stands in for the router's in a story. */
const link =
  (href: string) =>
  ({ children, ...rest }: { children?: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );

/*
 * The end of chapter 5 on its own, without the table under it: the lines come in one at a time, then the button.
 * Shown with motion on whatever the viewing machine prefers (Norbert, 2026-10-23: demos play the motion).
 */
const meta = preview.meta({
  component: ChapterComplete,
  title: 'Tutorial/Chapter complete',
  parameters: { layout: 'fullscreen' },
  globals: { motion: 'on' },
  argTypes: { chaptersLink: { control: false }, nextLink: { control: false } },
  args: { learned: whatGoesWhere.learned, chaptersLink: link('#chapters') },
});

/** The last chapter built so far: the button leads back to the chapter list. */
export const BackToChapters = meta.story({});

/** A chapter with a built one after it: the button leads on. */
export const NextChapter = meta.story({ args: { nextLink: link('#next') } });
