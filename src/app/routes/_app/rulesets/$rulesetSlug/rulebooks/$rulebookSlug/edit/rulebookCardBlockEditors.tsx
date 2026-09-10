import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Box, Button, Group, Loader, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';
import { createRulebookLocalId } from '@shared/rulebooks/contents';
import { projectRulebookCardSource } from '@shared/rulebooks/projectRenderDocument';
import type { RulebookCardSourceReference } from '@shared/rulebooks/sources';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { SortableItem } from '@ui/control/SortableItem';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';
import { lazy, Suspense, useState } from 'react';

import type { RulebookBlockEditorProps } from './rulebookBlockEditors';
import styles from './rulebookCardBlockEditors.module.css';
import type { RulebookEditorReferences } from './rulebookVisualBlockEditors';

const RulebookSourcePicker = lazy(() =>
  import('@app/pickers/RulebookSourcePicker').then((module) => ({ default: module.RulebookSourcePicker }))
);
const emptyReferences = { assetsById: {}, factionsById: {} };

function cardLabel(source: RulebookCardSourceReference | undefined, references: RulebookEditorReferences) {
  const resolved = projectRulebookCardSource(source, references.assetsById);
  return resolved.status === 'ready'
    ? resolved.name || 'Unnamed Card'
    : resolved.status === 'unavailable'
      ? 'Unavailable Card'
      : 'Choose Card';
}

function CardSourceControl({
  source,
  references,
  onChange,
}: {
  source?: RulebookCardSourceReference;
  references: RulebookEditorReferences;
  onChange: (source: RulebookCardSourceReference | undefined) => void;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <ControlBlock
      title="Card"
      description="The name and image follow the selected Card. Your guidance stays in this Rulebook."
      input={
        <Stack gap="sm">
          <Group gap="sm">
            <Button variant="default" onClick={() => setOpened(!opened)}>
              {cardLabel(source, references)}
            </Button>
            {source ? (
              <Button variant="subtle" onClick={() => onChange(undefined)}>
                Clear Card
              </Button>
            ) : null}
          </Group>
          {opened ? (
            <Suspense fallback={<Loader size="sm" aria-label="Loading Cards" />}>
              <RulebookSourcePicker
                purpose="card"
                onPick={(next) => {
                  if (next.kind === 'asset') {
                    onChange(next);
                    setOpened(false);
                  }
                }}
                onCancel={() => setOpened(false)}
              />
            </Suspense>
          ) : null}
        </Stack>
      }
    />
  );
}

function CardGuidanceFields({
  text,
  quantity,
  onChange,
}: {
  text: string;
  quantity?: number;
  onChange: (fields: { text?: string; quantity?: number }) => void;
}) {
  return (
    <Stack gap="md">
      <ControlBlock
        title="Quantity"
        description="Optional count for the collection or example you are describing."
        input={
          <NumberInput
            aria-label="Quantity"
            min={0}
            allowDecimal={false}
            value={quantity ?? ''}
            onChange={(next) => onChange({ quantity: typeof next === 'number' ? next : undefined })}
          />
        }
      />
      <ControlBlock
        title="Guidance"
        input={
          <FormattedTextInput
            aria-label="Guidance"
            autosize
            minRows={3}
            value={text}
            onChange={(next) => onChange({ text: next })}
          />
        }
      />
    </Stack>
  );
}

export function CardEntryEdit({
  value,
  onChange,
  references = emptyReferences,
}: RulebookBlockEditorProps<'card-entry'>) {
  return (
    <Stack gap="md">
      <CardSourceControl
        source={value.source}
        references={references}
        onChange={(source) => onChange({ ...value, source })}
      />
      <CardGuidanceFields
        text={value.text}
        quantity={value.quantity}
        onChange={(fields) => onChange({ ...value, ...fields })}
      />
    </Stack>
  );
}

export function CardGroupEdit({
  value,
  onChange,
  references = emptyReferences,
}: RulebookBlockEditorProps<'card-group'>) {
  const [selectedId, setSelectedId] = useState<string | null>(value.itemOrder[0] ?? null);
  const activeId = selectedId && value.itemsById[selectedId] ? selectedId : value.itemOrder[0];
  const item = activeId ? value.itemsById[activeId] : undefined;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const updateItem = (fields: Partial<NonNullable<typeof item>>) => {
    if (item) {
      onChange({ ...value, itemsById: { ...value.itemsById, [item.id]: { ...item, ...fields } } });
    }
  };
  return (
    <Stack gap="md">
      <ControlBlock
        title="Heading"
        input={
          <TextInput
            aria-label="Heading"
            value={value.title}
            onChange={(event) => onChange({ ...value, title: event.currentTarget.value })}
          />
        }
      />
      <ControlBlock
        title="Shared guidance"
        input={
          <FormattedTextInput
            aria-label="Shared guidance"
            autosize
            minRows={3}
            value={value.text}
            onChange={(text) => onChange({ ...value, text })}
          />
        }
      />
      <ControlBlock
        title="Treatment"
        description="Use compact rows, a gallery, or a larger featured Card. All members keep their guidance."
        input={
          <Select
            aria-label="Treatment"
            value={value.variant}
            data={[
              { value: 'compact', label: 'Compact' },
              { value: 'gallery', label: 'Gallery' },
              { value: 'featured-member', label: 'Featured Card' },
            ]}
            onChange={(variant) => {
              if (variant === 'compact' || variant === 'gallery' || variant === 'featured-member') {
                onChange({ ...value, variant });
              }
            }}
          />
        }
      />
      {value.variant === 'featured-member' ? (
        <ControlBlock
          title="Featured Card"
          description="Choose a member of this group. It stays featured when you reorder the group."
          input={
            <Select
              aria-label="Featured Card"
              clearable
              placeholder="Choose a member"
              value={value.featuredItemId ?? null}
              data={value.itemOrder.map((id, index) => ({
                value: id,
                label: `${index + 1}. ${cardLabel(value.itemsById[id]!.source, references)}`,
              }))}
              onChange={(id) => onChange({ ...value, featuredItemId: id ?? undefined })}
            />
          }
        />
      ) : null}
      <ControlBlock
        title="Cards"
        description="Drag a Card to reorder it. Its guidance and quantity move with it."
        tool={
          <ListLengthActions
            addLabel="Add Card"
            removeLabel="Remove last Card"
            removeDisabled={value.itemOrder.length === 0}
            onAdd={() => {
              const id = createRulebookLocalId(Object.keys(value.itemsById));
              onChange({
                ...value,
                itemOrder: [...value.itemOrder, id],
                itemsById: { ...value.itemsById, [id]: { id, text: '' } },
              });
              setSelectedId(id);
            }}
            onRemove={() => {
              const removed = value.itemOrder.at(-1);
              onChange({
                ...value,
                itemOrder: value.itemOrder.slice(0, -1),
                itemsById: Object.fromEntries(Object.entries(value.itemsById).filter(([id]) => id !== removed)),
                featuredItemId: value.featuredItemId === removed ? undefined : value.featuredItemId,
              });
            }}
          />
        }
        input={
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={({ active, over }) => {
              if (!over) {
                return;
              }
              const from = value.itemOrder.indexOf(String(active.id));
              const to = value.itemOrder.indexOf(String(over.id));
              if (from >= 0 && to >= 0 && from !== to) {
                setSelectedId(activeId ?? null);
                onChange({ ...value, itemOrder: arrayMove(value.itemOrder, from, to) });
              }
            }}
          >
            <SortableContext items={value.itemOrder} strategy={verticalListSortingStrategy}>
              <Stack component="ul" className={styles.entries} gap="xs">
                {value.itemOrder.map((id, index) => (
                  <SortableItem as="li" key={id} id={id}>
                    {({ setActivatorNodeRef, attributes, listeners }) => (
                      <Box className={styles.row}>
                        <Button
                          fullWidth
                          className={styles.select}
                          justify="start"
                          color="selected"
                          variant={activeId === id ? 'light' : 'subtle'}
                          aria-pressed={activeId === id}
                          onClick={() => setSelectedId(id)}
                        >
                          {index + 1}. {cardLabel(value.itemsById[id]!.source, references)}
                        </Button>
                        <SortableReorderHandle
                          className={styles.handle}
                          label={`Reorder Card ${index + 1}`}
                          setActivatorNodeRef={setActivatorNodeRef}
                          attributes={attributes}
                          listeners={listeners}
                        />
                      </Box>
                    )}
                  </SortableItem>
                ))}
              </Stack>
            </SortableContext>
          </DndContext>
        }
      />
      {item ? (
        <Stack key={item.id} gap="md">
          <Text size="sm" fw={700}>
            Edit Card {value.itemOrder.indexOf(item.id) + 1}
          </Text>
          <CardSourceControl
            source={item.source}
            references={references}
            onChange={(source) => updateItem({ source })}
          />
          <CardGuidanceFields text={item.text} quantity={item.quantity} onChange={updateItem} />
        </Stack>
      ) : null}
    </Stack>
  );
}
