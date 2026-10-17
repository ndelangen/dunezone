import { ActionIcon, Alert, Button, Group, Popover, Slider, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { SPICE_BOARD_SIZE, SPICE_MAX_TINTS, SPICE_MAX_TOKENS, SPICE_TERRITORY_TYPES } from '@shared/assets/schema';
import type { CustomCardTokens, SpiceBoardLink, SpiceTint, SpiceTokenPlacement } from '@shared/assets/schema';
import type { Board } from '@shared/boards/schema';
import { territoryId } from '@shared/boards/schema';
import { legacyHighlightTint } from '@shared/boards/spiceHighlights';
import { TINT_STAMPS } from '@shared/boards/tints';
import type { TintStamp } from '@shared/boards/tints';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { ControlBlock } from '@ui/control/ControlBlock';
import { Layers } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { NewTints, TintRow } from '@app/widgets/territory-tints/TintControls';
import { missingTintTerritories } from '@game/assets/card/SpiceBoardMap';

import type { CardTokenPicker } from './CustomCardLayers';

type Link = z.infer<typeof SpiceBoardLink>;
type Tint = z.infer<typeof SpiceTint>;
type Placement = z.infer<typeof SpiceTokenPlacement>;
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

/** The switches that make a tint cover every territory of a type, whatever the board has now or gets later. */
function TypePicker({ tint, onToggle }: Readonly<{ tint: Tint; onToggle: (type: TerritoryType) => void }>) {
  const count = tint.types?.length ?? 0;
  const label = `Territory types in ${tint.name}`;
  return (
    <Popover position="bottom-end" shadow="md" withArrow>
      <Popover.Target>
        <Tooltip label={label}>
          <ActionIcon variant={count ? 'light' : 'subtle'} color={count ? 'yellow' : 'gray'} aria-label={label}>
            <Layers size={18} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown aria-label={label}>
        <Text size="xs" c="dimmed" mb={6}>
          Every territory of a type, on whichever board
        </Text>
        <Stack gap={4}>
          {SPICE_TERRITORY_TYPES.map((type) => {
            const on = !!tint.types?.includes(type);
            return (
              <Button
                key={type}
                size="compact-sm"
                justify="flex-start"
                variant={on ? 'light' : 'subtle'}
                color={on ? 'yellow' : 'gray'}
                aria-pressed={on}
                onClick={() => onToggle(type)}
              >
                {TYPE_LABELS[type]}
              </Button>
            );
          })}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function TokenSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: Readonly<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}>) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Text size="xs" c="dimmed" w={56}>
        {label}
      </Text>
      <Slider
        flex={1}
        aria-label={label}
        thumbLabel={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
      />
    </Group>
  );
}

function TokenRow({
  token,
  name,
  open,
  onOpen,
  onChange,
  onRemove,
}: Readonly<{
  token: Placement;
  name: string;
  open: boolean;
  onOpen: () => void;
  onChange: (update: Partial<Placement>) => void;
  onRemove: () => void;
}>) {
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
      <Group justify="space-between" wrap="nowrap">
        <UnstyledButton onClick={onOpen} aria-expanded={open} style={{ flex: 1 }}>
          <Text size="sm" fw={600}>
            {name}
          </Text>
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
        <Stack gap={4}>
          <TokenSlider
            label="Across"
            value={token.x}
            min={0}
            max={SPICE_BOARD_SIZE}
            step={0.5}
            onChange={(x) => onChange({ x })}
          />
          <TokenSlider
            label="Down"
            value={token.y}
            min={0}
            max={SPICE_BOARD_SIZE}
            step={0.5}
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
            onChange={(rotation) => onChange({ rotation })}
          />
        </Stack>
      ) : null}
    </Stack>
  );
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
  let current: string;
  if (!link) {
    current = 'The classic Arrakis map';
  } else if (!read) {
    current = 'Loading board...';
  } else {
    current = read.boardName ?? 'This board is no longer available. Choose another.';
  }
  return (
    <ControlBlock
      title="Board"
      description="The saved board the card's map draws. Saving that board redraws this card."
      input={
        <Stack gap="xs">
          <Text size="sm">{current}</Text>
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
            {link.tints.map((tint) => {
              const painting = focus.brush === tint.id;
              return (
                <TintRow
                  key={tint.id}
                  tint={tint}
                  summary={tintSummary(tint, painting, names)}
                  painting={painting}
                  enabled={!!board}
                  onBrush={() => focus.setBrush(painting ? null : tint.id)}
                  onOutline={() =>
                    setTint(tint.id, ({ outline, ...rest }) => (outline ? rest : { ...rest, outline: true }))
                  }
                  onStamp={(stamp: TintStamp) =>
                    setTint(tint.id, (current) => {
                      const stamps = toggled(current.stamps, stamp, TINT_STAMPS);
                      const { stamps: _, ...rest } = current;
                      return stamps.length ? { ...rest, stamps } : rest;
                    })
                  }
                  onColor={(color) => setTint(tint.id, (current) => ({ ...current, color }))}
                  before={
                    <TypePicker
                      tint={tint}
                      onToggle={(type) =>
                        setTint(tint.id, (current) => {
                          const types = toggled(current.types, type, SPICE_TERRITORY_TYPES);
                          const { types: _, ...rest } = current;
                          return types.length ? { ...rest, types } : rest;
                        })
                      }
                    />
                  }
                  after={
                    <ConfirmDeleteAction
                      label={`Remove ${tint.name}`}
                      verb="remove"
                      size="sm"
                      pending={false}
                      disabled={false}
                      onConfirm={() => {
                        if (painting) {
                          focus.setBrush(null);
                        }
                        onLink({ ...link, tints: link.tints.filter((candidate) => candidate.id !== tint.id) });
                      }}
                    />
                  }
                />
              );
            })}
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
              const asset = read?.tokens[token.asset_id];
              const name = asset?.name ?? (asset === null ? 'Unavailable token' : 'Loading token...');
              return (
                <TokenRow
                  key={token.layerId}
                  token={token}
                  name={name}
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
