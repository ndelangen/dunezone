import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { Card } from '../surface/Card';
import { ScrollLane, fadingItemClass } from './ScrollLane';

const CHAPTERS = [
  'The board',
  'Storm and spice',
  'Shipping',
  'Movement',
  'Battle',
  'Collecting spice',
  'Alliances',
  'Winning',
];

/* A tile at a fixed width, as the catalogue's chapter tiles are, asking to snap to the lane's edge. */
const tile = (name: string, number: number, className?: string) => (
  <li key={name} style={{ flex: '0 0 12rem', scrollSnapAlign: 'start' }}>
    <Card title={name} padding="md" className={className}>
      <div style={{ aspectRatio: '16 / 10', background: '#574b2a' }} aria-hidden>
        <span style={{ padding: '0.5rem', display: 'inline-block' }}>{number}</span>
      </div>
    </Card>
  </li>
);

const meta = preview.meta({
  component: ScrollLane,
  parameters: { layout: 'padded' },
  /* A column narrower than the tiles, so the line overflows and fades at both ends. */
  decorators: [(Story) => <div style={{ maxWidth: '40rem', margin: '0 auto' }}>{Story()}</div>],
  args: {
    /* Named as a literal: widened to a string, it no longer fits the lane's elements and every story's typing falls over. */
    as: 'ol' as const,
    'aria-label': 'Chapters',
    start: 1,
    focusable: true,
    children: CHAPTERS.map((name, index) => tile(name, index + 1)),
  },
});

/** Tiles on one line, scrolled a little in, so the line fades out at both ends and the next tile shows its edge. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole('list', { name: 'Chapters' });
    await expect(within(list).getAllByRole('listitem')).toHaveLength(CHAPTERS.length);
    list.scrollLeft = 120;
    await expect(list.scrollLeft).toBeGreaterThan(0);
  },
});

/**
 * The fade on the tiles instead of the line: each tile dissolves at the lane's ends on its own, so the pane's blur still sees the page behind it.
 * Scrolled a little in, as the default is, so a tile stands in each fade.
 */
export const FadingItems = meta.story({
  args: {
    fade: 'items',
    children: CHAPTERS.map((name, index) => tile(name, index + 1, fadingItemClass)),
  },
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole('list', { name: 'Chapters' });
    list.scrollLeft = 120;
    await expect(list.scrollLeft).toBeGreaterThan(0);
    /* The line itself carries no mask; the fade is each tile's own, where the browser drives it from the scroll position. */
    await expect(getComputedStyle(list).maskImage).toBe('none');
    const [first] = canvasElement.getElementsByClassName(fadingItemClass);
    await expect(getComputedStyle(first!).maskImage).not.toBe('none');
  },
});

/** Round tokens with a drop shadow: the lane keeps room for the blur above and below, and the shadow is never cut. */
export const Shadow = meta.story({
  args: {
    as: 'div',
    'aria-label': undefined,
    start: undefined,
    focusable: false,
    room: 'shadow',
    children: CHAPTERS.map((name, index) => (
      <div
        key={name}
        aria-label={name}
        style={{
          flex: '0 0 auto',
          width: '9.5rem',
          height: '9.5rem',
          borderRadius: '50%',
          background: index % 2 ? '#4b4c0d' : '#e3dbb3',
          filter: 'drop-shadow(0 0 20px rgb(from var(--color-shadow) r g b / 0.5))',
        }}
      />
    )),
  },
});

/** The lane with the focus: its ring sits on the frame around it, clear of the mask, and the keyboard scrolls the line. */
export const Focused = meta.story({
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole('list', { name: 'Chapters' });
    await userEvent.tab();
    await expect(list).toHaveFocus();
  },
});
