import { Button, Group, Popover, Stack, Text } from '@mantine/core';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { useState } from 'react';

import { AssetFace, assetFaceAspect } from '@app/widgets/asset-face/AssetFace';

import { AssetPicker } from './AssetPicker';

/** Enough of the chosen deck to name it and draw its cardback; the id is what reaches storage. */
export type PickedBackDeck = { id: string; name: string; data: unknown };

/**
 * Choosing the deck whose cardback this one wears.
 *
 * One control for both the create and the edit page, because the choice is the same one: the create page has no id to exclude and nothing saved yet, which changes what is passed in, not what the reader does.
 * A pick is a draft edit rather than a write;
 * the reference reaches storage when the deck is saved, which is what lets the create page offer it at all.
 */
export function DeckBackPicker({
  excludeId,
  picked,
  onPick,
}: {
  /** The deck being edited, so it cannot wear its own back. Absent while creating, which has no id yet. */
  excludeId?: string;
  picked: PickedBackDeck | null;
  onPick: (deck: PickedBackDeck) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Group gap="xs" wrap="nowrap">
      <Text size="sm" truncate style={{ minWidth: 0, flex: 1 }} title={picked?.name}>
        {picked ? picked.name : 'No deck chosen yet'}
      </Text>
      {/* Gated by the popover: the picker subscribes on mount, so it must not mount until asked for. */}
      <Popover opened={open} onChange={setOpen} width={340} position="bottom-start" withinPortal>
        <Popover.Target>
          <Button variant="light" size="compact-sm" style={{ flexShrink: 0 }} onClick={() => setOpen((was) => !was)}>
            {picked ? 'Change' : 'Choose'}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <AssetPicker
            types={['deck']}
            excludeIds={excludeId ? [excludeId] : []}
            /*
             * Best effort, not the full referenceability rule: listings present a healthy
             * reference deck wearing its target's composition, so it reads as authored here
             * and only a dangling presentation (cardback null) can be excluded client-side.
             * assertReferenceableDeckCardback remains the gate at save.
             */
            filter={(entry) => {
              const cardback = (entry.data as { cardback?: unknown } | null)?.cardback;
              return typeof cardback === 'object' && cardback !== null;
            }}
            copy={{
              searchLabel: 'Search decks',
              searchPlaceholder: 'Type a name, slug or owner…',
              emptyMessage: 'No other deck has a cardback to wear yet.',
            }}
            onPick={(entry) => {
              setOpen(false);
              onPick({ id: entry.id, name: entry.name, data: entry.data });
            }}
            onCancel={() => setOpen(false)}
          />
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
}

/** What the chosen deck's back actually looks like, for the tile that shows the choice. */
export function DeckBackProof({ picked }: { picked: PickedBackDeck | null }) {
  if (!picked) {
    return null;
  }
  return (
    <Stack gap={4} align="center" w="100%">
      {/* A deck's face is its cardback, so the target's row draws its own proof. */}
      <CanvasScale canvasWidth={900} canvasHeight={900 * assetFaceAspect('deck')}>
        <AssetFace type="deck" data={picked.data} name={picked.name} width={900} />
      </CanvasScale>
      <Text size="xs" c="dimmed">
        Cardback, from {picked.name}
      </Text>
    </Stack>
  );
}
