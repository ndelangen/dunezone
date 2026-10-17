import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import preview from '@sb/preview';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { SortableItem } from './SortableItem';
import { SortableReorderHandle } from './SortableReorderHandle';

const meta = preview.meta({
  parameters: { layout: 'centered' },
});

/** Both ends found, and the item actually lands somewhere new. */
function movesSomewhere(from: number, to: number) {
  return from >= 0 && to >= 0 && from !== to;
}

function SortableListDemo({ silent = false }: { silent?: boolean }) {
  const [items, setItems] = useState(['Alpha', 'Bravo', 'Charlie']);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }: DragEndEvent) => {
        const from = items.indexOf(String(active.id));
        const to = over ? items.indexOf(String(over.id)) : -1;
        if (movesSomewhere(from, to)) {
          setItems((prev) => arrayMove(prev, from, to));
        }
      }}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', width: '14rem' }}>
          {items.map((label, i) => (
            <SortableItem key={label} as="li" id={label}>
              {({ setActivatorNodeRef, attributes, listeners }) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <SortableReorderHandle
                    label={`Reorder ${label}`}
                    emphasis={silent ? 'silent' : undefined}
                    setActivatorNodeRef={setActivatorNodeRef}
                    attributes={attributes}
                    listeners={listeners}
                  />
                  <span>
                    {i + 1}. {label}
                  </span>
                </div>
              )}
            </SortableItem>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

export const VerticalList = meta.story({
  render: () => <SortableListDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const portal = within(canvasElement.ownerDocument.body);
    const handle = canvas.getByRole('button', { name: 'Reorder Alpha' });
    /*
     * The runner sizes the story's frame just before the story starts, and Chromium dispatches that resize on the next drawn frame, which can arrive seconds late on CI.
     * dnd-kit cancels a drag on any window resize, so a late resize between the pickup and the drop left the list in its old order (#2309).
     * Resize events run before animation-frame callbacks in the same frame, so starting after one drawn frame lets the resize land first.
     */
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    handle.focus();
    await userEvent.keyboard('[Space]');
    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
    await userEvent.keyboard('[ArrowDown]');
    await waitFor(() =>
      expect(portal.getByText('Draggable item Alpha was moved over droppable area Bravo.')).toBeInTheDocument()
    );
    await userEvent.keyboard('[Space]');
    await waitFor(() =>
      expect(canvas.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        '1. Bravo',
        '2. Alpha',
        '3. Charlie',
      ])
    );
  },
});

export const SilentHandles = meta.story({
  render: () => <SortableListDemo silent />,
});
