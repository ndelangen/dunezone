import preview from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { SectionedSurface } from './SectionedSurface';
import { SurfaceFiller } from './SurfaceFiller.stories.fixture';

function rows(count: number, extra?: (index: number) => Record<string, unknown>) {
  return Array.from({ length: count }, (_, index) => (
    <SectionedSurface.Row key={index} {...(extra?.(index) ?? {})}>
      <SurfaceFiller height={20} />
    </SectionedSurface.Row>
  ));
}

const meta = preview.meta({
  title: 'Sectioned Surface',
  component: SectionedSurface,
  parameters: { layout: 'padded' },
  args: { children: rows(3) },
});

/** One pane, divided. The hairlines meet the rounded corner because the pane clips them. */
export const Default = meta.story({});

/** A single row still reads as a pane rather than a stray rule. */
export const SingleRow = meta.story({
  args: { children: rows(1) },
});

const activations = [fn(), fn(), fn()];

/** Activatable rows: the whole row is the target. Tab to one and press Enter. */
export const ActivatableRows = meta.story({
  args: {
    children: rows(3, (index) => ({ onActivate: activations[index], ariaLabel: `Open row ${index + 1}` })),
  },
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await userEvent.tab();
    await expect(within(canvasElement).getByRole('link', { name: 'Open row 2' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(activations[1]).toHaveBeenCalledOnce();
    await expect(activations[0]).not.toHaveBeenCalled();
  },
});

/**
 * A narrow pane takes its inset from the scale, not from its own width.
 * The pane here is far narrower than the window, which is exactly the case that a container query gets wrong: it would read the box and serve a phone inset on a desktop.
 */
export const NarrowPaneFollowsTheScale = meta.story({
  globals: { viewport: { value: 'contentColumn' } },
  play: async ({ canvas }) => {
    const [cell] = canvas.getAllByRole('cell');
    const step = getComputedStyle(document.documentElement).getPropertyValue('--space-lg').trim();
    const probe = document.createElement('div');
    probe.style.padding = step;
    document.body.append(probe);
    const expected = getComputedStyle(probe).paddingLeft;
    probe.remove();
    await expect(getComputedStyle(cell).paddingLeft).toBe(expected);
  },
});

/** An oversized child is contained by the cell rather than widening the pane. */
export const WideContentIsContained = meta.story({
  args: {
    children: (
      <SectionedSurface.Row>
        <SurfaceFiller height={20} width={900} />
      </SectionedSurface.Row>
    ),
  },
  globals: { viewport: { value: 'contentNarrow' } },
  play: async ({ canvas, canvasElement }) => {
    /* The pane is the surface round the table; the table itself is wider and clipped by it. */
    const pane = canvas.getByRole('table').parentElement!.getBoundingClientRect();
    await expect(pane.right).toBeLessThanOrEqual(canvasElement.getBoundingClientRect().right);
  },
});
