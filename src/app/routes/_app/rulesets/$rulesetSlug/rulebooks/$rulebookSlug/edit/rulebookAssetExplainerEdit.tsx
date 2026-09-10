import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Box, Button, ColorInput, Group, NumberInput, Select, Slider, Stack, Switch, TextInput } from '@mantine/core';
import { COMPONENT_PART_LABELS } from '@shared/asset-publishing/componentGeometry';
import {
  projectRulebookAssetExplainerAnnotations,
  RULEBOOK_ANNOTATION_COLORS,
} from '@shared/rulebooks/assetExplainerAnnotations';
import { createRulebookLocalId, rulebookAssetExplainerColorSchema } from '@shared/rulebooks/contents';
import { projectRulebookSource } from '@shared/rulebooks/projectRenderDocument';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { SortableItem } from '@ui/control/SortableItem';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';
import { useState } from 'react';

import styles from './rulebookAssetExplainerEdit.module.css';
import type { RulebookBlockEditorProps } from './rulebookBlockEditors';
import { RulebookSourceControl } from './rulebookVisualBlockEditors';

/** The route owns the draft; this editor reports source choices, ordered explanations and target changes. */
export function AssetExplainerEdit({
  value,
  onChange,
  references = { assetsById: {}, factionsById: {} },
}: RulebookBlockEditorProps<'asset-explainer'>) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = selectedId && value.itemsById[selectedId] ? selectedId : value.itemOrder[0];
  const item = activeId ? value.itemsById[activeId] : undefined;
  const source = projectRulebookSource(value.source, references.assetsById, references.factionsById);
  const projection = projectRulebookAssetExplainerAnnotations({
    ...value,
    source,
    items: value.itemOrder.flatMap((id) => value.itemsById[id] ?? []),
  });
  const namedKey = item?.target.kind === 'named' ? item.target.key : '';
  const selected = projection.entries.find((entry) => entry.id === activeId);
  const parts = source.status === 'ready' ? (source.geometry?.parts ?? []) : [];
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
      <ControlBlock
        title="Marker labels"
        description="Automatic numbers follow entry order. Custom labels stay with their entries when reordered."
        input={
          <Select
            aria-label="Marker labels"
            value={value.numbering}
            data={[
              { value: 'automatic', label: 'Automatic numbers (1, 2, 3)' },
              { value: 'custom', label: 'Custom labels' },
            ]}
            onChange={(numbering) => {
              if (numbering === 'automatic' || numbering === 'custom') {
                onChange({ ...value, numbering });
              }
            }}
          />
        }
      />
      <ControlBlock
        title="Automatic colors"
        description="Colors follow entry order. Turn off to choose each marker's color. Your manual choices are kept."
        input={
          <Switch
            aria-label="Automatic colors"
            checked={value.colorMode === 'automatic'}
            onChange={(event) => {
              const automatic = event.currentTarget.checked;
              const itemsById = Object.fromEntries(
                value.itemOrder.map((id, index) => {
                  const entry = value.itemsById[id]!;
                  const color = automatic
                    ? entry.color !== undefined && !rulebookAssetExplainerColorSchema.safeParse(entry.color).success
                      ? projection.entries[index]!.color
                      : entry.color
                    : (entry.color ?? projection.entries[index]!.color);
                  return [id, color === entry.color ? entry : { ...entry, color }];
                })
              );
              onChange({ ...value, colorMode: automatic ? 'automatic' : 'manual', itemsById });
            }}
          />
        }
      />
      <ControlBlock
        title="Explanations"
        description="Drag an entry to reorder it. Its target, custom label, manual color and explanation move together."
        tool={
          <ListLengthActions
            addLabel="Add explanation"
            removeLabel="Remove last explanation"
            addDisabled={value.itemOrder.length >= 128}
            removeDisabled={!value.itemOrder.length}
            onAdd={() => {
              const id = createRulebookLocalId(Object.keys(value.itemsById));
              onChange({
                ...value,
                itemOrder: [...value.itemOrder, id],
                itemsById: {
                  ...value.itemsById,
                  [id]: {
                    id,
                    label: '',
                    text: '',
                    target: { kind: 'named', key: '', source: value.source },
                    ...(value.colorMode === 'manual'
                      ? {
                          color: RULEBOOK_ANNOTATION_COLORS[value.itemOrder.length % RULEBOOK_ANNOTATION_COLORS.length],
                        }
                      : {}),
                  },
                },
              });
              setSelectedId(id);
            }}
            onRemove={() => {
              const removed = value.itemOrder.at(-1);
              if (removed === activeId) {
                setSelectedId(value.itemOrder.at(-2) ?? null);
              }
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
                {projection.entries.map((entry, index) => (
                  <SortableItem as="li" key={entry.id} id={entry.id}>
                    {({ setActivatorNodeRef, attributes, listeners }) => (
                      <Box className={styles.row}>
                        <Button
                          fullWidth
                          className={styles.select}
                          justify="start"
                          color="selected"
                          variant={activeId === entry.id ? 'light' : 'subtle'}
                          aria-pressed={activeId === entry.id}
                          onClick={() => setSelectedId(entry.id)}
                        >
                          {entry.label ? `${entry.label}. ` : ''}
                          {entry.title}
                          {entry.status !== 'ready' && entry.status !== 'unselected' ? ' (unavailable)' : ''}
                        </Button>
                        <SortableReorderHandle
                          emphasis="silent"
                          className={styles.handle}
                          label={`Reorder explanation ${index + 1}`}
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
      {item && selected ? (
        <Stack gap="md">
          <ControlBlock
            title={`Edit explanation ${value.itemOrder.indexOf(item.id) + 1}`}
            input={
              <Stack gap="md">
                <Group grow align="start">
                  {value.numbering === 'custom' ? (
                    <ControlBlock
                      title="Marker label"
                      description="Number, letter or symbol."
                      input={
                        <TextInput
                          aria-label="Marker label"
                          maxLength={32}
                          value={item.label}
                          onChange={(event) => updateItem({ label: event.currentTarget.value })}
                        />
                      }
                    />
                  ) : null}
                  <ControlBlock
                    title="Target type"
                    description="Choose a named part or set a position on this source."
                    input={
                      <Select
                        aria-label="Target type"
                        value={item.target.kind}
                        data={[
                          { value: 'named', label: 'Named part' },
                          { value: 'position', label: 'Positioned marker' },
                        ]}
                        onChange={(kind) => {
                          if (kind === item.target.kind) {
                            return;
                          }
                          if (kind === 'named') {
                            updateItem({ target: { kind, key: '', source: value.source } });
                          }
                          if (kind === 'position') {
                            updateItem({ target: { kind, x: 0.5, y: 0.5, source: value.source } });
                          }
                        }}
                      />
                    }
                  />
                </Group>
                {value.colorMode === 'manual' ? (
                  <ControlBlock
                    title="Marker color"
                    description="Used for the marker, connector, highlight and explanation."
                    input={
                      <ColorInput
                        aria-label="Marker color"
                        format="hex"
                        swatches={[...RULEBOOK_ANNOTATION_COLORS]}
                        value={item.color ?? selected.color}
                        onChange={(color) => updateItem({ color })}
                        error={
                          item.color && !rulebookAssetExplainerColorSchema.safeParse(item.color).success
                            ? 'Use a six-digit hex color.'
                            : undefined
                        }
                      />
                    }
                  />
                ) : null}
                {item.target.kind === 'named' ? (
                  <ControlBlock
                    title={value.source?.kind === 'board' ? 'Territory or region' : 'Part of the component'}
                    input={
                      <Select
                        aria-label={value.source?.kind === 'board' ? 'Territory or region' : 'Part of the component'}
                        searchable
                        clearable
                        placeholder={
                          selected.status === 'source-replaced'
                            ? `${selected.title} (previous source)`
                            : 'Choose a part'
                        }
                        value={selected.status === 'source-replaced' ? null : item.target.key || null}
                        data={[
                          ...parts.map((part) => ({
                            value: part.key,
                            label: part.label ?? COMPONENT_PART_LABELS[part.key] ?? part.key,
                          })),
                          ...(item.target.key && !parts.some((part) => part.key === namedKey)
                            ? [{ value: item.target.key, label: `${selected.title} (unavailable)` }]
                            : []),
                        ]}
                        onChange={(key) =>
                          updateItem({ target: { kind: 'named', key: key ?? '', source: value.source } })
                        }
                      />
                    }
                  />
                ) : (
                  <Stack gap="md">
                    {(['x', 'y'] as const).map((axis) => {
                      const target = item.target;
                      if (target.kind !== 'position') {
                        return null;
                      }
                      const label = axis === 'x' ? 'Horizontal position' : 'Vertical position';
                      const change = (percent: number) =>
                        updateItem({
                          target: {
                            ...target,
                            [axis]: Math.min(100, Math.max(0, percent)) / 100,
                            source: value.source,
                          },
                        });
                      return (
                        <ControlBlock
                          key={axis}
                          title={label}
                          description={
                            axis === 'x'
                              ? '0% is the left edge; 100% is the right edge.'
                              : '0% is the top edge; 100% is the bottom edge.'
                          }
                          tool={
                            <NumberInput
                              aria-label={label}
                              w={96}
                              min={0}
                              max={100}
                              step={0.1}
                              decimalScale={1}
                              suffix="%"
                              value={target[axis] * 100}
                              onChange={(next) => {
                                if (typeof next === 'number') {
                                  change(next);
                                }
                              }}
                            />
                          }
                          input={
                            <Slider
                              thumbLabel={`${label} slider`}
                              min={0}
                              max={100}
                              step={0.1}
                              value={target[axis] * 100}
                              onChange={change}
                            />
                          }
                        />
                      );
                    })}
                  </Stack>
                )}
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
            }
          />
        </Stack>
      ) : null}
    </Stack>
  );
}
