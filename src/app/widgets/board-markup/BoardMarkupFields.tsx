import { Alert, Button, Group, Slider, Stack, Text, UnstyledButton } from '@mantine/core';
import { tokenShapeAspect, tokenShapeOfType } from '@shared/assets/tokenOutline';
import type { Board } from '@shared/boards/geometry';
import { BOARD_FRAME_SIZE, BOARD_MAX_TINTS, BOARD_MAX_TOKENS, moveToken, paintTint } from '@shared/boards/markup';
import type { BOARD_TERRITORY_TYPES, BoardTint, BoardTokenPlacement } from '@shared/boards/markup';
import { boardTerritoryNames, missingTintTerritories } from '@shared/boards/tintDrawing';
import { TINT_STAMPS } from '@shared/boards/tints';
import type { TintStamp } from '@shared/boards/tints';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { ControlBlock } from '@ui/control/ControlBlock';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { NewTints, TintRow } from '@app/widgets/tabletop/TintControls';
import type { BoardMarkupEditing } from '@game/assets/board/BoardMarkup';

/*
 * The fields Spice cards and Rulebook board scenes share for board markup: tint rows with Play's controls, and placed token rows.
 * Each editor supplies where its markup is drawn and how it reads token assets; the rows behave the same in both.
 */

/** Opens a picker for one asset, reporting the ID picked. */
export type AssetPick = (onPick: (id: string) => void, onCancel: () => void) => ReactNode;

/** The editor's state for the markup that its live preview needs too: which tint paints and which token is open. */
export type BoardMarkupFocus = {
  brush: string | null;
  setBrush: (tintId: string | null) => void;
  token: string | null;
  setToken: (layerId: string | null) => void;
};

/** A placed token's asset as the editor read it: null when the asset is gone, undefined while loading. */
export type MarkupTokenView = { name: string; type: string; thumb: ReactNode } | null | undefined;

type TerritoryType = (typeof BOARD_TERRITORY_TYPES)[number];

const TYPE_LABELS: Record<TerritoryType, string> = {
  sand: 'Sand',
  rock: 'Rock',
  stronghold: 'Strongholds',
  polar: 'Polar Sink',
};

const BOARD_CENTER = BOARD_FRAME_SIZE / 2;
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
function tintSummary(tint: BoardTint, painting: string | null, names: ReadonlyMap<string, string>) {
  if (painting) {
    return painting;
  }
  const parts = (tint.types ?? []).map((type) => `All ${TYPE_LABELS[type].toLowerCase()}`);
  if (tint.territories.length === 1) {
    parts.push(names.get(tint.territories[0]) ?? '1 territory');
  } else if (tint.territories.length || !parts.length) {
    parts.push(`${tint.territories.length} territories`);
  }
  return parts.join(' · ');
}

/** One tint, with Play's controls. */
function MarkupTintRow({
  tint,
  painting,
  paintingSummary,
  enabled,
  names,
  onBrush,
  onChange,
  onRemove,
}: Readonly<{
  tint: BoardTint;
  painting: boolean;
  paintingSummary: string;
  enabled: boolean;
  names: ReadonlyMap<string, string>;
  onBrush: (on: boolean) => void;
  onChange: (update: (tint: BoardTint) => BoardTint) => void;
  onRemove: () => void;
}>) {
  return (
    <TintRow
      tint={tint}
      summary={tintSummary(tint, painting ? paintingSummary : null, names)}
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

/**
 * Tints over a saved board, painted on the editor's own preview with Play's controls.
 * `surface` names where the author clicks, as the painting summary and help say it.
 */
export function BoardTintFields({
  tints,
  onTints,
  board,
  focus,
  surface,
  storedOn,
}: Readonly<{
  tints: readonly BoardTint[];
  onTints: (tints: BoardTint[]) => void;
  /** The board as the editor read it; null while it loads or when it is gone, which keeps the brushes off. */
  board: Board | null;
  focus: BoardMarkupFocus;
  surface: string;
  /** What keeps a territory the board lacks, for the warning: "the card", "the scene". */
  storedOn: string;
}>) {
  const names = boardTerritoryNames(board);
  const missing = board ? missingTintTerritories(board, tints) : [];
  const setTint = (id: string, update: (tint: BoardTint) => BoardTint) =>
    onTints(tints.map((tint) => (tint.id === id ? update(tint) : tint)));
  return (
    <>
      {missing.length ? (
        <Alert color="yellow" title="Not on this board">
          {missing.join(', ')}. These stay on {storedOn} and show again on a board that has them.
        </Alert>
      ) : null}
      <ControlBlock
        title="Tints"
        description={`Turn on a tint's paintbrush, then click territories on ${surface} to add or remove them. Escape stops painting.`}
        input={
          <Stack gap="xs">
            {tints.map((tint) => (
              <MarkupTintRow
                key={tint.id}
                tint={tint}
                painting={focus.brush === tint.id}
                paintingSummary={`Painting: click territories on ${surface}`}
                enabled={!!board}
                names={names}
                onBrush={(on) => focus.setBrush(on ? tint.id : null)}
                onChange={(update) => setTint(tint.id, update)}
                onRemove={() => onTints(tints.filter((candidate) => candidate.id !== tint.id))}
              />
            ))}
            <NewTints
              tints={tints}
              enabled={!!board && tints.length < BOARD_MAX_TINTS}
              onCreate={({ name, color }) => {
                const id = newId('tint');
                onTints([...tints, { id, name, color, territories: [] }]);
                focus.setBrush(id);
              }}
            />
          </Stack>
        }
      />
    </>
  );
}

/** The percentage along the board's width or height a board coordinate sits at, which reads better than the board's own 487-unit scale. */
const acrossBoard = (value: number) => `${Math.round((value / BOARD_FRAME_SIZE) * 100)}%`;

const degrees = (value: number) => `${Math.round(value)}°`;

const formatRounded = (current: number) => String(Math.round(current));

function TokenSlider({
  label,
  value,
  min,
  max,
  step,
  format = formatRounded,
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

/** What a token's row says under its name: where it sits on the board and how big it is drawn. */
function tokenSummary(token: BoardTokenPlacement) {
  const parts = [`${acrossBoard(token.x)} across`, `${acrossBoard(token.y)} down`, `size ${Math.round(token.size)}`];
  if (token.rotation) {
    parts.push(`turned ${degrees(token.rotation)}`);
  }
  return parts.join(' · ');
}

/** The token's front at swatch size, so a row is told apart from the next one of the same kind at a glance. */
function TokenThumb({ view }: Readonly<{ view: MarkupTokenView }>) {
  const aspect = view ? tokenShapeAspect(tokenShapeOfType(view.type) ?? 'square') : 1;
  return (
    <div
      aria-hidden
      style={{
        width: 26,
        height: Math.round(26 * aspect),
        flexShrink: 0,
        borderRadius: view ? undefined : '50%',
        border: view ? undefined : '1px dashed var(--mantine-color-dimmed)',
      }}
    >
      {view?.thumb}
    </div>
  );
}

/**
 * One placed token's row, in the tint rows' shape: the front, its name and where it is, then the removal.
 * The row opens on its sliders;
 * open, it wears the same ring the preview draws round the token.
 */
function TokenRow({
  token,
  view,
  open,
  onOpen,
  onChange,
  onRemove,
}: Readonly<{
  token: BoardTokenPlacement;
  view: MarkupTokenView;
  open: boolean;
  onOpen: () => void;
  onChange: (update: Partial<BoardTokenPlacement>) => void;
  onRemove: () => void;
}>) {
  const name = view?.name ?? (view === null ? 'Unavailable token' : 'Loading token...');
  return (
    <Stack
      gap={6}
      px="sm"
      py={6}
      style={{
        borderRadius: 8,
        border: `1px solid ${open ? 'var(--color-caution)' : 'var(--mantine-color-default-border)'}`,
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
            <TokenThumb view={view} />
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
            max={BOARD_FRAME_SIZE}
            step={0.5}
            format={acrossBoard}
            onChange={(x) => onChange({ x })}
          />
          <TokenSlider
            label="Down"
            value={token.y}
            min={0}
            max={BOARD_FRAME_SIZE}
            step={0.5}
            format={acrossBoard}
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

/** Token assets placed freely on a saved board, dragged on the editor's preview or set with sliders. */
export function BoardTokenFields({
  tokens,
  onTokens,
  viewOf,
  error,
  focus,
  tokenPicker,
  description,
}: Readonly<{
  tokens: readonly BoardTokenPlacement[];
  onTokens: (tokens: BoardTokenPlacement[]) => void;
  viewOf: (assetId: string) => MarkupTokenView;
  error?: string | null;
  focus: BoardMarkupFocus;
  tokenPicker: AssetPick;
  description: string;
}>) {
  const [picking, setPicking] = useState(false);
  const setToken = (layerId: string, update: Partial<BoardTokenPlacement>) =>
    onTokens(tokens.map((token) => (token.layerId === layerId ? { ...token, ...update } : token)));
  return (
    <ControlBlock
      title="Tokens"
      description={description}
      input={
        <Stack gap="xs">
          {error ? <Alert color="red">{error}</Alert> : null}
          {tokens.map((token) => (
            <TokenRow
              key={token.layerId}
              token={token}
              view={viewOf(token.asset_id)}
              open={focus.token === token.layerId}
              onOpen={() => focus.setToken(focus.token === token.layerId ? null : token.layerId)}
              onChange={(update) => setToken(token.layerId, update)}
              onRemove={() => onTokens(tokens.filter((t) => t.layerId !== token.layerId))}
            />
          ))}
          <Group>
            <Button
              variant="default"
              size="compact-sm"
              disabled={tokens.length >= BOARD_MAX_TOKENS}
              onClick={() => setPicking(true)}
            >
              Add a token
            </Button>
          </Group>
          {picking
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
                  onTokens([...tokens, placed]);
                  focus.setToken(layerId);
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
 * What the editor's live preview does with the markup: the open brush paints, and while `placing` tokens drag.
 * Spice cards and Rulebook scenes hand the result to their preview the same way.
 */
export function boardMarkupEditing({
  tints,
  tokens,
  board,
  focus,
  placing,
  onTints,
  onTokens,
}: {
  tints: readonly BoardTint[];
  tokens: readonly BoardTokenPlacement[];
  board: Board | null | undefined;
  focus: BoardMarkupFocus;
  placing: boolean;
  onTints: (tints: BoardTint[]) => void;
  onTokens: (tokens: BoardTokenPlacement[]) => void;
}): BoardMarkupEditing {
  const brush = focus.brush;
  return {
    onTerritory: brush ? (territory) => onTints(paintTint(tints, board ?? undefined, brush, territory)) : undefined,
    onTokenMove: placing ? (layerId, x, y) => onTokens(moveToken(tokens, layerId, x, y)) : undefined,
    selectedToken: placing ? focus.token : null,
    onSelectToken: focus.setToken,
  };
}

/** Escape puts the brush down while `active`, the editor's own reading of whether a brush is really painting. */
export function useBrushEscape(active: boolean, setBrush: (tintId: string | null) => void) {
  useEffect(() => {
    if (!active) {
      return;
    }
    const stop = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBrush(null);
      }
    };
    window.addEventListener('keydown', stop);
    return () => window.removeEventListener('keydown', stop);
  }, [active, setBrush]);
}
