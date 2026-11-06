import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Box, NumberInput, Select, Stack, Switch, Text, TextInput } from '@mantine/core';
import type { RulebookContentsDraftV1, RulebookIllustrationSize } from '@shared/rulebooks/contents';
import { createRulebookLocalId, rulebookIllustrationSizeSchema } from '@shared/rulebooks/contents';
import { projectRulebookSource } from '@shared/rulebooks/projectRenderDocument';
import type { RulebookResolvedAssetsById, RulebookResolvedFactionsById } from '@shared/rulebooks/projectRenderDocument';
import type { RulebookSourceReference } from '@shared/rulebooks/sources';
import { ListChapter } from '@ui/block/ListChapter';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { PickerField } from '@ui/control/PickerField';
import { SortableItem } from '@ui/control/SortableItem';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';
import { lazy, useState } from 'react';

const FactionPicker = lazy(() =>
  import('@app/pickers/FactionPicker').then((module) => ({ default: module.FactionPicker }))
);
const RulebookSourcePicker = lazy(() =>
  import('@app/pickers/RulebookSourcePicker').then((module) => ({ default: module.RulebookSourcePicker }))
);

import { SelectableRow } from '@ui/control/SelectableRow';

import type { RulebookBlockEditorProps } from './rulebookBlockEditors';
import styles from './rulebookVisualBlockEditors.module.css';

const emptyReferences = { assetsById: {}, factionsById: {} };
export type RulebookEditorReferences = {
  contents?: RulebookContentsDraftV1;
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
  return (
    <PickerField
      title="Source"
      description="The image follows this source. Changing it keeps your caption and explanation."
      chosen={sourceLabel(source, references)}
      onClear={source ? () => onChange(undefined) : undefined}
      loadingLabel="Loading sources"
      picker={(close) => (
        <RulebookSourcePicker
          initialKind={source?.kind}
          onPick={(next) => {
            onChange(next);
            close();
          }}
          onCancel={close}
        />
      )}
    />
  );
}

export function IllustrationSizeControl({
  value,
  onChange,
}: {
  value?: RulebookIllustrationSize;
  onChange: (value: RulebookIllustrationSize | undefined) => void;
}) {
  return (
    <ControlBlock
      title="Illustration size"
      description="Fit the whole image within a small, medium or large area."
      input={(fieldProps) => (
        <Select
          {...fieldProps}
          clearable
          placeholder="Original size"
          value={value ?? null}
          data={[
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' },
          ]}
          onChange={(next) => onChange(rulebookIllustrationSizeSchema.optional().parse(next ?? undefined))}
        />
      )}
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
      <IllustrationSizeControl value={value.size} onChange={(size) => onChange({ ...value, size })} />
      <ControlBlock
        title="Caption"
        input={(fieldProps) => (
          <TextInput
            {...fieldProps}
            value={value.caption}
            onChange={(event) => onChange({ ...value, caption: event.currentTarget.value })}
          />
        )}
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
        input={(fieldProps) => (
          <TextInput
            {...fieldProps}
            value={value.title ?? ''}
            onChange={(event) => onChange({ ...value, title: event.currentTarget.value || undefined })}
          />
        )}
      />
      <ControlBlock
        title="Introduction"
        input={(fieldProps) => (
          <FormattedTextInput
            {...fieldProps}
            minRows={2}
            value={value.introduction}
            onChange={(introduction) => onChange({ ...value, introduction })}
          />
        )}
      />
      <ListChapter
        title="Entries"
        help="Drag an entry to reorder it. Its source, quantity and explanation move together."
        actions={
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
      >
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
                        <SelectableRow
                          className={styles.select}
                          selected={activeId === id}
                          onSelect={() => setSelectedId(id)}
                        >
                          {label}
                        </SelectableRow>
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
      </ListChapter>
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
            input={(fieldProps) => (
              <NumberInput
                {...fieldProps}
                min={0}
                allowDecimal={false}
                value={item.quantity ?? ''}
                onChange={(quantity) => updateItem({ quantity: typeof quantity === 'number' ? quantity : undefined })}
              />
            )}
          />
          <ControlBlock
            title="Caption"
            description="Optional label for display-only artwork."
            input={(fieldProps) => (
              <TextInput
                {...fieldProps}
                value={item.caption ?? ''}
                onChange={(event) => updateItem({ caption: event.currentTarget.value || undefined })}
              />
            )}
          />
          <ControlBlock
            title="Explanation"
            input={(fieldProps) => (
              <FormattedTextInput
                {...fieldProps}
                minRows={3}
                value={item.text}
                onChange={(text) => updateItem({ text })}
              />
            )}
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
  const faction = value.factionId ? references.factionsById[value.factionId] : undefined;
  return (
    <Stack gap="md">
      <PickerField
        title="Faction"
        description={
          'Name, emblem, ruler and Leaders follow the selected faction.\nYour introduction stays in this Block.'
        }
        chosen={value.factionId ? (faction?.name ?? 'Unavailable faction') : 'Choose faction'}
        onClear={value.factionId ? () => onChange({ ...value, factionId: undefined }) : undefined}
        loadingLabel="Loading factions"
        picker={(close) => (
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
              close();
            }}
            onCancel={close}
          />
        )}
      />
      <ControlBlock
        title="Flip layout"
        description="Place the faction token on the right in wide layouts."
        input={(fieldProps) => (
          <Switch
            {...fieldProps}
            checked={value.flipped ?? false}
            onChange={(event) => onChange({ ...value, flipped: event.currentTarget.checked })}
          />
        )}
      />
      <ControlBlock
        title="Introduction"
        input={(fieldProps) => (
          <FormattedTextInput
            {...fieldProps}
            minRows={5}
            value={value.text}
            onChange={(text) => onChange({ ...value, text })}
          />
        )}
      />
    </Stack>
  );
}
