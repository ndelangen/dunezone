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
import { ActionIcon, Box, Group, Select, Stack, Text, Tooltip } from '@mantine/core';
import { ControlBlock } from '@ui/input/ControlBlock';
import { ListLengthActions } from '@ui/input/ListLengthActions';
import { GripVertical } from 'lucide-react';

import type { Faction } from '@db/factions';
import { getSortableIds, indexFromSortableId } from '@app/lib/dnd-sortable-ids';
import { TTS_COLOR_SWATCHES } from '@game/data/ttsColors';
import { TTSColor } from '@game/schema/faction';

import styles from './TtsColorsEditor.module.css';
import { useFactionSortableItem } from './useFactionSortableItem';

type TtsColor = Faction['colors'][number];

export function availableTtsColors(value: Faction['colors'], index: number): TtsColor[] {
  const currentColor = value[index];
  return TTSColor.options.filter(
    (option) =>
      option === currentColor ||
      !value.some(
        (selectedColor, selectedIndex) => selectedIndex !== index && selectedColor === option
      )
  ) as TtsColor[];
}

export function nextUnusedTtsColor(value: Faction['colors']): TtsColor | undefined {
  return TTSColor.options.find((color) => !value.includes(color)) as TtsColor | undefined;
}

export function removeLastTtsColor(value: Faction['colors']): Faction['colors'] {
  return value.slice(0, -1);
}

export function moveTtsColor(
  value: Faction['colors'],
  from: number,
  to: number
): Faction['colors'] {
  if (from < 0 || to < 0 || from >= value.length || to >= value.length || from === to) {
    return value;
  }
  return arrayMove(value, from, to);
}

function ColorDot({ color }: { color: TtsColor }) {
  return (
    <Box
      component="span"
      aria-hidden
      w={16}
      h={16}
      style={{
        flexShrink: 0,
        borderRadius: '50%',
        background: TTS_COLOR_SWATCHES[color],
        border:
          color === 'White'
            ? '1px solid var(--mantine-color-gray-6)'
            : '1px solid rgba(0, 0, 0, 0.18)',
        boxShadow: color === 'White' ? 'inset 0 0 0 1px white' : undefined,
      }}
    />
  );
}

function TtsColorOption({ color }: { color: TtsColor }) {
  return (
    <Group gap="sm" wrap="nowrap">
      <ColorDot color={color} />
      <Text size="sm">{color}</Text>
    </Group>
  );
}

function TtsColorRow({
  color,
  index,
  itemId,
  options,
  onChange,
}: {
  color: TtsColor;
  index: number;
  itemId: string;
  options: TtsColor[];
  onChange: (color: TtsColor) => void;
}) {
  const sortable = useFactionSortableItem(itemId);
  return (
    <Box ref={sortable.setNodeRef} style={sortable.style} className={styles.unifiedRow}>
      <Select
        className={styles.unifiedSelect}
        aria-label={`TTS color ${index + 1}`}
        size="xs"
        variant="unstyled"
        value={color}
        allowDeselect={false}
        data={options}
        leftSection={<ColorDot color={color} />}
        renderOption={({ option }) => <TtsColorOption color={option.value as TtsColor} />}
        comboboxProps={{ withinPortal: false }}
        onChange={(value) => {
          if (value) {
            onChange(value as TtsColor);
          }
        }}
      />
      <Tooltip label={`Reorder TTS color ${index + 1}`}>
        <ActionIcon
          ref={sortable.handle.ref}
          {...sortable.handle.attributes}
          {...sortable.handle.listeners}
          className={styles.dragHandle}
          type="button"
          variant="transparent"
          color="gray"
          size="lg"
          aria-label={`Drag to reorder TTS color ${index + 1}`}
        >
          <GripVertical size={17} aria-hidden />
        </ActionIcon>
      </Tooltip>
    </Box>
  );
}

export function TtsColorsEditor({
  value,
  onChange,
}: {
  value: Faction['colors'];
  onChange: (next: Faction['colors']) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const sortablePrefix = 'tts-colors-';
  const itemIds = getSortableIds(sortablePrefix, value.length);
  const nextAvailableColor = nextUnusedTtsColor(value);

  return (
    <ControlBlock
      title="Tabletop Simulator colors"
      description="Choose unique colors; drag to set their priority."
      tool={
        <ListLengthActions
          removeLabel="Remove last TTS color"
          addLabel="Add TTS color"
          removeDisabled={value.length === 0}
          addDisabled={nextAvailableColor == null}
          onRemove={() => onChange(removeLastTtsColor(value))}
          onAdd={() => {
            if (nextAvailableColor) {
              onChange([...value, nextAvailableColor]);
            }
          }}
        />
      }
      input={
        <Stack gap={6}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={({ active, over }: DragEndEvent) => {
              if (!over) {
                return;
              }
              const from = indexFromSortableId(active.id, sortablePrefix);
              const to = indexFromSortableId(over.id, sortablePrefix);
              if (from == null || to == null || from === to) {
                return;
              }
              onChange(moveTtsColor(value, from, to));
            }}
          >
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
              <Box className={styles.rows}>
                {value.map((color, index) => {
                  const itemId = `${sortablePrefix}${index}`;
                  return (
                    <TtsColorRow
                      key={itemId}
                      color={color}
                      index={index}
                      itemId={itemId}
                      options={availableTtsColors(value, index)}
                      onChange={(nextColor) => {
                        const next = [...value];
                        next[index] = nextColor;
                        onChange(next);
                      }}
                    />
                  );
                })}
              </Box>
            </SortableContext>
          </DndContext>

          {value.length === 0 ? (
            <Text size="xs" c="dimmed">
              No preferred player colors selected.
            </Text>
          ) : null}
        </Stack>
      }
    />
  );
}
