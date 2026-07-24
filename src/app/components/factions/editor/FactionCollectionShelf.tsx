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
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { ActionIcon, Box, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { GripVertical } from 'lucide-react';

import { indexFromSortableId } from '@app/lib/dnd-sortable-ids';

import styles from './FactionCollectionShelf.module.css';
import { useFactionSortableItem } from './useFactionSortableItem';

export type FactionCollectionShelfItem = {
  id: string;
  label: string;
  description?: string;
};

function ShelfItem({
  item,
  index,
  selected,
  onSelect,
}: {
  item: FactionCollectionShelfItem;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const sortable = useFactionSortableItem(item.id);

  return (
    <Box
      ref={sortable.setNodeRef}
      className={styles.item}
      data-selected={selected}
      style={sortable.style}
    >
      <Tooltip label={`Reorder ${item.label}`}>
        <ActionIcon
          ref={sortable.handle.ref}
          {...sortable.handle.attributes}
          {...sortable.handle.listeners}
          type="button"
          className={styles.handle}
          variant="subtle"
          color="gray"
          aria-label={`Drag to reorder ${item.label}`}
        >
          <GripVertical size={17} aria-hidden />
        </ActionIcon>
      </Tooltip>
      <UnstyledButton
        type="button"
        className={styles.select}
        aria-pressed={selected}
        aria-label={`Edit ${item.label}`}
        onClick={onSelect}
      >
        <Text className={styles.label} size="sm" fw={700}>
          {index + 1}. {item.label}
        </Text>
        {item.description ? (
          <Text className={styles.description} size="xs" c="dimmed">
            {item.description}
          </Text>
        ) : null}
      </UnstyledButton>
    </Box>
  );
}

export function FactionCollectionShelf({
  items,
  sortablePrefix,
  selectedIndex,
  onSelectedIndexChange,
  onMove,
  label,
}: {
  items: FactionCollectionShelfItem[];
  sortablePrefix: string;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  onMove: (from: number, to: number) => void;
  label: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const from = indexFromSortableId(active.id, sortablePrefix);
    const to = indexFromSortableId(over.id, sortablePrefix);
    if (from == null || to == null || from === to) return;
    onMove(from, to);
    if (selectedIndex === from) {
      onSelectedIndexChange(to);
    } else if (from < selectedIndex && selectedIndex <= to) {
      onSelectedIndexChange(selectedIndex - 1);
    } else if (to <= selectedIndex && selectedIndex < from) {
      onSelectedIndexChange(selectedIndex + 1);
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
        <Box className={styles.shelf} role="list" aria-label={label}>
          {items.map((item, index) => (
            <Box key={item.id} role="listitem">
              <ShelfItem
                item={item}
                index={index}
                selected={index === selectedIndex}
                onSelect={() => onSelectedIndexChange(index)}
              />
            </Box>
          ))}
        </Box>
      </SortableContext>
    </DndContext>
  );
}
