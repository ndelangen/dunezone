import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Box, Checkbox, Group, Popover, Stack, Text } from '@mantine/core';
import { Disclosure } from '@ui/block/Disclosure';
import { FormError } from '@ui/block/FormError';
import { ListChapter } from '@ui/block/ListChapter';
import { HoldAction } from '@ui/control/HoldAction';
import { IconAction } from '@ui/control/IconAction';
import { SortableItem } from '@ui/control/SortableItem';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';
import { LogOut, Settings2 } from 'lucide-react';
import { useReducer, useState } from 'react';

import { mutationErrorMessage } from '@db/core/mutationError';
import { useEvictFactionVariant, useSetFactionOpen, useSetFactionVariantOrder } from '@db/factions';
import type { FactionVariantSwitcher, FactionVariantSwitcherRow } from '@db/factions';

type VariantId = FactionVariantSwitcherRow['_id'];

/** The variant and every variant below it, which is what an eviction moves (#2911). */
function branchOf(variants: readonly FactionVariantSwitcherRow[], id: VariantId): FactionVariantSwitcherRow[] {
  const root = variants.find((variant) => variant._id === id);
  if (!root) {
    return [];
  }
  return [
    root,
    ...variants.filter((variant) => variant.parentId === id).flatMap((child) => branchOf(variants, child._id)),
  ];
}

/** What an eviction moves and to whom, in one line. */
function evictionLine(branch: readonly FactionVariantSwitcherRow[]) {
  const [evicted, ...below] = branch;
  if (!evicted) {
    return '';
  }
  const belowWords = below.length === 1 ? below[0]!.name : `the ${below.length} variants below it`;
  const moved = below.length === 0 ? `${evicted.name} moves` : `${evicted.name} and ${belowWords} move`;
  return `${moved} to a new faction owned by ${evicted.ownerName ?? 'its owner'}.`;
}

/**
 * What the viewer changed that the server has not answered yet, shown at once so a drag does not snap back and a tick does not lag.
 * Each is dropped when its request settles, and the server's answer shows again.
 */
type Unsettled = { order: readonly VariantId[] | null; open: boolean | null };

type UnsettledEvent =
  | { type: 'reordered'; order: readonly VariantId[] }
  | { type: 'orderSettled' }
  | { type: 'openSet'; open: boolean }
  | { type: 'openSettled' };

function unsettledReducer(state: Unsettled, event: UnsettledEvent): Unsettled {
  switch (event.type) {
    case 'reordered':
      return { ...state, order: event.order };
    case 'orderSettled':
      return { ...state, order: null };
    case 'openSet':
      return { ...state, open: event.open };
    case 'openSettled':
      return { ...state, open: null };
  }
}

/** The server's variants in the order the viewer just gave them, until the server answers with that order itself. */
function inOrder(variants: readonly FactionVariantSwitcherRow[], order: readonly VariantId[] | null) {
  if (!order) {
    return variants;
  }
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...variants].sort((a, b) => (rank.get(a._id) ?? order.length) - (rank.get(b._id) ?? order.length));
}

/**
 * Help that starts as one line and opens on a press.
 * The line's own box is its toggle, so the help never covers the controls around it.
 */
function Help({ title, children }: Readonly<{ title: string; children: string }>) {
  return (
    <Box pos="relative">
      <Disclosure title={title}>
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-line' }}>
          {children}
        </Text>
      </Disclosure>
    </Box>
  );
}

const ORDER_HELP =
  'The first variant is the default, the one the faction opens with.\nReaders meet the rest in this order.';
const EVICT_HELP =
  "The variant and every variant below it move to a new faction owned by the variant's owner.\nValues they used from a parent left behind become their own, and rulesets keep their links.";
const DELETE_HELP =
  'A faction is deleted with its last variant.\nEvict or delete the others, then delete the last one from its editor.';

/**
 * The Faction's settings (#2928): variant order, whose first variant is the default, the hold that evicts a variant, and whether anyone may add one.
 * It is handed the same list as the Variants card, so the two never disagree.
 * The default's own branch carries no eviction, since the default stays with its Faction (#2911).
 * There is no Delete faction here: a Faction is deleted with its last variant, by that variant's own Delete.
 */
function FactionSettings({
  switcher,
  factionId,
  onEvicted,
}: Readonly<{
  /** The Faction's live variants in variant order, and whether it is open. */
  switcher: FactionVariantSwitcher;
  /** The variant whose page this is. */
  factionId: VariantId;
  /** The page's own variant left for a new Faction, and lives at this address now. */
  onEvicted: (slug: string) => void;
}>) {
  const setOrder = useSetFactionVariantOrder();
  const setOpen = useSetFactionOpen();
  const evict = useEvictFactionVariant();
  const [unsettled, dispatch] = useReducer(unsettledReducer, { order: null, open: null });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const variants = inOrder(switcher.variants, unsettled.order);
  const ids = variants.map((variant) => variant._id);
  const error = setOrder.error ?? setOpen.error ?? evict.error;

  const reorder = ({ active, over }: DragEndEvent) => {
    const from = ids.indexOf(active.id as VariantId);
    const to = over ? ids.indexOf(over.id as VariantId) : -1;
    if (from < 0 || to < 0 || from === to) {
      return;
    }
    const order = arrayMove(ids, from, to);
    dispatch({ type: 'reordered', order });
    setOrder.mutate(
      { family_id: switcher.familyId, variant_ids: order, default_variant_id: order[0] },
      { onSettled: () => dispatch({ type: 'orderSettled' }) }
    );
  };

  return (
    <Stack gap="md">
      <ListChapter title="Variant order" help={ORDER_HELP} actions={null}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <Stack component="ul" gap="xs" m={0} p={0} style={{ listStyle: 'none' }}>
              {variants.map((variant) => {
                const branch = branchOf(variants, variant._id);
                /* The first row is the default, and no branch that holds it may leave. */
                const staysWithDefault = branch.some((member) => member._id === ids[0]);
                return (
                  <SortableItem as="li" key={variant._id} id={variant._id}>
                    {(handle) => (
                      <Group gap="xs" wrap="nowrap">
                        <SortableReorderHandle label={`Reorder ${variant.name}`} {...handle} />
                        <Group gap="xs" flex={1} miw={0} align="baseline" style={{ rowGap: 0 }}>
                          <Text size="sm" fw={600}>
                            {variant.name}
                          </Text>
                          {variant.ownerName ? <Text size="xs" c="dimmed">{`by ${variant.ownerName}`}</Text> : null}
                        </Group>
                        {staysWithDefault ? null : (
                          <HoldAction
                            verb="remove"
                            size="md"
                            icon={<LogOut size={16} aria-hidden />}
                            label={`Evict ${variant.name}`}
                            hint={`Hold to evict.\n${evictionLine(branch)}`}
                            pending={evict.isPending}
                            onConfirm={() =>
                              evict.mutate(
                                { faction_id: variant._id },
                                { onSuccess: ({ slug }) => (variant._id === factionId ? onEvicted(slug) : undefined) }
                              )
                            }
                          />
                        )}
                      </Group>
                    )}
                  </SortableItem>
                );
              })}
            </Stack>
          </SortableContext>
        </DndContext>
        <Help title="What evicting a variant does">{EVICT_HELP}</Help>
      </ListChapter>
      {/* The popover's focus starts here: on a glyph above, it would open that glyph's hover text over the settings. */}
      <Checkbox
        data-autofocus
        color="selected"
        label="Anyone signed in may add a variant"
        checked={unsettled.open ?? switcher.isOpen}
        onChange={(event) => {
          const open = event.currentTarget.checked;
          dispatch({ type: 'openSet', open });
          setOpen.mutate(
            { family_id: switcher.familyId, is_open: open },
            { onSettled: () => dispatch({ type: 'openSettled' }) }
          );
        }}
      />
      {error ? (
        <FormError title="Faction settings could not be changed">{mutationErrorMessage(error)}</FormError>
      ) : null}
      <Help title="Deleting the faction">{DELETE_HELP}</Help>
    </Stack>
  );
}

/**
 * The Faction settings button on the variant page's toolbar, beside Create variant, for the Faction's owner and its Group.
 */
export function FactionSettingsPopover(props: Parameters<typeof FactionSettings>[0]) {
  const [opened, setOpened] = useState(false);
  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" width={340} withArrow trapFocus>
      <Popover.Target>
        <Box component="span" display="inline-flex">
          <IconAction
            label="Faction settings"
            emphasis="standard"
            intent="neutral"
            size="lg"
            pressed={opened}
            onClick={() => setOpened((current) => !current)}
            icon={<Settings2 size={17} aria-hidden />}
          />
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        <FactionSettings {...props} />
      </Popover.Dropdown>
    </Popover>
  );
}
