import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Box, Button, Group, Loader, NumberInput, Stack, Text, TextInput } from '@mantine/core';
import { createRulebookLocalId } from '@shared/rulebooks/contents';
import { projectRulebookSource } from '@shared/rulebooks/projectRenderDocument';
import type { RulebookResolvedAssetsById, RulebookResolvedFactionsById } from '@shared/rulebooks/projectRenderDocument';
import type { RulebookSourceReference } from '@shared/rulebooks/sources';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { SortableItem } from '@ui/control/SortableItem';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';
import { lazy, Suspense, useState } from 'react';

const FactionPicker = lazy(() =>
  import('@app/pickers/FactionPicker').then((module) => ({ default: module.FactionPicker }))
);
const RulebookSourcePicker = lazy(() =>
  import('@app/pickers/RulebookSourcePicker').then((module) => ({ default: module.RulebookSourcePicker }))
);

import type { RulebookBlockEditorProps } from './rulebookBlockEditors';
import styles from './rulebookVisualBlockEditors.module.css';

const emptyReferences = { assetsById: {}, factionsById: {} };
export type RulebookEditorReferences = {
  assetsById: RulebookResolvedAssetsById;
  factionsById: RulebookResolvedFactionsById;
};

function sourceLabel(source: RulebookSourceReference | undefined, references: RulebookEditorReferences) {
  const resolved = projectRulebookSource(source, references.assetsById, references.factionsById);
  return resolved.status === 'ready'
    ? resolved.name
    : resolved.status === 'unavailable'
      ? 'Unavailable source'
      : 'Choose source';
}

export function RulebookSourceControl({
  source,
  onChange,
  references,
}: {
  source?: RulebookSourceReference;
  onChange: (source: RulebookSourceReference | undefined) => void;
  references: RulebookEditorReferences;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <ControlBlock
      title="Source"
      description="The image follows this source. Changing it keeps your caption and explanation."
      input={
        <Stack gap="sm">
          <Group gap="sm">
            <Button variant="default" onClick={() => setOpened(!opened)}>
              {sourceLabel(source, references)}
            </Button>
            {source ? (
              <Button variant="subtle" onClick={() => onChange(undefined)}>
                Clear source
              </Button>
            ) : null}
          </Group>
          {opened ? (
            <Suspense fallback={<Loader size="sm" aria-label="Loading sources" />}>
              <RulebookSourcePicker
                initialKind={source?.kind}
                onPick={(next) => {
                  onChange(next);
                  setOpened(false);
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

export function ReferencedIllustrationEdit({
  value,
  onChange,
  references = emptyReferences,
}: RulebookBlockEditorProps<'referenced-illustration'>) {
  return (
    <Stack gap="md">
      <RulebookSourceControl
        source={value.source}
        references={references}
        onChange={(source) => onChange({ ...value, source })}
      />
      <ControlBlock
        title="Caption"
        input={
          <TextInput
            aria-label="Caption"
            value={value.caption}
            onChange={(event) => onChange({ ...value, caption: event.currentTarget.value })}
          />
        }
      />
    </Stack>
  );
}

export function IllustratedInventoryEdit({
  value,
  onChange,
  references = emptyReferences,
}: RulebookBlockEditorProps<'illustrated-inventory'>) {
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
            value={value.title ?? ''}
            onChange={(event) => onChange({ ...value, title: event.currentTarget.value || undefined })}
          />
        }
      />
      <ControlBlock
        title="Introduction"
        input={
          <FormattedTextInput
            aria-label="Introduction"
            autosize
            minRows={2}
            value={value.introduction}
            onChange={(introduction) => onChange({ ...value, introduction })}
          />
        }
      />
      <ControlBlock
        title="Entries"
        description="Drag an entry to reorder it. Its source, quantity and explanation move together."
        tool={
          <ListLengthActions
            addLabel="Add entry"
            removeLabel="Remove last entry"
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
                {value.itemOrder.map((id, index) => {
                  const entry = value.itemsById[id]!;
                  const label = `${index + 1}. ${sourceLabel(entry.source, references)}`;
                  return (
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
                            {label}
                          </Button>
                          <SortableReorderHandle
                            className={styles.handle}
                            label={`Reorder entry ${index + 1}`}
                            setActivatorNodeRef={setActivatorNodeRef}
                            attributes={attributes}
                            listeners={listeners}
                          />
                        </Box>
                      )}
                    </SortableItem>
                  );
                })}
              </Stack>
            </SortableContext>
          </DndContext>
        }
      />
      {item ? (
        <Stack key={item.id} gap="md">
          <Text size="sm" fw={700}>
            Edit entry {value.itemOrder.indexOf(item.id) + 1}
          </Text>
          <RulebookSourceControl
            source={item.source}
            references={references}
            onChange={(source) => updateItem({ source })}
          />
          <ControlBlock
            title="Quantity"
            description="Optional count for this inventory. Leave empty when the count is not relevant."
            input={
              <NumberInput
                aria-label="Quantity"
                min={0}
                allowDecimal={false}
                value={item.quantity ?? ''}
                onChange={(quantity) => updateItem({ quantity: typeof quantity === 'number' ? quantity : undefined })}
              />
            }
          />
          <ControlBlock
            title="Caption"
            description="Optional label for display-only artwork."
            input={
              <TextInput
                aria-label="Caption"
                value={item.caption ?? ''}
                onChange={(event) => updateItem({ caption: event.currentTarget.value || undefined })}
              />
            }
          />
          <ControlBlock
            title="Explanation"
            input={
              <FormattedTextInput
                aria-label="Explanation"
                autosize
                minRows={3}
                value={item.text}
                onChange={(text) => updateItem({ text })}
              />
            }
          />
        </Stack>
      ) : null}
    </Stack>
  );
}

export function FactionIntroductionEdit({
  value,
  onChange,
  references = emptyReferences,
}: RulebookBlockEditorProps<'faction-introduction'>) {
  const [opened, setOpened] = useState(false);
  const faction = value.factionId ? references.factionsById[value.factionId] : undefined;
  return (
    <Stack gap="md">
      <ControlBlock
        title="Faction"
        description="Name, emblem, ruler and Leaders follow the selected faction. Your introduction stays in this Block."
        input={
          <Stack gap="sm">
            <Group gap="sm">
              <Button variant="default" onClick={() => setOpened(!opened)}>
                {value.factionId ? (faction?.name ?? 'Unavailable faction') : 'Choose faction'}
              </Button>
              {value.factionId ? (
                <Button variant="subtle" onClick={() => onChange({ ...value, factionId: undefined })}>
                  Clear faction
                </Button>
              ) : null}
            </Group>
            {opened ? (
              <Suspense fallback={<Loader size="sm" aria-label="Loading factions" />}>
                <FactionPicker
                  copy={{
                    title: 'Choose faction',
                    intro: 'Introduce this faction in your Rulebook.',
                    errorTitle: 'Faction could not be loaded',
                    emptyMessage: 'No factions are available.',
                    confirmTitle: 'Selected faction',
                    confirmLabel: 'Use faction',
                    confirmIntent: 'positive',
                  }}
                  onPick={(picked) => {
                    onChange({ ...value, factionId: picked.id });
                    setOpened(false);
                  }}
                  onCancel={() => setOpened(false)}
                />
              </Suspense>
            ) : null}
          </Stack>
        }
      />
      <ControlBlock
        title="Introduction"
        input={
          <FormattedTextInput
            aria-label="Introduction"
            autosize
            minRows={5}
            value={value.text}
            onChange={(text) => onChange({ ...value, text })}
          />
        }
      />
    </Stack>
  );
}
