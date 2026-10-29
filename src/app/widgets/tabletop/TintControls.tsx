import { ActionIcon, Button, ColorPicker, ColorSwatch, Group, Popover, SimpleGrid, Text, Tooltip } from '@mantine/core';
import { TINT_COLOR_NAMES, TINT_COLORS, TINT_STAMPS, withFillOpacity } from '@shared/boards/tints';
import type { TintStamp } from '@shared/boards/tints';
import { Brush, Square, Sticker } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { TINT_STICKERS } from './tintStickers';

/*
 * The controls a territory tint is edited with, shared by the Play table's tints and a Spice card's.
 * They draw what they are given and report changes; the table sends commands, the card editor patches its draft.
 */

/** The parts of a tint its row shows; the table's and a card's tints both have them. */
export type TintLike = Readonly<{
  name: string;
  color: string;
  stamps?: readonly TintStamp[];
  outline?: true;
  hidden?: true;
}>;

const svgUrl = (svg: string) => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
const STICKER_MASKS = Object.fromEntries(
  TINT_STAMPS.map((stamp) => [stamp, svgUrl(TINT_STICKERS[stamp].svg)])
) as Record<TintStamp, string>;

/** A sticker's artwork in the button's own colour, so it follows the button's state like a lucide icon. */
function StickerIcon({ stamp }: Readonly<{ stamp: TintStamp }>) {
  const mask = `${STICKER_MASKS[stamp]} center / contain no-repeat`;
  return (
    <span
      aria-hidden
      style={{ display: 'block', width: 18, height: 18, background: 'currentColor', mask, WebkitMask: mask }}
    />
  );
}

/** "Blue tint", or "Blue tint 2" when there already is one by that name. */
function freshTintName(color: (typeof TINT_COLORS)[number], tints: readonly TintLike[]) {
  const base = `${TINT_COLOR_NAMES[color]} tint`;
  const names = new Set(tints.map((tint) => tint.name));
  let name = base;
  for (let count = 2; names.has(name); count++) {
    name = `${base} ${count}`;
  }
  return name;
}

/** A switch on a tint's row: the button looks pressed while the setting is on. */
function SettingToggle({
  label,
  on,
  enabled,
  onToggle,
  children,
}: Readonly<{ label: string; on: boolean; enabled: boolean; onToggle: () => void; children: ReactNode }>) {
  return (
    <Tooltip label={label}>
      <ActionIcon
        variant={on ? 'light' : 'subtle'}
        color={on ? 'yellow' : 'gray'}
        aria-label={label}
        aria-pressed={on}
        disabled={!enabled}
        onClick={onToggle}
      >
        {children}
      </ActionIcon>
    </Tooltip>
  );
}

/** One button for a tint's stickers, opening a picker where each sticker switches on and off. */
function StickerPicker({
  tint,
  enabled,
  onToggle,
}: Readonly<{ tint: TintLike; enabled: boolean; onToggle: (stamp: TintStamp) => void }>) {
  const count = tint.stamps?.length ?? 0;
  const label = `Stickers on ${tint.name}`;
  return (
    <Popover position="bottom-end" shadow="md" withArrow>
      <Popover.Target>
        <Tooltip label={count ? `${label}: ${count}` : label}>
          <ActionIcon
            variant={count ? 'light' : 'subtle'}
            color={count ? 'yellow' : 'gray'}
            aria-label={label}
            disabled={!enabled}
          >
            <Sticker size={18} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown aria-label={label}>
        <Text size="xs" c="dimmed" mb={6}>
          On every territory in {tint.name}
        </Text>
        <SimpleGrid cols={2} spacing={4} verticalSpacing={4}>
          {TINT_STAMPS.map((stamp) => {
            const on = !!tint.stamps?.includes(stamp);
            return (
              <Button
                key={stamp}
                size="compact-sm"
                justify="flex-start"
                variant={on ? 'light' : 'subtle'}
                color={on ? 'yellow' : 'gray'}
                aria-pressed={on}
                leftSection={<StickerIcon stamp={stamp} />}
                onClick={() => onToggle(stamp)}
              >
                {TINT_STICKERS[stamp].label}
              </Button>
            );
          })}
        </SimpleGrid>
      </Popover.Dropdown>
    </Popover>
  );
}

/* A ring around every swatch, so a near-black tint still shows on the table's dark ground. */
const SWATCH_OUTLINE = '1px solid var(--mantine-color-default-border)';

/** The tint's colour swatch, which opens a picker: a preset colour or any other, reported once the pick settles. */
function TintColor({
  tint,
  enabled,
  onColor,
}: Readonly<{ tint: TintLike; enabled: boolean; onColor: (color: string) => void }>) {
  const [draft, setDraft] = useState(withFillOpacity(tint.color));
  const [opened, setOpened] = useState(false);
  const label = `Colour of ${tint.name}`;
  return (
    <Popover position="bottom-start" shadow="md" withArrow opened={opened} onChange={setOpened} disabled={!enabled}>
      <Popover.Target>
        <Tooltip label={label} disabled={opened}>
          <ColorSwatch
            component="button"
            type="button"
            color={tint.color}
            size={22}
            aria-label={label}
            disabled={!enabled}
            onClick={() => {
              setDraft(withFillOpacity(tint.color));
              setOpened((open) => !open);
            }}
            style={{ cursor: enabled ? 'pointer' : 'default', flexShrink: 0, outline: SWATCH_OUTLINE }}
          />
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown aria-label={label}>
        <ColorPicker
          format="hexa"
          value={draft}
          swatches={TINT_COLORS.map(withFillOpacity)}
          swatchesPerRow={TINT_COLORS.length}
          onChange={setDraft}
          onChangeEnd={(color) => {
            const hex = color.toLowerCase();
            if (hex !== withFillOpacity(tint.color)) {
              onColor(hex);
            }
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

/**
 * One tint's row: its colour, name and summary, then outline-only, stickers and the paintbrush.
 * `before` and `after` hold what only one caller has: the table's show/hide eye, a card's territory types, the removal.
 */
export function TintRow({
  tint,
  summary,
  painting,
  enabled,
  onBrush,
  onOutline,
  onStamp,
  onColor,
  before,
  after,
}: Readonly<{
  tint: TintLike;
  summary: string;
  painting: boolean;
  enabled: boolean;
  onBrush: () => void;
  onOutline: () => void;
  onStamp: (stamp: TintStamp) => void;
  onColor: (color: string) => void;
  before?: ReactNode;
  after?: ReactNode;
}>) {
  /*
   * The name and summary claim a readable column first;
   * the buttons drop under them when the panel is too narrow for both, rather than squeezing the words to one per line.
   */
  return (
    <Group
      justify="space-between"
      gap="xs"
      px="sm"
      py={6}
      style={{ borderRadius: 8, border: `1px solid ${painting ? tint.color : 'var(--mantine-color-default-border)'}` }}
    >
      <Group gap="sm" wrap="nowrap" miw={0} flex="1 1 9rem" style={{ opacity: tint.hidden ? 0.5 : 1 }}>
        <TintColor tint={tint} enabled={enabled} onColor={onColor} />
        <div style={{ minWidth: 0 }}>
          <Text size="sm" fw={600}>
            {tint.name}
          </Text>
          <Text size="xs" c="dimmed">
            {summary}
          </Text>
        </div>
      </Group>
      <Group gap={4} wrap="nowrap" ml="auto">
        {before}
        <SettingToggle label="Outline only" on={!!tint.outline} enabled={enabled} onToggle={onOutline}>
          <Square size={18} />
        </SettingToggle>
        <StickerPicker tint={tint} enabled={enabled} onToggle={onStamp} />
        <Tooltip label={painting ? 'Stop painting (Esc)' : `Paint ${tint.name}`}>
          <ActionIcon
            variant={painting ? 'filled' : 'subtle'}
            color={painting ? 'yellow' : 'gray'}
            autoContrast
            aria-label={`Paint ${tint.name}`}
            aria-pressed={painting}
            disabled={!enabled || !!tint.hidden}
            onClick={onBrush}
          >
            <Brush size={18} />
          </ActionIcon>
        </Tooltip>
        {after}
      </Group>
    </Group>
  );
}

/** A swatch per preset colour, each starting a new tint of that colour. */
export function NewTints({
  tints,
  enabled,
  onCreate,
}: Readonly<{
  tints: readonly TintLike[];
  enabled: boolean;
  onCreate: (tint: { name: string; color: string }) => void;
}>) {
  return (
    <Group gap="xs">
      <Text size="xs" c="dimmed" mr={4}>
        New tint
      </Text>
      {TINT_COLORS.map((color) => {
        const label = `New ${TINT_COLOR_NAMES[color].toLowerCase()} tint`;
        return (
          <Tooltip key={color} label={label}>
            <ColorSwatch
              component="button"
              type="button"
              color={color}
              size={22}
              aria-label={label}
              disabled={!enabled}
              style={{ cursor: enabled ? 'pointer' : 'not-allowed', outline: SWATCH_OUTLINE }}
              onClick={() => onCreate({ name: freshTintName(color, tints), color })}
            />
          </Tooltip>
        );
      })}
    </Group>
  );
}
