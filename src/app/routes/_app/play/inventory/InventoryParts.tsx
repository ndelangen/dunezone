import { Button, Group, Stack, Text, Tooltip } from '@mantine/core';
import type { PublicControls } from '@shared/play/inventory';
import type { TablePiece } from '@shared/play/model';
import { FormattedTextSource } from '@ui/content/FormattedText';
import { TooltipTarget } from '@ui/control/TooltipTarget';
import { Dices } from 'lucide-react';
import { Children, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode, RefObject } from 'react';

import { SpawnAssetPicker } from '@app/pickers/SpawnAssetPicker';

import type { TableSession } from '../../../../db/tabletop/TableSession';
import { PieceArtwork } from '../../../../widgets/tabletop/PieceArtwork';
import { pieceName } from '../multiplayer/HandPiece';
import { publicControlsOf } from '../multiplayer/publicControls';
import styles from './Inventory.module.css';
import type { SharedInventory, SharedInventoryProps } from './useSharedInventory';

/** What a piece is called where the inventory names it: a token by its own name, a card stack by its label, which never names a hidden face. */
function inventoryName(piece: TablePiece): string {
  return piece.kind === 'card' ? piece.label : pieceName(piece);
}

/** A piece's tooltip: its name and count, and for a tech token what it does, as its author described it on the asset; both read the top item, the one its face shows. */
function PieceTooltipLabel({ piece }: Readonly<{ piece: TablePiece }>) {
  const description = piece.items.at(-1)?.artwork?.description;
  return (
    <Stack gap={4}>
      <Text size="sm" fw={700}>
        {inventoryName(piece)}
        {piece.items.length > 1 ? ` × ${piece.items.length}` : ''}
      </Text>
      {description && <FormattedTextSource source={description} size="sm" />}
    </Stack>
  );
}

/**
 * One piece of the inventory at the size a layout asks for: drag it onto the table, Shift-drag to take only its top item.
 * It lifts under the pointer and its tooltip names it.
 */
export function InventoryPiece({
  inventory,
  piece,
  size,
}: Readonly<{ inventory: SharedInventory; piece: TablePiece; size: number }>) {
  const card = piece.kind === 'card';
  const src = piece.items.at(-1)?.artwork?.[card ? 'back' : 'front'] ?? null;
  const height = card ? Math.round((size * 4) / 3) : size;
  return (
    <div className={styles.tile} role="listitem" data-round={!card || undefined}>
      <Tooltip label={<PieceTooltipLabel piece={piece} />} multiline w={260} withArrow openDelay={250}>
        <TooltipTarget>
          <button
            type="button"
            className={styles.face}
            disabled={!inventory.movable(piece)}
            aria-label={`Drag ${piece.label} onto the table`}
            onPointerDown={(event) => inventory.carry(event, piece)}
          >
            <PieceArtwork piece={piece} src={src} name={inventoryName(piece)} width={size} height={height} />
            {piece.items.length > 1 && <span className={styles.badge}>{piece.items.length}</span>}
          </button>
        </TooltipTarget>
      </Tooltip>
    </div>
  );
}

/* Which ends of a sideways-scrolling strip hide pieces past them, kept as the strip scrolls, resizes or gains and loses pieces. */
function useHiddenEnds(strip: RefObject<HTMLDivElement | null>, pieces: number) {
  const [ends, setEnds] = useState({ start: false, end: false });
  useEffect(() => {
    const element = strip.current;
    if (!element) {
      return;
    }
    const measure = () => {
      const start = element.scrollLeft > 1;
      const end = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
      setEnds((last) => (last.start === start && last.end === end ? last : { start, end }));
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    for (const child of element.children) {
      resize.observe(child);
    }
    element.addEventListener('scroll', measure, { passive: true });
    return () => {
      resize.disconnect();
      element.removeEventListener('scroll', measure);
    };
  }, [strip, pieces]);
  return ends;
}

/**
 * A row's pieces side by side, scrolling sideways rather than wrapping when they do not fit.
 * An end that hides pieces fades out, so the row shows there is more of it even where scrollbars stay hidden.
 * Only a shelf with pieces has one.
 * An empty shelf shows its caption alone.
 */
export function PieceStrip({ children, label }: Readonly<{ children: ReactNode; label: string }>) {
  const strip = useRef<HTMLDivElement>(null);
  const pieces = Children.count(children);
  const ends = useHiddenEnds(strip, pieces);
  return (
    <div
      ref={strip}
      className={styles.strip}
      role="list"
      aria-label={label}
      data-more-start={ends.start || undefined}
      data-more-end={ends.end || undefined}
    >
      {children}
    </div>
  );
}

/** The random tech token draw, as whatever control a layout gives it; its tooltip says what it does or why it is off. */
export function DrawTechToken({
  inventory,
  children,
}: Readonly<{
  inventory: SharedInventory;
  children: (props: { disabled: boolean; onClick: () => void }) => ReactNode;
}>) {
  return (
    <Tooltip label={inventory.draw.help} multiline w={260} withArrow>
      <TooltipTarget>{children({ disabled: !inventory.draw.enabled, onClick: inventory.draw.run })}</TooltipTarget>
    </Tooltip>
  );
}

export const DRAW_ICON = <Dices size={16} aria-hidden />;

/* What the picker says about the chosen asset: how many items it adds, why it cannot, or that it is still being checked. */
function catalogueStatus(catalogue: ReturnType<TableSession['getSnapshot']>['catalogue'], requestId: string | null) {
  const checking = 'Checking published definitions and images...';
  if (!catalogue || catalogue.requestId !== requestId) {
    return checking;
  }
  if (catalogue.contents) {
    return `${catalogue.contents.pieces.reduce((count, piece) => count + piece.items.length, 0)} items ready to add`;
  }
  return catalogue.error || checking;
}

/** The catalogue, open: pick an asset, and the table checks it before it can be spawned or requested. */
export function CataloguePicker({ client, table, inventory }: SharedInventoryProps & { inventory: SharedInventory }) {
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const catalogue = inventory.catalogue;
  if (!catalogue?.shelf) {
    return null;
  }
  const { selection, requestId } = catalogue.picker;
  const contents = view.catalogue?.requestId === requestId ? view.catalogue.contents : null;
  const solo = publicControlsOf(table).seats.length === 1;
  return (
    <Stack gap="sm">
      {/* The picker lists the catalogue; the table checks the choice, so a pick asks it before the request button opens. */}
      <SpawnAssetPicker
        value={selection}
        types={catalogue.picker.types}
        disabled={table.reconnecting}
        onPick={({ type, slug }) => catalogue.select({ type, slug })}
      />
      <Group align="center">
        <Button
          disabled={!table.canHandleTable || !contents || !selection}
          onClick={() => {
            if (selection) {
              client.command({ kind: 'spawn-request', type: selection.type, slug: selection.slug });
            }
          }}
        >
          {solo ? 'Spawn' : 'Request'}
        </Button>
        {selection && <Text size="sm">{catalogueStatus(view.catalogue, requestId)}</Text>}
      </Group>
    </Stack>
  );
}

/* A request to spawn an asset, which any other player can approve and anyone can dismiss. */
function SpawnRequest({
  client,
  table,
  request,
}: SharedInventoryProps & Readonly<{ request: PublicControls['requests'][number] }>) {
  return (
    <Group justify="space-between">
      <Text>
        {request.contents.name} requested by {request.requesterName}
      </Text>
      <Group gap="xs">
        <Button
          disabled={!table.canHandleTable || request.requesterSeat === table.viewer.viewerSeat}
          onClick={() => client.command({ kind: 'spawn-approve', requestId: request.id })}
        >
          Approve
        </Button>
        <Button
          variant="default"
          disabled={!table.canHandleTable}
          onClick={() => client.command({ kind: 'spawn-dismiss', requestId: request.id })}
        >
          Dismiss
        </Button>
      </Group>
    </Group>
  );
}

/** The spawn requests waiting on the table, each with its answer. */
export function SpawnRequests({ client, table }: SharedInventoryProps) {
  const requests = publicControlsOf(table).requests;
  return requests.length ? (
    <Stack gap="xs">
      {requests.map((request) => (
        <SpawnRequest key={request.id} client={client} table={table} request={request} />
      ))}
    </Stack>
  ) : null;
}
