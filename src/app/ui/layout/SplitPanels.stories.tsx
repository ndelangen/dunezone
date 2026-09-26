import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { LayoutSlotPlaceholder } from './LayoutSlotPlaceholder.stories.fixture';
import { SplitPanels } from './SplitPanels';
import type { SplitLimits } from './SplitPanels';

const EVEN_LIMITS: SplitLimits = { min: 28, max: 72 };
const evenLimits = () => EVEN_LIMITS;

/* The first panel keeps 320px when the room allows it; the second never drops below 18%. */
const TOP_PANEL_PX = 320;
const roomForTop = (room: number): SplitLimits => ({
  min: 18,
  max: Math.max(18, Math.min(50, ((room - TOP_PANEL_PX) / room) * 100)),
});

const panels = [
  <SplitPanels.First key="first">
    <LayoutSlotPlaceholder name="first" tone="primary" minHeight={0} />
  </SplitPanels.First>,
  <SplitPanels.Second key="second">
    <LayoutSlotPlaceholder name="second" tone="secondary" minHeight={0} />
  </SplitPanels.Second>,
];

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

function separatorOf(canvasElement: HTMLElement) {
  return within(canvasElement).getByRole('separator');
}

function sizeOf(separator: HTMLElement) {
  return Number(separator.getAttribute('aria-valuenow'));
}

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

/** Side by side: the separator is vertical, and the first panel is the one it measures. Keys step it within the limits. */
export const SideBySide = meta.story({
  args: {
    orientation: 'vertical',
    defaultSize: 50,
    limits: evenLimits,
    label: 'Resize the two panels',
  },
  globals: { viewport: { value: 'region' } },
  play: async ({ canvasElement }) => {
    const separator = separatorOf(canvasElement);
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    separator.focus();
    await userEvent.keyboard('{Home}');
    expect(sizeOf(separator)).toBe(EVEN_LIMITS.min);
    await userEvent.keyboard('{ArrowRight}');
    expect(sizeOf(separator)).toBe(EVEN_LIMITS.min + 2);
    await userEvent.keyboard('{ArrowUp}');
    expect(sizeOf(separator)).toBe(EVEN_LIMITS.min + 2);
    await userEvent.keyboard('{PageUp}');
    expect(sizeOf(separator)).toBe(EVEN_LIMITS.min + 7);
    await userEvent.keyboard('{End}');
    expect(sizeOf(separator)).toBe(EVEN_LIMITS.max);
    await userEvent.keyboard('{ArrowRight}{PageUp}');
    expect(sizeOf(separator)).toBe(EVEN_LIMITS.max);
    await userEvent.keyboard('{ArrowLeft}');
    expect(sizeOf(separator)).toBe(EVEN_LIMITS.max - 2);
  },
});

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
    expect(ceiling).toBeLessThan(50);
    expect(sizeOf(separator)).toBe(30);

    await pointer(separator, 'pointerdown', { button: 2, buttons: 2 });
    await pointer(separator, 'pointermove', { buttons: 2, offset: -60 });
    expect(sizeOf(separator)).toBe(30);
    expect(layout).toHaveAttribute('data-resizing', 'false');

    /* A pointer the browser knows is down, so capture would succeed if the one-finger rule let it through. */
    await pointer(separator, 'pointerdown', { isPrimary: false });
    expect(layout).toHaveAttribute('data-resizing', 'false');

    await pointer(separator, 'pointerdown', {});
    await waitFor(() => expect(layout).toHaveAttribute('data-resizing', 'true'));
    await pointer(separator, 'pointermove', { offset: -60 });
    await waitFor(() => expect(sizeOf(separator)).toBeGreaterThan(30));
    const dragged = sizeOf(separator);
    /* Moves from any pointer but the captured one leave the split alone. */
    await pointer(separator, 'pointermove', { pointerType: 'touch', pointerId: 7, isPrimary: false, offset: 120 });
    expect(sizeOf(separator)).toBe(dragged);
    await pointer(separator, 'pointermove', { offset: -600 });
    await waitFor(() => expect(sizeOf(separator)).toBe(ceiling));

    await pointer(separator, 'pointercancel', { buttons: 0 });
    await waitFor(() => expect(layout).toHaveAttribute('data-resizing', 'false'));
    await pointer(separator, 'pointermove', { offset: 200 });
    expect(sizeOf(separator)).toBe(ceiling);
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
    expect(within(canvasElement).queryByRole('separator')).toBeNull();
  },
});
