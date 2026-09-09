import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Button, Select, Stack, Text, TextInput } from '@mantine/core';
import { createRulebookLocalId } from '@shared/rulebooks/contents';
import type { RulebookBlockDraft, RulebookBlockKind } from '@shared/rulebooks/contents';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { IconAction } from '@ui/control/IconAction';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { SortableItem } from '@ui/control/SortableItem';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';
import { Plus, Trash2 } from 'lucide-react';
import type { ComponentType } from 'react';

import styles from './rulebookBlockEditors.module.css';
import {
  ReferencedIllustrationEdit,
  IllustratedInventoryEdit,
  FactionIntroductionEdit,
} from './rulebookVisualBlockEditors';
import type { RulebookEditorReferences } from './rulebookVisualBlockEditors';

type BlockOfKind<Kind extends RulebookBlockKind> = Extract<RulebookBlockDraft, { kind: Kind }>;

/** The part of one Block that its kind-specific editor may change. */
export type RulebookBlockEditorValue<Kind extends RulebookBlockKind> = Omit<
  BlockOfKind<Kind>,
  'anchor' | 'id' | 'kind'
>;

/** The complete membrane shared by every kind-specific Block editor. */
export type RulebookBlockEditorProps<Kind extends RulebookBlockKind> = Readonly<{
  value: RulebookBlockEditorValue<Kind>;
  references?: RulebookEditorReferences;
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
    <Stack gap="md">
      <ControlBlock
        title="Name"
        description="Optional bold name before this text."
        input={
          <TextInput
            aria-label="Name"
            value={value.name ?? ''}
            onChange={(event) => onChange({ ...value, name: event.currentTarget.value || undefined })}
          />
        }
      />
      <ControlBlock
        title="Content"
        description="Write the text shown by this Block."
        input={
          <FormattedTextInput
            aria-label="Content"
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

function SectionHeadingEdit({ value, onChange }: RulebookBlockEditorProps<'section-heading'>) {
  return (
    <ControlBlock
      title="Title"
      description="Introduce a section of related rules. A linked faction supplies its current colour."
      input={
        <TextInput
          aria-label="Title"
          value={value.title}
          onChange={(event) => onChange({ ...value, title: event.currentTarget.value })}
        />
      }
    />
  );
}

function CalloutEdit({ value, onChange }: RulebookBlockEditorProps<'callout'>) {
  return (
    <Stack gap="md">
      <ControlBlock
        title="Style"
        description="Distinguish a note, a worked example, or a quotation."
        input={
          <Select
            aria-label="Style"
            data={[
              { value: 'note', label: 'Note' },
              { value: 'example', label: 'Example' },
              { value: 'quotation', label: 'Quotation' },
            ]}
            value={value.variant}
            onChange={(variant) => {
              if (variant === 'note' || variant === 'example' || variant === 'quotation') {
                onChange({ ...value, variant });
              }
            }}
          />
        }
      />
      <ControlBlock
        title="Title"
        description="Optional title for this callout."
        input={
          <TextInput
            aria-label="Title"
            value={value.title ?? ''}
            onChange={(event) => onChange({ ...value, title: event.currentTarget.value || undefined })}
          />
        }
      />
      <ControlBlock
        title="Content"
        description="Write the note, example, or quotation."
        input={
          <FormattedTextInput
            aria-label="Content"
            autosize
            minRows={5}
            value={value.text}
            onChange={(text) => onChange({ ...value, text })}
          />
        }
      />
      {value.variant === 'quotation' ? (
        <ControlBlock
          title="Attribution"
          description="Optional name of the person or source being quoted."
          input={
            <TextInput
              aria-label="Attribution"
              value={value.attribution ?? ''}
              onChange={(event) => onChange({ ...value, attribution: event.currentTarget.value || undefined })}
            />
          }
        />
      ) : null}
    </Stack>
  );
}

function QuestionAnswerEdit({ value, onChange }: RulebookBlockEditorProps<'question-answer'>) {
  return (
    <Stack gap="md">
      <ControlBlock
        title="Topic"
        description="Optional topic label for this question and answer."
        input={
          <TextInput
            aria-label="Topic"
            value={value.topic ?? ''}
            onChange={(event) => onChange({ ...value, topic: event.currentTarget.value || undefined })}
          />
        }
      />
      <ControlBlock
        title="Question"
        description="The question this entry answers."
        input={
          <FormattedTextInput
            aria-label="Question"
            autosize
            minRows={3}
            value={value.question}
            onChange={(question) => onChange({ ...value, question })}
          />
        }
      />
      <ControlBlock
        title="Answer"
        description="Explain the ruling or clarify the rule."
        input={
          <FormattedTextInput
            aria-label="Answer"
            autosize
            minRows={5}
            value={value.answer}
            onChange={(answer) => onChange({ ...value, answer })}
          />
        }
      />
    </Stack>
  );
}

function ListBlockEdit({ value, onChange }: RulebookBlockEditorProps<'list'>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const itemOrder = moveRepeatedItem(value.itemOrder, String(active.id), over ? String(over.id) : undefined);
    if (itemOrder !== value.itemOrder) {
      onChange({ ...value, itemOrder });
    }
  };
  return (
    <Stack gap="md">
      <ControlBlock
        title="Style"
        description="Number steps that must be followed in order, or use bullets for related points."
        input={
          <Select
            aria-label="Style"
            data={[
              { value: 'bulleted', label: 'Bulleted' },
              { value: 'numbered', label: 'Numbered' },
            ]}
            value={value.style}
            onChange={(style) => {
              if (style === 'bulleted' || style === 'numbered') {
                onChange({ ...value, style });
              }
            }}
          />
        }
      />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={value.itemOrder} strategy={verticalListSortingStrategy}>
          <Stack component="ul" gap="md" className={styles.itemList}>
            {value.itemOrder.map((itemId, index) => {
              const item = value.itemsById[itemId]!;
              const label = `Item ${index + 1}`;
              return (
                <SortableItem key={itemId} as="li" id={itemId} className={styles.item}>
                  {({ setActivatorNodeRef, attributes, listeners }) => (
                    <div className={styles.itemRow}>
                      <Stack gap="sm" className={styles.itemInput}>
                        <ControlBlock
                          title={`${label} name`}
                          description="Optional bold name before this item."
                          input={
                            <TextInput
                              aria-label={`${label} name`}
                              value={item.name ?? ''}
                              onChange={(event) =>
                                onChange({
                                  ...value,
                                  itemsById: {
                                    ...value.itemsById,
                                    [itemId]: { ...item, name: event.currentTarget.value || undefined },
                                  },
                                })
                              }
                            />
                          }
                        />
                        <ControlBlock
                          title={label}
                          description="Write one step or point."
                          input={
                            <FormattedTextInput
                              aria-label={label}
                              autosize
                              minRows={2}
                              value={item.text}
                              onChange={(text) =>
                                onChange({ ...value, itemsById: { ...value.itemsById, [itemId]: { ...item, text } } })
                              }
                            />
                          }
                        />
                      </Stack>
                      <SortableReorderHandle
                        label={`Reorder ${label.toLowerCase()}`}
                        setActivatorNodeRef={setActivatorNodeRef}
                        attributes={attributes}
                        listeners={listeners}
                      />
                    </div>
                  )}
                </SortableItem>
              );
            })}
          </Stack>
        </SortableContext>
      </DndContext>
      <ListLengthActions
        addLabel="Add item"
        removeLabel="Remove last item"
        removeDisabled={value.itemOrder.length === 0}
        onAdd={() => {
          const id = createRulebookLocalId(Object.keys(value.itemsById));
          onChange({
            ...value,
            itemOrder: [...value.itemOrder, id],
            itemsById: { ...value.itemsById, [id]: { id, text: '' } },
          });
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
    </Stack>
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
                          intent="negative"
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
  'referenced-illustration': ReferencedIllustrationEdit,
  'illustrated-inventory': IllustratedInventoryEdit,
  'faction-introduction': FactionIntroductionEdit,
  'section-heading': SectionHeadingEdit,
  list: ListBlockEdit,
  callout: CalloutEdit,
  'question-answer': QuestionAnswerEdit,
  'repeated-text': RepeatedTextBlockEdit,
  'rule-group': RuleGroupBlockEdit,
  'asset-figure': AssetFigureBlockEdit,
} satisfies RulebookBlockEditorRegistry;
