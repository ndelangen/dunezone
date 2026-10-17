import { Alert, Button, Group, Slider, Stack, Text, UnstyledButton } from '@mantine/core';
import { SPICE_BOARD_SIZE, SPICE_MAX_TINTS, SPICE_MAX_TOKENS } from '@shared/assets/schema';
import type {
  SPICE_TERRITORY_TYPES,
  CustomCardTokens,
  SpiceBoardLink,
  SpiceTint,
  SpiceTokenPlacement,
} from '@shared/assets/schema';
import type { Board } from '@shared/boards/schema';
import { territoryId } from '@shared/boards/schema';
import { legacyHighlightTint } from '@shared/boards/spiceHighlights';
import { TINT_STAMPS } from '@shared/boards/tints';
import type { TintStamp } from '@shared/boards/tints';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { ControlBlock } from '@ui/control/ControlBlock';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { NewTints, TintRow } from '@app/widgets/tabletop/TintControls';
import { CardToken } from '@game/assets/card/CardToken';
import { missingTintTerritories } from '@game/assets/card/SpiceBoardMap';

import type { CardTokenPicker } from './CustomCardLayers';

type Link = z.infer<typeof SpiceBoardLink>;
type Tint = z.infer<typeof SpiceTint>;
type Placement = z.infer<typeof SpiceTokenPlacement>;
/** A placed token's front as the page read it: null when the asset is gone, undefined while loading. */
type Token = z.infer<typeof CustomCardTokens>[string] | undefined;
type TerritoryType = (typeof SPICE_TERRITORY_TYPES)[number];

/** Opens a picker for one asset, reporting the ID picked. */
export type AssetPick = CardTokenPicker;

/** What the page has read for the card's link: the board and its name, and the placed tokens' fronts. Undefined while loading. */
export type SpiceBoardRead =
  | {
      board: Board | null;
      boardName: string | null;
      tokens: z.infer<typeof CustomCardTokens>;
      error: string | null;
    }
  | undefined;

/** The editor's state for the card's map that the live proof needs too: which tint paints and which token is open. */
export type SpiceMapFocus = {
  brush: string | null;
  setBrush: (tintId: string | null) => void;
  token: string | null;
  setToken: (layerId: string | null) => void;
};

const TYPE_LABELS: Record<TerritoryType, string> = {
  sand: 'Sand',
  rock: 'Rock',
  stronghold: 'Strongholds',
  polar: 'Polar Sink',
};

const BOARD_CENTER = SPICE_BOARD_SIZE / 2;
const NEW_TOKEN_SIZE = 40;

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

function toggled<T>(list: readonly T[] | undefined, item: T, order: readonly T[]): T[] {
  const set = new Set(list ?? []);
  if (set.has(item)) {
    set.delete(item);
  } else {
    set.add(item);
  }
  return order.filter((entry) => set.has(entry));
}

/** What a tint's row says under its name: painting, the types it covers, then its one territory or how many it names. */
function tintSummary(tint: Tint, painting: boolean, names: ReadonlyMap<string, string>) {
  if (painting) {
    return 'Painting: click territories on the card';
  }
  const parts = (tint.types ?? []).map((type) => `All ${TYPE_LABELS[type].toLowerCase()}`);
  if (tint.territories.length === 1) {
    parts.push(names.get(tint.territories[0]) ?? '1 territory');
  } else if (tint.territories.length || !parts.length) {
    parts.push(`${tint.territories.length} territories`);
  }
  return parts.join(' · ');
}

/** The percentage along the map's width or height a board coordinate sits at, which reads better than the board's own 487-unit scale. */
const acrossMap = (value: number) => `${Math.round((value / SPICE_BOARD_SIZE) * 100)}%`;

const degrees = (value: number) => `${Math.round(value)}°`;

function TokenSlider({
  label,
  value,
  min,
  max,
  step,
  format = (current) => String(Math.round(current)),
  onChange,
}: Readonly<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** How the value reads beside the slider and on its thumb, the same way the row's summary says it. */
  format?: (value: number) => string;
  onChange: (value: number) => void;
}>) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Text size="xs" c="dimmed" w={48} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Slider
        flex={1}
        miw={0}
        aria-label={label}
        thumbLabel={label}
        label={format}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
      />
      <Text size="xs" c="dimmed" w={40} ta="right" style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        {format(value)}
      </Text>
    </Group>
  );
}

/** What a token's row says under its name: where it sits on the map and how big it is drawn. */
function tokenSummary(token: Placement) {
  const parts = [`${acrossMap(token.x)} across`, `${acrossMap(token.y)} down`, `size ${Math.round(token.size)}`];
  if (token.rotation) {
    parts.push(`turned ${degrees(token.rotation)}`);
  }
  return parts.join(' · ');
}

/** The token's front at swatch size, so a row is told apart from the next one of the same kind at a glance. */
function TokenThumb({ asset }: Readonly<{ asset: Token }>) {
  const rectangle = asset?.type === 'token-enhance';
  return (
    <div
      aria-hidden
      style={{
        width: 26,
        height: rectangle ? 16 : 26,
        flexShrink: 0,
        borderRadius: asset ? undefined : '50%',
        border: asset ? undefined : '1px dashed var(--mantine-color-dimmed)',
      }}
    >
      {asset ? <CardToken token={asset} /> : null}
    </div>
  );
}

/**
 * One placed token's row, in the tint rows' shape: the front, its name and where it is, then the removal.
 * The row opens on its sliders;
 * open, it wears the same ring the proof draws round the token.
 */
function TokenRow({
  token,
  asset,
  open,
  onOpen,
  onChange,
  onRemove,
}: Readonly<{
  token: Placement;
  asset: Token;
  open: boolean;
  onOpen: () => void;
  onChange: (update: Partial<Placement>) => void;
  onRemove: () => void;
}>) {
  const name = asset?.name ?? (asset === null ? 'Unavailable token' : 'Loading token...');
  return (
    <Stack
      gap={6}
      px="sm"
      py={6}
      style={{
        borderRadius: 8,
        border: `1px solid ${open ? 'var(--mantine-color-yellow-5)' : 'var(--mantine-color-default-border)'}`,
      }}
    >
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <UnstyledButton
          onClick={onOpen}
          aria-expanded={open}
          aria-label={`${open ? 'Close' : 'Open'} ${name}`}
          miw={0}
          flex={1}
        >
          <Group gap="sm" wrap="nowrap" miw={0}>
            <TokenThumb asset={asset} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text size="sm" fw={600}>
                {name}
              </Text>
              <Text size="xs" c="dimmed">
                {tokenSummary(token)}
              </Text>
            </div>
            <Text component="span" c={open ? 'yellow' : 'dimmed'} lh={0} aria-hidden>
              {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </Text>
          </Group>
        </UnstyledButton>
        <ConfirmDeleteAction
          label={`Remove ${name}`}
          verb="remove"
          size="sm"
          pending={false}
          disabled={false}
          onConfirm={onRemove}
        />
      </Group>
      {open ? (
        <Stack gap={4} pt={2}>
          <TokenSlider
            label="Across"
            value={token.x}
            min={0}
            max={SPICE_BOARD_SIZE}
            step={0.5}
            format={acrossMap}
            onChange={(x) => onChange({ x })}
          />
          <TokenSlider
            label="Down"
            value={token.y}
            min={0}
            max={SPICE_BOARD_SIZE}
            step={0.5}
            format={acrossMap}
            onChange={(y) => onChange({ y })}
          />
          <TokenSlider
            label="Size"
            value={token.size}
            min={5}
            max={250}
            step={1}
            onChange={(size) => onChange({ size })}
          />
          <TokenSlider
            label="Turn"
            value={token.rotation}
            min={-180}
            max={180}
            step={1}
            format={degrees}
            onChange={(rotation) => onChange({ rotation })}
          />
        </Stack>
      ) : null}
    </Stack>
  );
}

/** One of the card's tints, with Play's controls and a switch for each territory type. */
function CardTintRow({
  tint,
  painting,
  enabled,
  names,
  onBrush,
  onChange,
  onRemove,
}: Readonly<{
  tint: Tint;
  painting: boolean;
  enabled: boolean;
  names: ReadonlyMap<string, string>;
  onBrush: (on: boolean) => void;
  onChange: (update: (tint: Tint) => Tint) => void;
  onRemove: () => void;
}>) {
  return (
    <TintRow
      tint={tint}
      summary={tintSummary(tint, painting, names)}
      painting={painting}
      enabled={enabled}
      onBrush={() => onBrush(!painting)}
      onOutline={() => onChange(({ outline, ...rest }) => (outline ? rest : { ...rest, outline: true }))}
      onStamp={(stamp: TintStamp) =>
        onChange((current) => {
          const stamps = toggled(current.stamps, stamp, TINT_STAMPS);
          const { stamps: _, ...rest } = current;
          return stamps.length ? { ...rest, stamps } : rest;
        })
      }
      onColor={(color) => onChange((current) => ({ ...current, color }))}
      after={
        <ConfirmDeleteAction
          label={`Remove ${tint.name}`}
          verb="remove"
          size="sm"
          pending={false}
          disabled={false}
          onConfirm={() => {
            if (painting) {
              onBrush(false);
            }
            onRemove();
          }}
        />
      }
    />
  );
}

/** What the card's map draws from: the classic map, or the linked board by name once it has loaded. */
function boardLabel(link: Link | undefined, read: SpiceBoardRead) {
  if (!link) {
    return 'The classic Arrakis map';
  }
  if (!read) {
    return 'Loading board...';
  }
  return read.boardName ?? 'This board is no longer available. Choose another.';
}

/** The saved board the card draws, and the way back to the classic map. */
function BoardChoice({
  link,
  read,
  boardPicker,
  onBoard,
  onUnlink,
}: Readonly<{
  link: Link | undefined;
  read: SpiceBoardRead;
  boardPicker: AssetPick;
  onBoard: (id: string) => void;
  onUnlink: () => void;
}>) {
  const [picking, setPicking] = useState(false);
  return (
    <ControlBlock
      title="Board"
      description="The saved board the card's map draws. Saving that board redraws this card."
      input={
        <Stack gap="xs">
          <Text size="sm">{boardLabel(link, read)}</Text>
          <Group gap="xs">
            <Button variant="default" size="compact-sm" onClick={() => setPicking(true)}>
              {link ? 'Replace board' : 'Use a saved board'}
            </Button>
            {link ? (
              <Button variant="subtle" color="gray" size="compact-sm" onClick={onUnlink}>
                Use the classic map
              </Button>
            ) : null}
          </Group>
          {picking
            ? boardPicker(
                (id) => {
                  onBoard(id);
                  setPicking(false);
                },
                () => setPicking(false)
              )
            : null}
        </Stack>
      }
    />
  );
}

/**
 * The Map chapter of a card on a saved board: the board, its tints, painted on the card's own map with Play's controls, and its placed tokens.
 * A card on the classic map shows the board choice above `classic`, the legacy highlight list.
 */
export function SpiceBoardFields({
  draft,
  onLink,
  read,
  focus,
  boardPicker,
  tokenPicker,
  classic,
}: Readonly<{
  draft: { board?: Link; highlights: Parameters<typeof legacyHighlightTint>[0]; subName: string };
  onLink: (link: Link | undefined) => void;
  read: SpiceBoardRead;
  focus: SpiceMapFocus;
  boardPicker: AssetPick;
  tokenPicker: AssetPick;
  classic: ReactNode;
}>) {
  const [pickingToken, setPickingToken] = useState(false);
  const link = draft.board;
  const choice = (
    <BoardChoice
      link={link}
      read={read}
      boardPicker={boardPicker}
      onBoard={(asset_id) => {
        if (link) {
          onLink({ ...link, asset_id });
          return;
        }
        /* The classic highlights carry over as the card's first tint, so linking a board keeps what the card showed. */
        const carried = legacyHighlightTint(draft.highlights, draft.subName);
        onLink({ asset_id, tints: carried ? [carried] : [], tokens: [] });
      }}
      onUnlink={() => {
        focus.setBrush(null);
        focus.setToken(null);
        onLink(undefined);
      }}
    />
  );
  if (!link) {
    return (
      <>
        {choice}
        {classic}
      </>
    );
  }

  const board = read?.board ?? null;
  const names = new Map(
    Object.values(board?.properties ?? {}).map((property) => [territoryId(property.name), property.name])
  );
  const missing = board ? missingTintTerritories(board, link.tints) : [];
  const setTint = (id: string, update: (tint: Tint) => Tint) =>
    onLink({ ...link, tints: link.tints.map((tint) => (tint.id === id ? update(tint) : tint)) });
  const setToken = (layerId: string, update: Partial<Placement>) =>
    onLink({
      ...link,
      tokens: link.tokens.map((token) => (token.layerId === layerId ? { ...token, ...update } : token)),
    });

  return (
    <>
      {choice}
      {missing.length ? (
        <Alert color="yellow" title="Not on this board">
          {missing.join(', ')}. These stay on the card and show again on a board that has them.
        </Alert>
      ) : null}
      <ControlBlock
        title="Tints"
        description="Turn on a tint's paintbrush, then click territories on the card to add or remove them. Escape stops painting."
        input={
          <Stack gap="xs">
            {link.tints.map((tint) => (
              <CardTintRow
                key={tint.id}
                tint={tint}
                painting={focus.brush === tint.id}
                enabled={!!board}
                names={names}
                onBrush={(on) => focus.setBrush(on ? tint.id : null)}
                onChange={(update) => setTint(tint.id, update)}
                onRemove={() => onLink({ ...link, tints: link.tints.filter((candidate) => candidate.id !== tint.id) })}
              />
            ))}
            <NewTints
              tints={link.tints}
              enabled={!!board && link.tints.length < SPICE_MAX_TINTS}
              onCreate={({ name, color }) => {
                const id = newId('tint');
                onLink({ ...link, tints: [...link.tints, { id, name, color, territories: [] }] });
                focus.setBrush(id);
              }}
            />
          </Stack>
        }
      />
      <ControlBlock
        title="Tokens"
        description="Token assets on the card's map. Drag one on the card, or open it here for its sliders. They stay where they are when the board changes."
        input={
          <Stack gap="xs">
            {read?.error ? <Alert color="red">{read.error}</Alert> : null}
            {link.tokens.map((token) => {
              return (
                <TokenRow
                  key={token.layerId}
                  token={token}
                  asset={read?.tokens[token.asset_id]}
                  open={focus.token === token.layerId}
                  onOpen={() => focus.setToken(focus.token === token.layerId ? null : token.layerId)}
                  onChange={(update) => setToken(token.layerId, update)}
                  onRemove={() => onLink({ ...link, tokens: link.tokens.filter((t) => t.layerId !== token.layerId) })}
                />
              );
            })}
            <Group>
              <Button
                variant="default"
                size="compact-sm"
                disabled={link.tokens.length >= SPICE_MAX_TOKENS}
                onClick={() => setPickingToken(true)}
              >
                Add a token
              </Button>
            </Group>
            {pickingToken
              ? tokenPicker(
                  (asset_id) => {
                    const layerId = newId('token');
                    const placed = {
                      layerId,
                      asset_id,
                      x: BOARD_CENTER,
                      y: BOARD_CENTER,
                      size: NEW_TOKEN_SIZE,
                      rotation: 0,
                    };
                    onLink({ ...link, tokens: [...link.tokens, placed] });
                    focus.setToken(layerId);
                    setPickingToken(false);
                  },
                  () => setPickingToken(false)
                )
              : null}
          </Stack>
        }
      />
    </>
  );
}
