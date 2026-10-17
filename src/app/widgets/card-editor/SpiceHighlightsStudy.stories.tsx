import { ActionIcon, ColorInput, Group, Select, Slider, Stack, Text, Title } from '@mantine/core';
import preview from '@sb/preview';
import { publishingTokenFace } from '@shared/assets/fixtures/publishingTokenFace';
import type { CustomCardToken } from '@shared/assets/schema';
import { arrakisBoard, blankBoard, derive } from '@shared/boards/geometry';
import type { Board } from '@shared/boards/geometry';
import { useMemo, useState } from 'react';
import { expect, within } from 'storybook/test';
import type { z } from 'zod';

import { BOARD_ARTWORK } from '@game/assets/board/artwork';
import { BoardArtwork } from '@game/assets/board/Board';
import { SpiceCard } from '@game/assets/card/Spice';
import { SPICE_HIGHLIGHT_DEFAULT, resolveSpiceHighlights } from '@game/assets/card/SpiceBoardMap';
import type {
  SpiceHighlight,
  SpiceHighlightTreatment,
  SpiceTokenPlacement,
  TerritoryType,
} from '@game/assets/card/SpiceBoardMap';

/*
 * Study for #1969: Spice-card highlights and token placement on an authored board.
 * The card and the Rulebook-style view below it share one board and one set of selections;
 * only their highlight styling differs.
 */

const token = (name: string, image: string, colors: [string, string]): z.infer<typeof CustomCardToken> => ({
  type: 'token-disc',
  name,
  face: {
    ...publishingTokenFace,
    image: image as typeof publishingTokenFace.image,
    background: { ...publishingTokenFace.background, colors },
    top: '',
    bottomFirst: '',
    bottomSecond: '',
    symbolScale: 1.2,
  },
});

const TOKENS: Record<string, z.infer<typeof CustomCardToken>> = {
  spice: token('Spice', '/vector/icon/spice.svg', ['#C7701B', '#8A4210']),
  'spice-mine': token('Spice mine', '/vector/icon/spice-mine.svg', ['#6B3A17', '#3A1E0B']),
  discovery: token('Discovery', '/vector/icon/eye.svg', ['#2F5F6B', '#173640']),
};

function alteredArrakis(): Board {
  const board = arrakisBoard();
  const key = Object.keys(board.properties).find((k) => board.properties[k].name === 'Funeral plain')!;
  board.properties[key] = { ...board.properties[key], name: 'Funeral flats', id: 'funeral_flats' };
  return board;
}

const BOARDS: Record<string, { label: string; board: () => Board }> = {
  arrakis: { label: 'Arrakis', board: arrakisBoard },
  altered: { label: 'Arrakis, Funeral plain renamed', board: alteredArrakis },
  blank: { label: 'Blank', board: blankBoard },
};

const TYPES: TerritoryType[] = ['sand', 'rock', 'stronghold', 'polar'];

const INITIAL_HIGHLIGHTS: SpiceHighlight[] = [
  { target: { territory: 'funeral_plain' }, ...SPICE_HIGHLIGHT_DEFAULT },
  { target: { territory: 'pasty_mesa' }, color: '#2F5F6B', opacity: 0.6 },
  { target: { type: 'stronghold' }, color: '#8F2C1C', opacity: 0.35 },
];

const INITIAL_TOKENS: SpiceTokenPlacement[] = [
  { layerId: 't1', asset_id: 'spice', x: 150, y: 370, size: 46, rotation: 0 },
  { layerId: 't2', asset_id: 'spice', x: 186, y: 392, size: 46, rotation: 20 },
  { layerId: 't3', asset_id: 'discovery', x: 270, y: 395, size: 56, rotation: -10 },
  /* Outside any highlight, on purpose: placement is never pulled back inside. */
  { layerId: 't4', asset_id: 'spice-mine', x: 380, y: 120, size: 64, rotation: 0 },
];

function RulebookView({ board, highlights }: { board: Board; highlights: readonly SpiceHighlight[] }) {
  const { faces } = derive(board);
  const { resolved } = resolveSpiceHighlights(board, faces, highlights);
  return (
    <svg viewBox="0 0 487.06 487.06" width={320} height={320} aria-label="Rulebook illustration">
      <BoardArtwork board={board} faces={faces} artwork={BOARD_ARTWORK} />
      {resolved.map(({ highlight, faces: matched }, index) => (
        <g key={index} data-rulebook-highlight>
          {matched.map((face) => (
            <path
              key={face.key}
              d={face.path}
              fill={highlight.color}
              fillOpacity={0.35 * highlight.opacity}
              stroke={highlight.color}
              strokeWidth={0.73}
              strokeOpacity={highlight.opacity}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

function targetValue(target: SpiceHighlight['target']) {
  return 'territory' in target ? `territory:${target.territory}` : `type:${target.type}`;
}

function HighlightStudy() {
  const [boardKey, setBoardKey] = useState('arrakis');
  const [treatment, setTreatment] = useState<SpiceHighlightTreatment>('outlined');
  const [highlights, setHighlights] = useState(INITIAL_HIGHLIGHTS);
  const [tokens, setTokens] = useState(INITIAL_TOKENS);
  const board = useMemo(() => BOARDS[boardKey].board(), [boardKey]);
  const { faces } = derive(board);
  const { missing } = resolveSpiceHighlights(board, faces, highlights);
  const targets = [
    ...TYPES.map((type) => ({ value: `type:${type}`, label: `All ${type} territories` })),
    ...Object.values(board.properties)
      .map((p) => ({ value: `territory:${p.id}`, label: p.name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    /* A stored name the board no longer has still shows, so it can be seen and fixed. */
    ...missing.map((id) => ({ value: `territory:${id}`, label: `${id} (missing)` })),
  ];
  const update = <T,>(list: T[], index: number, patch: Partial<T>) =>
    list.map((item, i) => (i === index ? { ...item, ...patch } : item));

  return (
    <Group align="flex-start" gap="xl" p="md" wrap="nowrap">
      <Stack w={360} gap="sm">
        <Select
          label="Board"
          value={boardKey}
          allowDeselect={false}
          data={Object.entries(BOARDS).map(([value, { label }]) => ({ value, label }))}
          onChange={(value) => value && setBoardKey(value)}
        />
        <Select
          label="Highlight style"
          value={treatment}
          allowDeselect={false}
          onChange={(value) => value && setTreatment(value as SpiceHighlightTreatment)}
          data={[
            { value: 'outlined', label: 'A: Outlined (current card look)' },
            { value: 'tinted', label: 'B: Tinted, map shows through' },
          ]}
        />
        <Group justify="space-between">
          <Title order={5}>Highlights</Title>
          <ActionIcon
            aria-label="Add highlight"
            variant="default"
            onClick={() => setHighlights([...highlights, { target: { type: 'sand' }, ...SPICE_HIGHLIGHT_DEFAULT }])}
          >
            +
          </ActionIcon>
        </Group>
        {highlights.map((highlight, index) => (
          <Stack key={index} gap={4} p="xs" style={{ border: '1px solid var(--mantine-color-default-border)' }}>
            <Group gap="xs" wrap="nowrap">
              <Select
                flex={1}
                searchable
                aria-label="Territory"
                value={targetValue(highlight.target)}
                data={targets}
                onChange={(value) => {
                  if (!value) {
                    return;
                  }
                  const [kind, id] = value.split(':');
                  setHighlights(
                    update(highlights, index, {
                      target: kind === 'type' ? { type: id as TerritoryType } : { territory: id },
                    })
                  );
                }}
              />
              <ActionIcon
                aria-label="Remove highlight"
                variant="default"
                onClick={() => setHighlights(highlights.filter((_, i) => i !== index))}
              >
                −
              </ActionIcon>
            </Group>
            <ColorInput
              aria-label="Colour"
              value={highlight.color}
              onChange={(color) => setHighlights(update(highlights, index, { color }))}
            />
            <Text size="xs">Opacity</Text>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={highlight.opacity}
              onChange={(opacity) => setHighlights(update(highlights, index, { opacity }))}
            />
          </Stack>
        ))}
        <Group justify="space-between">
          <Title order={5}>Tokens</Title>
          <Group gap={4}>
            {Object.entries(TOKENS).map(([id, asset]) => (
              <ActionIcon
                key={id}
                w="auto"
                px={6}
                variant="default"
                aria-label={`Add ${asset.name}`}
                onClick={() =>
                  setTokens([
                    ...tokens,
                    { layerId: crypto.randomUUID(), asset_id: id, x: 243, y: 243, size: 50, rotation: 0 },
                  ])
                }
              >
                + {asset.name}
              </ActionIcon>
            ))}
          </Group>
        </Group>
        {tokens.map((placement, index) => (
          <Stack
            key={placement.layerId}
            gap={2}
            p="xs"
            style={{ border: '1px solid var(--mantine-color-default-border)' }}
          >
            <Group justify="space-between">
              <Text size="sm">{TOKENS[placement.asset_id]?.name}</Text>
              <ActionIcon
                aria-label="Remove token"
                variant="default"
                onClick={() => setTokens(tokens.filter((_, i) => i !== index))}
              >
                −
              </ActionIcon>
            </Group>
            {(
              [
                ['x', 'Across', 0, 487],
                ['y', 'Down', 0, 487],
                ['size', 'Size', 10, 160],
                ['rotation', 'Rotation', -180, 180],
              ] as const
            ).map(([key, label, min, max]) => (
              <Group key={key} gap="xs" wrap="nowrap">
                <Text size="xs" w={60}>
                  {label}
                </Text>
                <Slider
                  flex={1}
                  min={min}
                  max={max}
                  value={placement[key]}
                  onChange={(value) => setTokens(update(tokens, index, { [key]: value }))}
                />
              </Group>
            ))}
          </Stack>
        ))}
      </Stack>
      <Stack gap="md" align="center">
        <div style={{ width: 900, height: 1263, zoom: 0.5 }}>
          <SpiceCard
            name="Funeral Plain"
            subName="Spice blow - Discovery"
            icon="spice"
            highlights={[]}
            amount={6}
            text={`**Smuggler token** on Pasty Mesa\n+\n**6 spice** on Funeral Plain`}
            boardMap={{ board, highlights, tokens, tokenAssets: TOKENS, treatment }}
          />
        </div>
        {missing.length ? (
          <Text c="orange" size="sm" role="alert">
            This card highlights {missing.join(', ')}, which the board does not have.
          </Text>
        ) : null}
        <RulebookView board={board} highlights={highlights} />
        <Text size="xs" c="dimmed">
          Rulebook illustration: same territories, Rulebook styling
        </Text>
      </Stack>
    </Group>
  );
}

const meta = preview.meta({
  title: 'Studies/Spice card highlights',
  parameters: { layout: 'fullscreen' },
});

/** Change the board, colours, opacity and tokens; the card and the Rulebook view follow. */
export const Playground = meta.story({
  render: () => <HighlightStudy />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelectorAll('[data-highlight]')).toHaveLength(3);
    await expect(canvasElement.querySelectorAll('[data-token-instance]')).toHaveLength(4);
    await expect(canvas.queryByRole('alert')).toBeNull();
  },
});

/** Low, intermediate and full opacity for both styles, with a type-wide selection under an individual one. */
export const OpacityComparison = meta.story({
  render: () => {
    const board = arrakisBoard();
    return (
      <Stack p="md" gap="md">
        {(['outlined', 'tinted'] as const).map((treatment) => (
          <Group key={treatment} gap="md" wrap="nowrap" align="flex-start">
            <Text w={90} fw={600}>
              {treatment === 'outlined' ? 'A: Outlined' : 'B: Tinted'}
            </Text>
            {[0.25, 0.6, 1].map((opacity) => (
              <Stack key={opacity} gap={4} align="center">
                <div style={{ width: 900, height: 1263, zoom: 0.3 }}>
                  <SpiceCard
                    name="Funeral Plain"
                    subName="Spice blow"
                    icon="spice"
                    highlights={[]}
                    amount={6}
                    boardMap={{
                      board,
                      treatment,
                      highlights: [
                        { target: { type: 'rock' }, color: '#2F5F6B', opacity },
                        { target: { territory: 'funeral_plain' }, color: '#9E5F00', opacity },
                        { target: { territory: 'pasty_mesa' }, color: '#9E5F00', opacity },
                      ],
                    }}
                  />
                </div>
                <Text size="sm">Opacity {Math.round(opacity * 100)}%</Text>
              </Stack>
            ))}
          </Group>
        ))}
      </Stack>
    );
  },
});
