import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { legacyStoryParameters } from '@sb/legacyStoryParameters';
import preview from '@sb/preview';
import { useState } from 'react';

import { SortableItem } from './SortableItem';
import { SortableReorderHandle } from './SortableReorderHandle';

const meta = preview.meta({
  title: 'Sortable DnD',
  parameters: { ...legacyStoryParameters, layout: 'centered' },
});

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
        if (!over) {
          return;
        }
        const from = items.indexOf(String(active.id));
        const to = items.indexOf(String(over.id));
        if (from < 0 || to < 0 || from === to) {
          return;
        }
        setItems((prev) => arrayMove(prev, from, to));
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
