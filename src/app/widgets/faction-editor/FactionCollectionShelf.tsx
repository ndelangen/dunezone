import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Box, Text, UnstyledButton } from '@mantine/core';
import { FormattedTextSource } from '@ui/content/FormattedText';
import { IconAction } from '@ui/control/IconAction';
import { GripVertical } from 'lucide-react';

import { indexFromSortableId } from './dnd-sortable-ids';
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
    <Box ref={sortable.setNodeRef} className={styles.item} data-selected={selected} style={sortable.style}>
      <IconAction
        label={`Drag to reorder ${item.label}`}
        tooltip={`Reorder ${item.label}`}
        ref={sortable.handle.ref}
        {...sortable.handle.attributes}
        {...sortable.handle.listeners}
        className={styles.handle}
        variant="subtle"
        intent="neutral"
        icon={<GripVertical size={17} aria-hidden />}
      />
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
          <FormattedTextSource source={item.description} className={styles.description} size="xs" tone="neutral" />
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
    if (!over) {
      return;
    }
    const from = indexFromSortableId(active.id, sortablePrefix);
    const to = indexFromSortableId(over.id, sortablePrefix);
    if (from == null || to == null || from === to) {
      return;
    }
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
