import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { MultiSelect, Select, Stack, TextInput } from '@mantine/core';
import { createRulebookLocalId, rulebookListIconSchema } from '@shared/rulebooks/contents';
import type { RulebookBlockDraft, RulebookBlockKind } from '@shared/rulebooks/contents';
import { rulebookReferenceTargets } from '@shared/rulebooks/projectRenderDocument';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { SortableItem } from '@ui/control/SortableItem';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';
import type { ComponentType } from 'react';

import { AssetExplainerEdit } from './rulebookAssetExplainerEdit';
import { BattleStepEdit } from './rulebookBattleStepEdit';
import styles from './rulebookBlockEditors.module.css';
import { CardEntryEdit, CardGroupEdit } from './rulebookCardBlockEditors';
import { rulebookIconOptions } from './rulebookIconOptions';
import { CreditsEdit, movedOrder, ReferenceTableEdit } from './rulebookReferenceBlockEditors';
import { BoardSceneEdit, PieceMovementEdit, BattleComparisonEdit } from './rulebookSceneBlockEditors';
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

function TextBlockEdit({ value, onChange, references }: RulebookBlockEditorProps<'text'>) {
  const targets = references?.contents
    ? rulebookReferenceTargets(references.contents, references.assetsById, references.factionsById)
    : [];
  const selected = (value.references ?? []).map((target) => `${target.pageId}/${target.blockId ?? ''}`);
  const options = targets.map((target) => ({
    value: `${target.pageId}/${'blockId' in target ? target.blockId : ''}`,
    label: `${target.label} (page ${target.pageNumber})`,
  }));
  for (const id of selected) {
    if (!options.some((option) => option.value === id)) {
      options.push({ value: id, label: 'Reference unavailable' });
    }
  }
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
        title="Step number"
        description="Optional marker for a step in a procedure. Uses the same heading and alignment as illustrated steps."
        input={
          <TextInput
            aria-label="Step number"
            value={value.step ?? ''}
            onChange={(event) => onChange({ ...value, step: event.currentTarget.value || undefined })}
          />
        }
      />
      <ControlBlock
        title="Related rules"
        description="Links follow their destination and show the current page number in print."
        input={
          <MultiSelect
            aria-label="Related rules"
            searchable
            clearable
            data={options}
            value={selected}
            onChange={(next) =>
              onChange({
                ...value,
                references: next.length
                  ? next.map((key) => {
                      const [pageId, blockId] = key.split('/');
                      return { pageId: pageId!, ...(blockId ? { blockId } : {}) };
                    })
                  : undefined,
              })
            }
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

const listIconOptions = rulebookIconOptions(rulebookListIconSchema.options.flatMap((schema) => schema.options));

function ListBlockEdit({ value, onChange }: RulebookBlockEditorProps<'list'>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const itemOrder = movedOrder(value.itemOrder, String(active.id), over ? String(over.id) : undefined);
    if (itemOrder !== value.itemOrder) {
      onChange({ ...value, itemOrder: [...itemOrder] });
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
                          title={`${label} icon`}
                          description="Optional symbol in a circular frame beside this item."
                          input={
                            <AssetSelect
                              aria-label={`${label} icon`}
                              placeholder="No icon"
                              data={listIconOptions}
                              getPreviewSrc={(icon) => icon}
                              glyphPreviews
                              clearable
                              value={item.icon ?? null}
                              onChange={(selected) => {
                                const icon = selected === null ? undefined : rulebookListIconSchema.parse(selected);
                                onChange({ ...value, itemsById: { ...value.itemsById, [itemId]: { ...item, icon } } });
                              }}
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

/** Every supported Block kind must have one editor with its exact value type. */
export const rulebookBlockEditors = {
  text: TextBlockEdit,
  'battle-step': BattleStepEdit,
  'board-scene': BoardSceneEdit,
  'piece-movement': PieceMovementEdit,
  'battle-comparison': BattleComparisonEdit,
  'asset-explainer': AssetExplainerEdit,
  'card-entry': CardEntryEdit,
  'card-group': CardGroupEdit,
  'referenced-illustration': ReferencedIllustrationEdit,
  'illustrated-inventory': IllustratedInventoryEdit,
  'faction-introduction': FactionIntroductionEdit,
  'section-heading': SectionHeadingEdit,
  list: ListBlockEdit,
  callout: CalloutEdit,
  'question-answer': QuestionAnswerEdit,
  'reference-table': ReferenceTableEdit,
  credits: CreditsEdit,
} satisfies RulebookBlockEditorRegistry;
