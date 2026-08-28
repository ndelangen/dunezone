import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Button, Stack, Text, TextInput } from '@mantine/core';
import { createRulebookLocalId } from '@shared/rulebooks/contents';
import type { RulebookBlockDraft, RulebookBlockKind } from '@shared/rulebooks/contents';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { IconAction } from '@ui/control/IconAction';
import { SortableItem } from '@ui/control/SortableItem';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';
import { Plus, Trash2 } from 'lucide-react';
import type { ComponentType } from 'react';

import styles from './-rulebookBlockEditors.module.css';

type BlockOfKind<Kind extends RulebookBlockKind> = Extract<RulebookBlockDraft, { kind: Kind }>;

/** The part of one Block that its kind-specific editor may change. */
export type RulebookBlockEditorValue<Kind extends RulebookBlockKind> = Omit<
  BlockOfKind<Kind>,
  'anchor' | 'id' | 'kind'
>;

/** The complete membrane shared by every kind-specific Block editor. */
export type RulebookBlockEditorProps<Kind extends RulebookBlockKind> = Readonly<{
  value: RulebookBlockEditorValue<Kind>;
  onChange: (nextValue: RulebookBlockEditorValue<Kind>) => void;
}>;

type RulebookBlockEditorRegistry = {
  [Kind in RulebookBlockKind]: ComponentType<RulebookBlockEditorProps<Kind>>;
};

function moveRepeatedItem(itemOrder: string[], activeId: string, overId: string | undefined) {
  if (!overId) {
    return itemOrder;
  }

  const from = itemOrder.indexOf(activeId);
  const to = itemOrder.indexOf(overId);
  return from >= 0 && to >= 0 && from !== to ? arrayMove(itemOrder, from, to) : itemOrder;
}

function TextBlockEdit({ value, onChange }: RulebookBlockEditorProps<'text'>) {
  return (
    <FormattedTextInput
      label="Content"
      description="Write the text shown by this Block."
      autosize
      minRows={5}
      value={value.text}
      onChange={(text) => onChange({ text })}
    />
  );
}

function RuleGroupBlockEdit({ value, onChange }: RulebookBlockEditorProps<'rule-group'>) {
  return (
    <Stack gap="md">
      <TextInput
        label="Title"
        description="Name this group of related rules."
        value={value.title}
        onChange={(event) => onChange({ ...value, title: event.currentTarget.value })}
      />
      <FormattedTextInput
        label="Content"
        description="Write the rules that belong to this group."
        autosize
        minRows={5}
        value={value.text}
        onChange={(text) => onChange({ ...value, text })}
      />
    </Stack>
  );
}

function AssetFigureBlockEdit({ value, onChange }: RulebookBlockEditorProps<'asset-figure'>) {
  return (
    <Stack gap="md">
      <TextInput
        label="Asset"
        description="Enter the ID of the Asset this figure should show."
        placeholder="No Asset selected"
        value={value.assetId ?? ''}
        onChange={(event) => {
          const assetId = event.currentTarget.value;
          onChange({ ...value, assetId: assetId === '' ? undefined : assetId });
        }}
      />
      <FormattedTextInput
        label="Caption"
        description="Describe the figure or explain how it supports the Page."
        autosize
        minRows={3}
        value={value.text}
        onChange={(text) => onChange({ ...value, text })}
      />
    </Stack>
  );
}

function RepeatedTextBlockEdit({ value, onChange }: RulebookBlockEditorProps<'repeated-text'>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const itemOrder = moveRepeatedItem(value.itemOrder, String(active.id), over ? String(over.id) : undefined);
    if (itemOrder !== value.itemOrder) {
      onChange({ ...value, itemOrder });
    }
  };

  return (
    <Stack gap="md">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={value.itemOrder} strategy={verticalListSortingStrategy}>
          <Stack component="ul" gap="sm" className={styles.itemList}>
            {value.itemOrder.map((itemId, index) => {
              const item = value.itemsById[itemId];
              if (!item) {
                throw new Error(`Repeated-text item ${itemId} is missing from its item map`);
              }
              const label = `Item ${index + 1}`;
              return (
                <SortableItem key={itemId} as="li" id={itemId} className={styles.item}>
                  {({ setActivatorNodeRef, attributes, listeners }) => (
                    <div className={styles.itemRow}>
                      <FormattedTextInput
                        className={styles.itemInput}
                        label={label}
                        description="Write one entry in this repeated list."
                        autosize
                        minRows={2}
                        value={item.text}
                        onChange={(text) =>
                          onChange({
                            ...value,
                            itemsById: {
                              ...value.itemsById,
                              [itemId]: { ...item, text },
                            },
                          })
                        }
                      />
                      <div className={styles.itemActions}>
                        <SortableReorderHandle
                          label={`Reorder ${label.toLowerCase()}`}
                          setActivatorNodeRef={setActivatorNodeRef}
                          attributes={attributes}
                          listeners={listeners}
                        />
                        <IconAction
                          label={`Remove ${label.toLowerCase()}`}
                          color="red"
                          icon={<Trash2 size={16} aria-hidden />}
                          onClick={() => {
                            const itemsById = Object.fromEntries(
                              Object.entries(value.itemsById).filter(([existingId]) => existingId !== itemId)
                            );
                            onChange({
                              itemOrder: value.itemOrder.filter((existingId) => existingId !== itemId),
                              itemsById,
                            });
                          }}
                        />
                      </div>
                    </div>
                  )}
                </SortableItem>
              );
            })}
          </Stack>
        </SortableContext>
      </DndContext>

      {value.itemOrder.length === 0 ? (
        <Text size="sm" c="dimmed">
          This Block has no items yet.
        </Text>
      ) : null}

      <Button
        variant="default"
        size="xs"
        leftSection={<Plus size={15} aria-hidden />}
        className={styles.addAction}
        onClick={() => {
          const id = createRulebookLocalId(Object.keys(value.itemsById));
          onChange({
            itemOrder: [...value.itemOrder, id],
            itemsById: { ...value.itemsById, [id]: { id, text: '' } },
          });
        }}
      >
        Add item
      </Button>
    </Stack>
  );
}

/** Every supported Block kind must have one editor with its exact value type. */
export const rulebookBlockEditors = {
  text: TextBlockEdit,
  'repeated-text': RepeatedTextBlockEdit,
  'rule-group': RuleGroupBlockEdit,
  'asset-figure': AssetFigureBlockEdit,
} satisfies RulebookBlockEditorRegistry;
