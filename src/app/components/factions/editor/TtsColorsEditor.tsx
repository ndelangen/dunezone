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
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { GripVertical, Plus, Trash2 } from 'lucide-react';

import type { Faction } from '@db/factions';
import { getSortableIds, indexFromSortableId } from '@app/lib/dnd-sortable-ids';
import { TTS_COLOR_SWATCHES } from '@game/data/ttsColors';
import { TTSColor } from '@game/schema/faction';

import { useFactionSortableItem } from './useFactionSortableItem';

type TtsColor = Faction['colors'][number];

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
  onChange,
  onRemove,
}: {
  color: TtsColor;
  index: number;
  itemId: string;
  onChange: (color: TtsColor) => void;
  onRemove: () => void;
}) {
  const sortable = useFactionSortableItem(itemId);
  return (
    <Paper ref={sortable.setNodeRef} style={sortable.style} withBorder radius="md" p="sm">
      <Group gap="sm" wrap="nowrap">
        <Tooltip label={`Reorder TTS color ${index + 1}`}>
          <ActionIcon
            ref={sortable.handle.ref}
            {...sortable.handle.attributes}
            {...sortable.handle.listeners}
            type="button"
            variant="subtle"
            color="gray"
            size="lg"
            aria-label={`Drag to reorder TTS color ${index + 1}`}
            style={{ touchAction: 'none', cursor: 'grab' }}
          >
            <GripVertical size={18} aria-hidden />
          </ActionIcon>
        </Tooltip>

        <Select
          aria-label={`TTS color ${index + 1}`}
          value={color}
          allowDeselect={false}
          data={TTSColor.options}
          leftSection={<ColorDot color={color} />}
          renderOption={({ option }) => <TtsColorOption color={option.value as TtsColor} />}
          comboboxProps={{ withinPortal: false }}
          style={{ flex: 1 }}
          onChange={(value) => {
            if (value) onChange(value as TtsColor);
          }}
        />

        <Tooltip label={`Remove TTS color ${index + 1}`}>
          <ActionIcon
            type="button"
            variant="light"
            color="red"
            aria-label={`Remove TTS color ${index + 1}`}
            onClick={onRemove}
          >
            <Trash2 size={16} aria-hidden />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Paper>
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

  return (
    <Stack gap="md">
      <Stack gap={2}>
        <Text fw={700}>Tabletop Simulator colors</Text>
        <Text c="dimmed" size="sm">
          Ordered preferred player colors for Tabletop Simulator. Repeated colors are allowed by the
          faction format.
        </Text>
      </Stack>

      {value.length === 0 ? (
        <Alert color="gray" variant="light" title="No preferred TTS colors">
          This faction does not currently recommend a player color.
        </Alert>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={({ active, over }: DragEndEvent) => {
          if (!over) return;
          const from = indexFromSortableId(active.id, sortablePrefix);
          const to = indexFromSortableId(over.id, sortablePrefix);
          if (from == null || to == null || from === to) return;
          onChange(arrayMove(value, from, to));
        }}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <Stack gap="xs">
            {value.map((color, index) => {
              const itemId = `${sortablePrefix}${index}`;
              return (
                <TtsColorRow
                  key={itemId}
                  color={color}
                  index={index}
                  itemId={itemId}
                  onChange={(nextColor) => {
                    const next = [...value];
                    next[index] = nextColor;
                    onChange(next);
                  }}
                  onRemove={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
                />
              );
            })}
          </Stack>
        </SortableContext>
      </DndContext>

      <Button
        type="button"
        variant="light"
        color="dune"
        leftSection={<Plus size={16} aria-hidden />}
        onClick={() => onChange([...value, 'White'])}
      >
        Add TTS color
      </Button>
    </Stack>
  );
}
