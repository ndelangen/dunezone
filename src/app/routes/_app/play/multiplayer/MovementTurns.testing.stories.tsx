import { testingPreview } from '@sb/preview';
import { DarkSchemeIsland, darkSchemeIslandAttributes } from '@ui/surface/DarkSchemeIsland';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { dragOnto } from '../sortable.stories.fixture';
import { MovementTurns } from './MovementTurns';
import { TableMovementTurns, names, order, table } from './movementTurns.stories.fixture';

const meta = testingPreview.meta({
  component: MovementTurns,
  title: 'Play/Panels/Shipment and Movement turns',
  parameters: { layout: 'centered' },
  args: { table, names, order, done: [], canAct: true, onDone: fn(), onUndo: fn(), onOrder: fn() },
  render: (args) => <TableMovementTurns {...args} />,
  decorators: [
    (Story) => (
      <DarkSchemeIsland>
        <div {...darkSchemeIslandAttributes} style={{ padding: 16, borderRadius: 12, background: 'var(--ui-ground)' }}>
          <Story />
        </div>
      </DarkSchemeIsland>
    ),
  ],
});

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/** A click on the faction up now, or on any faction still to go, marks it done. */
export const MarksDone = meta.story({
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const [first, , third] = order;
    const up = canvas.getByRole('button', { name: names[first!] });
    await expect(up).toHaveAttribute('aria-current', 'step');
    await expect(up).toHaveAccessibleDescription(`${names[first!]} is up now · Mark done`);
    await userEvent.click(up);
    await expect(args.onDone).toHaveBeenCalledWith(first);
    const waiting = canvas.getByRole('button', { name: names[third!] });
    await expect(waiting).toHaveAccessibleDescription(`${names[third!]} is still to go · Mark done`);
    await userEvent.click(waiting);
    await expect(args.onDone).toHaveBeenCalledWith(third);
    await expect(args.onUndo).not.toHaveBeenCalled();
  },
});

/** A click on a faction already done takes that back. */
export const MarksNotDone = meta.story({
  args: { done: order.slice(0, 1) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const [first, second] = order;
    const finished = canvas.getByRole('button', { name: names[first!], pressed: true });
    await expect(finished).toHaveAccessibleDescription(`${names[first!]} is done · Mark not done`);
    await expect(canvas.getByRole('button', { name: names[second!] })).toHaveAttribute('aria-current', 'step');
    await userEvent.click(finished);
    await expect(args.onUndo).toHaveBeenCalledWith(first);
    await expect(args.onDone).not.toHaveBeenCalled();
  },
});

/** Dragging the last faction in front of the first reports the new order, which shows at once with the ring on its new first. */
export const Rearranges = meta.story({
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const first = order[0]!;
    const last = order.at(-1)!;
    /* dnd-kit cancels a drag on a window resize, and the runner's own resize lands on the first drawn frame. */
    await frame();
    await dragOnto(
      canvas.getByRole('button', { name: names[last] }),
      canvas.getByRole('button', { name: names[first] })
    );
    const rearranged = [last, ...order.slice(0, -1)];
    await expect(args.onOrder).toHaveBeenCalledWith(rearranged);
    await waitFor(async () => {
      await expect(canvas.getAllByRole('button').map((token) => token.getAttribute('aria-label'))).toEqual(
        rearranged.map((factionId) => names[factionId])
      );
      await expect(canvas.getByRole('button', { name: names[last] })).toHaveAttribute('aria-current', 'step');
    });
    await expect(args.onDone).not.toHaveBeenCalled();
  },
});

/** A faction done keeps its place: dragged onto, nothing lands before it, and dragged itself, it stays put. */
export const KeepsDoneInPlace = meta.story({
  args: { done: order.slice(0, 1) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const first = order[0]!;
    const second = order[1]!;
    const last = order.at(-1)!;
    /* Report each boundary separately if the order changes under CI load. */
    const checkOrder = async (stage: string) => {
      const tokens = canvas.getAllByRole('button');
      const detail = JSON.stringify({
        stage,
        calls: args.onOrder.mock.calls,
        tokens: tokens.map((token) => ({
          name: token.getAttribute('aria-label'),
          current: token.getAttribute('aria-current'),
          box: token.getBoundingClientRect().toJSON(),
        })),
      });
      await expect(tokens[0], detail).toHaveAccessibleName(names[first]!);
      await expect(canvas.getByRole('button', { name: names[second] }), detail).toHaveAttribute('aria-current', 'step');
    };
    await frame();
    await checkOrder('before dragging');
    await dragOnto(
      canvas.getByRole('button', { name: names[last] }),
      canvas.getByRole('button', { name: names[first] })
    );
    await checkOrder('after dropping onto the finished faction');
    await dragOnto(
      canvas.getByRole('button', { name: names[first] }),
      canvas.getByRole('button', { name: names[last] })
    );
    for (const [arranged] of args.onOrder.mock.calls) {
      await expect(arranged[0]).toBe(first);
    }
    await checkOrder('after dragging the finished faction');
  },
});

/** An observer's row names each faction and its standing, with nothing to press and no drag that moves anything. */
export const ObserverOnlyLooks = meta.story({
  args: { done: order.slice(0, 1), canAct: false },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const [first, second] = order;
    const last = order.at(-1)!;
    await expect(canvas.queryAllByRole('button')).toHaveLength(0);
    await expect(canvas.getByRole('img', { name: names[first!] })).toHaveAccessibleDescription(
      `${names[first!]} is done`
    );
    await expect(canvas.getByRole('img', { name: names[second!] })).toHaveAccessibleDescription(
      `${names[second!]} is up now`
    );
    await frame();
    await dragOnto(canvas.getByRole('img', { name: names[last] }), canvas.getByRole('img', { name: names[first!] }));
    await expect(canvas.getAllByRole('img').map((token) => token.getAttribute('aria-label'))).toEqual(
      order.map((factionId) => names[factionId])
    );
    await expect(args.onOrder).not.toHaveBeenCalled();
  },
});

/* The row as the table plays it: a click marks a faction done, another takes it back. */
function PlayedTurns(args: Parameters<typeof TableMovementTurns>[0]) {
  const [done, setDone] = useState<string[]>([]);
  return (
    <TableMovementTurns
      {...args}
      done={done}
      onDone={(id) => setDone([...done, id])}
      onUndo={(id) => setDone(done.filter((other) => other !== id))}
    />
  );
}

/** Each tick marked on pops in, and once every faction is done the completion runs along the row; open it to try by hand. */
export const MarkingDone = meta.story({
  globals: { motion: 'on' },
  render: (args) => <PlayedTurns {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = canvas.getByRole('group', { name: 'Shipment and Movement turns' });
    const tick = (id: string) => canvas.getByRole('button', { name: names[id] }).querySelector('[data-fresh]');
    await userEvent.click(canvas.getByRole('button', { name: names[order[0]!] }));
    await waitFor(() => expect(tick(order[0]!)).not.toBeNull());
    await expect(row).not.toHaveAttribute('data-complete');
    for (const id of order.slice(1)) {
      await userEvent.click(canvas.getByRole('button', { name: names[id] }));
    }
    await waitFor(() => expect(row).toHaveAttribute('data-complete'));
    await expect(tick(order.at(-1)!)).not.toBeNull();
    /* Taking the last mark back ends the completion; the token moves back among the factions still to go, so each look finds it afresh. */
    const last = () => canvas.getByRole('button', { name: names[order.at(-1)!] });
    await userEvent.click(last());
    await waitFor(() => expect(last()).toHaveAttribute('aria-pressed', 'false'));
    await expect(row).not.toHaveAttribute('data-complete');
  },
});
