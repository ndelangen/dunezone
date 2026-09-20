import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Stack, Text, TextInput } from '@mantine/core';
import { createRulebookLocalId } from '@shared/rulebooks/contents';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { IconAction } from '@ui/control/IconAction';
import { AddAction } from '@ui/control/ListLengthActions';
import { SortableItem } from '@ui/control/SortableItem';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';
import { Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import type { RulebookBlockEditorProps } from './rulebookBlockEditors';
import styles from './rulebookReferenceBlockEditors.module.css';

function movedOrder(order: readonly string[], activeId: string, overId: string | undefined) {
  if (!overId) {
    return order;
  }
  const from = order.indexOf(activeId);
  const to = order.indexOf(overId);
  return from >= 0 && to >= 0 && from !== to ? arrayMove([...order], from, to) : order;
}

function without<Value>(record: Readonly<Record<string, Value>>, removedId: string): Record<string, Value> {
  return Object.fromEntries(Object.entries(record).filter(([id]) => id !== removedId));
}

/**
 * One reorderable collection of the two editors here, so a column list, a row list, a group list and a contributor list share one row treatment.
 * Callers own the entry contents through `renderEntry`;
 * this owns the sortable motion, the handle and the remove action.
 */
function SortableEntries({
  order,
  noun,
  onReorder,
  onRemove,
  renderEntry,
}: {
  order: readonly string[];
  noun: string;
  onReorder: (order: string[]) => void;
  onRemove: (id: string) => void;
  renderEntry: (id: string, label: string) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const next = movedOrder(order, String(active.id), over ? String(over.id) : undefined);
    if (next !== order) {
      onReorder([...next]);
    }
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={[...order]} strategy={verticalListSortingStrategy}>
        <Stack component="ul" gap="md" className={styles.list}>
          {order.map((id, index) => {
            const label = `${noun} ${index + 1}`;
            return (
              <SortableItem key={id} as="li" id={id} className={styles.entry}>
                {({ setActivatorNodeRef, attributes, listeners }) => (
                  <div className={styles.entryRow}>
                    <Stack gap="sm" className={styles.entryFields}>
                      {renderEntry(id, label)}
                    </Stack>
                    <div className={styles.entryActions}>
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
                        onClick={() => onRemove(id)}
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
  );
}

/**
 * Columns and rows are two lists rather than a grid, because the editor pane is narrow and each cell wants a full-width formatted-text input.
 * A cell is stored only while it holds text, so clearing one removes it and the row keeps one spelling for blank.
 */
export function ReferenceTableEdit({ value, onChange }: RulebookBlockEditorProps<'reference-table'>) {
  const takenIds = () => [...Object.keys(value.columnsById), ...Object.keys(value.rowsById)];
  const setCell = (rowId: string, columnId: string, text: string) => {
    const row = value.rowsById[rowId]!;
    const cellsByColumnId =
      text === '' ? without(row.cellsByColumnId, columnId) : { ...row.cellsByColumnId, [columnId]: text };
    onChange({ ...value, rowsById: { ...value.rowsById, [rowId]: { ...row, cellsByColumnId } } });
  };
  return (
    <Stack gap="lg">
      <ControlBlock
        title="Columns"
        description="Each column keeps its cells when reordered. Removing a column removes only its cells."
        tool={
          <AddAction
            label="Add column"
            onClick={() => {
              const id = createRulebookLocalId(takenIds());
              onChange({
                ...value,
                columnOrder: [...value.columnOrder, id],
                columnsById: { ...value.columnsById, [id]: { id, label: '' } },
              });
            }}
          />
        }
        input={
          value.columnOrder.length === 0 ? (
            <Text size="sm" c="dimmed">
              This table has no columns yet.
            </Text>
          ) : (
            <SortableEntries
              order={value.columnOrder}
              noun="Column"
              onReorder={(columnOrder) => onChange({ ...value, columnOrder })}
              onRemove={(columnId) =>
                onChange({
                  ...value,
                  columnOrder: value.columnOrder.filter((id) => id !== columnId),
                  columnsById: without(value.columnsById, columnId),
                  rowsById: Object.fromEntries(
                    Object.entries(value.rowsById).map(([rowId, row]) => [
                      rowId,
                      { ...row, cellsByColumnId: without(row.cellsByColumnId, columnId) },
                    ])
                  ),
                })
              }
              renderEntry={(columnId, label) => (
                <TextInput
                  aria-label={`${label} label`}
                  placeholder="Column label"
                  value={value.columnsById[columnId]!.label}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      columnsById: {
                        ...value.columnsById,
                        [columnId]: { id: columnId, label: event.currentTarget.value },
                      },
                    })
                  }
                />
              )}
            />
          )
        }
      />
      <ControlBlock
        title="Rows"
        description="Write one cell per column. Limited formatting is allowed; there are no formulas or merged cells."
        tool={
          <AddAction
            label="Add row"
            onClick={() => {
              const id = createRulebookLocalId(takenIds());
              onChange({
                ...value,
                rowOrder: [...value.rowOrder, id],
                rowsById: { ...value.rowsById, [id]: { id, cellsByColumnId: {} } },
              });
            }}
          />
        }
        input={
          value.rowOrder.length === 0 ? (
            <Text size="sm" c="dimmed">
              This table has no rows yet.
            </Text>
          ) : (
            <SortableEntries
              order={value.rowOrder}
              noun="Row"
              onReorder={(rowOrder) => onChange({ ...value, rowOrder })}
              onRemove={(rowId) =>
                onChange({
                  ...value,
                  rowOrder: value.rowOrder.filter((id) => id !== rowId),
                  rowsById: without(value.rowsById, rowId),
                })
              }
              renderEntry={(rowId, label) =>
                value.columnOrder.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    {label} has no cells until the table has a column.
                  </Text>
                ) : (
                  value.columnOrder.map((columnId, index) => {
                    const column = value.columnsById[columnId]!;
                    const cellLabel = `${label}, ${column.label || `column ${index + 1}`}`;
                    return (
                      <FormattedTextInput
                        key={columnId}
                        aria-label={cellLabel}
                        label={column.label || `Column ${index + 1}`}
                        autosize
                        minRows={1}
                        value={value.rowsById[rowId]!.cellsByColumnId[columnId] ?? ''}
                        onChange={(text) => setCell(rowId, columnId, text)}
                      />
                    );
                  })
                )
              }
            />
          )
        }
      />
      <ControlBlock
        title="Note"
        description="Optional explanation shown under the table."
        input={
          <FormattedTextInput
            aria-label="Note"
            autosize
            minRows={2}
            value={value.note}
            onChange={(note) => onChange({ ...value, note })}
          />
        }
      />
    </Stack>
  );
}

/** Groups own their contributors, so a group carries its names when reordered and takes them with it when removed. */
export function CreditsEdit({ value, onChange }: RulebookBlockEditorProps<'credits'>) {
  const takenIds = () => [
    ...Object.keys(value.groupsById),
    ...Object.values(value.groupsById).flatMap((group) => Object.keys(group.contributorsById)),
  ];
  const replaceGroup = (groupId: string, group: (typeof value.groupsById)[string]) =>
    onChange({ ...value, groupsById: { ...value.groupsById, [groupId]: group } });
  return (
    <Stack gap="lg">
      <ControlBlock
        title="Credit groups"
        description="Name each group of contributors, such as Game design or Illustration."
        tool={
          <AddAction
            label="Add group"
            onClick={() => {
              const id = createRulebookLocalId(takenIds());
              onChange({
                ...value,
                groupOrder: [...value.groupOrder, id],
                groupsById: {
                  ...value.groupsById,
                  [id]: { id, heading: '', contributorOrder: [], contributorsById: {} },
                },
              });
            }}
          />
        }
        input={
          value.groupOrder.length === 0 ? (
            <Text size="sm" c="dimmed">
              These credits have no groups yet.
            </Text>
          ) : (
            <SortableEntries
              order={value.groupOrder}
              noun="Group"
              onReorder={(groupOrder) => onChange({ ...value, groupOrder })}
              onRemove={(groupId) =>
                onChange({
                  ...value,
                  groupOrder: value.groupOrder.filter((id) => id !== groupId),
                  groupsById: without(value.groupsById, groupId),
                })
              }
              renderEntry={(groupId, label) => {
                const group = value.groupsById[groupId]!;
                return (
                  <Stack gap="sm" className={styles.group}>
                    <TextInput
                      aria-label={`${label} heading`}
                      placeholder="Group heading"
                      value={group.heading}
                      onChange={(event) => replaceGroup(groupId, { ...group, heading: event.currentTarget.value })}
                    />
                    <ControlBlock
                      title="Contributors"
                      description="A name and an optional role. Contributors do not need an account."
                      tool={
                        <AddAction
                          label={`Add contributor to ${label.toLowerCase()}`}
                          onClick={() => {
                            const id = createRulebookLocalId(takenIds());
                            replaceGroup(groupId, {
                              ...group,
                              contributorOrder: [...group.contributorOrder, id],
                              contributorsById: { ...group.contributorsById, [id]: { id, name: '' } },
                            });
                          }}
                        />
                      }
                      input={
                        group.contributorOrder.length === 0 ? (
                          <Text size="sm" c="dimmed">
                            {label} has no contributors yet.
                          </Text>
                        ) : (
                          <SortableEntries
                            order={group.contributorOrder}
                            noun={`${label} contributor`}
                            onReorder={(contributorOrder) => replaceGroup(groupId, { ...group, contributorOrder })}
                            onRemove={(contributorId) =>
                              replaceGroup(groupId, {
                                ...group,
                                contributorOrder: group.contributorOrder.filter((id) => id !== contributorId),
                                contributorsById: without(group.contributorsById, contributorId),
                              })
                            }
                            renderEntry={(contributorId, contributorLabel) => {
                              const contributor = group.contributorsById[contributorId]!;
                              return (
                                <>
                                  <TextInput
                                    aria-label={`${contributorLabel} name`}
                                    placeholder="Name"
                                    value={contributor.name}
                                    onChange={(event) =>
                                      replaceGroup(groupId, {
                                        ...group,
                                        contributorsById: {
                                          ...group.contributorsById,
                                          [contributorId]: { ...contributor, name: event.currentTarget.value },
                                        },
                                      })
                                    }
                                  />
                                  <TextInput
                                    aria-label={`${contributorLabel} role`}
                                    placeholder="Role (optional)"
                                    value={contributor.role ?? ''}
                                    onChange={(event) =>
                                      replaceGroup(groupId, {
                                        ...group,
                                        contributorsById: {
                                          ...group.contributorsById,
                                          [contributorId]: {
                                            ...contributor,
                                            role: event.currentTarget.value || undefined,
                                          },
                                        },
                                      })
                                    }
                                  />
                                </>
                              );
                            }}
                          />
                        )
                      }
                    />
                  </Stack>
                );
              }}
            />
          )
        }
      />
    </Stack>
  );
}
