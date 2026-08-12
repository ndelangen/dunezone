import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import preview from '@sb/preview';
import { useState } from 'react';

import { SortableItem } from './SortableItem';
import { SortableReorderHandle } from './SortableReorderHandle';

const meta = preview.meta({
  parameters: { layout: 'centered' },
});

/** Both ends found, and the item actually lands somewhere new. */
function movesSomewhere(from: number, to: number) {
  return from >= 0 && to >= 0 && from !== to;
}

function SortableListDemo() {
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
});
