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

/** A: the lines are dealt onto the table like cards. */
export const Dealt = meta.story({ args: { entrance: 'deal' } });

/** B: each line slides in and a big tick is stamped on it. */
export const Stamped = meta.story({ args: { entrance: 'stamp' } });

/** C: the lines hop in like tokens dropped onto the board. */
export const Bouncy = meta.story({ args: { entrance: 'bounce' } });

/** A chapter with a built one after it: the button leads on. */
export const NextChapter = meta.story({ args: { nextLink: link('#next') } });
