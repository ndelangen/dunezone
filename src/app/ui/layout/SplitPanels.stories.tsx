import preview from '@sb/preview';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { SplitPanels } from './SplitPanels';
import type { SplitLimits } from './SplitPanels';
import { EVEN_LIMITS, evenLimits, panels, separatorOf, sizeOf } from './SplitPanels.stories.fixture';

/* The first panel keeps 320px when the room allows it; the second never drops below 18%. */
const TOP_PANEL_PX = 320;
const roomForTop = (room: number): SplitLimits => ({
  min: 18,
  max: Math.max(18, Math.min(50, ((room - TOP_PANEL_PX) / room) * 100)),
});

const meta = preview.meta({
  component: SplitPanels,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Two panels either side of a separator the reader drags with the primary button or one finger, or steps with the keys. The caller gives the limits, as a function of the room, and the steps. Its parent gives it its size.',
      },
    },
  },
  args: { children: panels, step: 2, pageStep: 5 },
});

/**
 * A pointer event at the middle of the separator, moved `offset` pixels down the split.
 * It waits two frames after dispatching, as a real pointer would before its next event, so React has rendered whatever the event changed and a size that stays put has had its chance to move.
 */
async function pointer(separator: HTMLElement, type: string, init: PointerEventInit & { offset?: number }) {
  const box = separator.getBoundingClientRect();
  separator.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerType: 'mouse',
      pointerId: 1,
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2 + (init.offset ?? 0),
      ...init,
    })
  );
  for (let frame = 0; frame < 2; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/**
 * Stacked: the separator is horizontal, and it measures the second panel, whose ceiling keeps the first panel 320px tall when the room allows.
 * Only the primary button and one pointer move it;
 * a cancelled drag lets go.
 */
export const Stacked = meta.story({
  args: {
    orientation: 'horizontal',
    primary: 'second',
    defaultSize: 30,
    limits: roomForTop,
    label: 'Resize the lower panel',
    valueText: (size) => `${Math.round(size)}% for the lower panel`,
  },
  globals: { viewport: { value: 'region' } },
  play: async ({ canvasElement }) => {
    const separator = separatorOf(canvasElement);
    const layout = separator.parentElement!;
    const ceiling = Number(separator.getAttribute('aria-valuemax'));
    await expect(ceiling).toBeLessThan(50);
    await expect(sizeOf(separator)).toBe(30);

    await pointer(separator, 'pointerdown', { button: 2, buttons: 2 });
    await pointer(separator, 'pointermove', { buttons: 2, offset: -60 });
    await expect(sizeOf(separator)).toBe(30);
    await expect(layout).toHaveAttribute('data-resizing', 'false');

    /* A pointer the browser knows is down, so capture would succeed if the one-finger rule let it through. */
    await pointer(separator, 'pointerdown', { isPrimary: false });
    await expect(layout).toHaveAttribute('data-resizing', 'false');

    await pointer(separator, 'pointerdown', {});
    await waitFor(() => expect(layout).toHaveAttribute('data-resizing', 'true'));
    await pointer(separator, 'pointermove', { offset: -60 });
    await waitFor(() => expect(sizeOf(separator)).toBeGreaterThan(30));
    const dragged = sizeOf(separator);
    /* Moves from any pointer but the captured one leave the split alone. */
    await pointer(separator, 'pointermove', { pointerType: 'touch', pointerId: 7, isPrimary: false, offset: 120 });
    await expect(sizeOf(separator)).toBe(dragged);
    await pointer(separator, 'pointermove', { offset: -600 });
    await waitFor(() => expect(sizeOf(separator)).toBe(ceiling));

    await pointer(separator, 'pointercancel', { buttons: 0 });
    await waitFor(() => expect(layout).toHaveAttribute('data-resizing', 'false'));
    await pointer(separator, 'pointermove', { offset: 200 });
    await expect(sizeOf(separator)).toBe(ceiling);
  },
});

/** Too narrow for two panels side by side: they stack, each keeps the room it needs to read, and the separator goes. */
export const NarrowContainer = meta.story({
  args: {
    orientation: 'vertical',
    defaultSize: 50,
    limits: evenLimits,
    label: 'Resize the two panels',
  },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('separator')).toBeNull();
  },
});

/**
 * A caller hears only the sizes the reader settles: a key press, or a drag once it lets go.
 * A default the limits clamp is not one, so a caller that remembers the size keeps what the reader chose rather than what a narrow window allowed.
 */
export const ReportsSettledSizes = meta.story({
  args: {
    orientation: 'vertical',
    defaultSize: 90,
    limits: evenLimits,
    label: 'Resize the two panels',
    onSizeChange: fn(),
  },
  globals: { viewport: { value: 'region' } },
  play: async ({ args, canvasElement }) => {
    const separator = separatorOf(canvasElement);
    await waitFor(() => expect(sizeOf(separator)).toBe(EVEN_LIMITS.max));
    await expect(args.onSizeChange).not.toHaveBeenCalled();
    separator.focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(args.onSizeChange).toHaveBeenLastCalledWith(EVEN_LIMITS.max - 2);
    await pointer(separator, 'pointerdown', {});
    await pointer(separator, 'pointermove', { clientX: separator.getBoundingClientRect().left - 40 });
    await expect(args.onSizeChange).toHaveBeenCalledTimes(1);
    await pointer(separator, 'pointerup', { buttons: 0 });
    await expect(args.onSizeChange).toHaveBeenCalledTimes(2);
    /* The separator reports its size in tenths; the caller hears the exact size. */
    await expect((args.onSizeChange as ReturnType<typeof fn>).mock.lastCall?.[0]).toBeCloseTo(sizeOf(separator), 1);
  },
});
