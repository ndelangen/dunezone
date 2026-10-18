import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { DetachedSurfaceBoundary, Surface } from './Surface';
import { SurfaceFiller } from './SurfaceFiller.stories.fixture';

const meta = preview.meta({
  component: DetachedSurfaceBoundary,
  parameters: { layout: 'padded' },
  args: {
    children: (
      <Surface padding="md" as="section" aria-label="Detached pane">
        <SurfaceFiller height={72} />
      </Surface>
    ),
  },
});

/**
 * The shape a portalled pane takes: a `Surface` wrapped in the boundary.
 *
 * There is nothing to see that the pane does not already show, because this renders no markup of its own.
 * What it changes is invisible: React context crosses a portal, so a floating pane opened from inside a surface would otherwise warn about nesting even though nothing visually nests.
 * The boundary tells the guard that the portal detached it.
 *
 * Wrap the portalled content only.
 * In-flow content that nests is the defect the guard exists to report.
 */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const pane = within(canvasElement).getByRole('region', { name: 'Detached pane' });
    await expect(pane).toBeVisible();
    /* The boundary adds no element of its own, so the pane sits directly in the story's root. */
    await expect(pane.parentElement).toBe(canvasElement);
  },
});
