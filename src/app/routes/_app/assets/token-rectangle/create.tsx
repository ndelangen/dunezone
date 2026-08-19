/**
 * PROTOTYPE — wayfinder ticket #508 "Rectangle token editor".
 * THROWAWAY.
 *
 * The finding that shapes this prototype: there is NO rectangular token renderer.
 * Every token renderer in `src/game` draws a circle on a square viewBox, and `CustomToken`'s three labels are curved arcs (r=100/90/105) whose geometry means nothing on a rectangle.
 * So "compose the settled token editor with the card editor's decal chapter" does not suffice on its own — the face model itself is open, and that is what these variations put up for decision.
 *
 * The face renderer below is a prototype stand-in built from the same primitives the real one would use (BackgroundRenderer + StrokedUse), on a 300x186 viewBox matching the catalogue's 110/68 rectangle.
 * It is close enough to judge composition and controls, not print-faithful.
 *
 * Settled, not re-litigated here (#502, #498): shape is the Asset type and never a tab;
 * every token has a backside, custom or a reference to an existing token;
 * a custom back publishes under a face-qualified id, a referenced back publishes nothing of its own.
 *
 * Variations (?v=): a = Token, stretched · b = Card, shrunk · c = Pictorial strip
 */
import {
  Alert,
  Divider,
  Group,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ControlBlock } from '@ui/control/ControlBlock';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Brush, Images, Layers, Type } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { BackgroundPresetPicker } from '@app/widgets/background-composer/BackgroundPresetPicker';
import { DecalControls } from '@app/widgets/decal-editor/DecalControls';
import type { DecalData } from '@app/widgets/decal-editor/DecalControls';
import { decalAssetOptions } from '@app/widgets/faction-editor/factionFormAssetUtils';
import { BackgroundRenderer } from '@game/assets/utils/BackgroundRenderer';
import { StrokedUse } from '@game/components/block/StrokedUse';
import { backgroundPresets } from '@game/data/backgrounds';
import type { BackgroundData } from '@game/data/backgrounds';

import styles from './create.module.css';

type Variant = 'a' | 'b' | 'c' | 'd';

export const Route = createFileRoute('/_app/assets/token-rectangle/create')({
  validateSearch: (search: Record<string, unknown>): { v: Variant } => ({
    v: search.v === 'a' || search.v === 'b' || search.v === 'c' ? search.v : 'd',
  }),
  component: RectangleTokenPrototype,
});

/* ------------------------------ the rectangle ------------------------------ */
/* 110/68 — the aspect the catalogue already reserves for this shape. */
const FACE_W = 300;
const FACE_H = 186;

type Face = {
  background: BackgroundData;
  /** the centred symbol — variations a only */
  symbol: string;
  symbolScale: number;
  /** three labels: one top, two bottom — variation a (straight, not curved) */
  top: string;
  bottom1: string;
  bottom2: string;
  /** the edge rule — a rounded inset rect here, not a circle */
  ring: boolean;
  /** the odd-one-out: multiple decals, like a treachery card */
  decals: DecalData[];
  /** variation d: text that is placed, not slotted — the reference token's "+2" */
  texts: TextElement[];
  /** variation b only: the card-like head text */
  name: string;
  type: string;
};

/** A line (or two) of text the author positions anywhere on the face, like a decal. */
type TextElement = {
  content: string;
  /** face units from centre */
  offset: [number, number];
  /** cap height in face units */
  size: number;
};

const VECTORS = [
  '/vector/icon/projectile.svg',
  '/vector/icon/poison.svg',
  '/vector/icon/karama.svg',
  '/vector/icon/heighliners.svg',
  '/vector/logo/fremen.svg',
];

const BACKGROUND_PRESETS = [
  { key: 'weapon', label: 'Weapon', background: backgroundPresets.weapon },
  { key: 'defense', label: 'Defense', background: backgroundPresets.defense },
  { key: 'special', label: 'Special', background: backgroundPresets.special },
  { key: 'worthless', label: 'Worthless', background: backgroundPresets.worthless },
];

const emptyFace = (): Face => ({
  background: backgroundPresets.special,
  symbol: VECTORS[0] as string,
  symbolScale: 1,
  top: 'Tech',
  bottom1: 'Ixian',
  bottom2: '',
  ring: true,
  decals: [],
  texts: [],
  name: 'Ixian Probe',
  type: 'Tech - Rectangle',
});

/* Seeded to the reference token Norbert supplied: an emblem left, a big modifier right, and the
   name set under the emblem — three placed elements, none of them in a fixed slot. */
const referenceFace = (): Face => ({
  ...emptyFace(),
  name: 'Kwisatz Haderach',
  decals: [
    {
      id: (decalAssetOptions[0] ?? '') as DecalData['id'],
      muted: false,
      outline: false,
      scale: 0.9,
      offset: [-330, -110],
    },
  ],
  texts: [
    { content: 'KWISATZ\nHADERACH', offset: [-58, 34], size: 15 },
    { content: '+2', offset: [72, 6], size: 76 },
  ],
});

/** Decals draw in face units; scale 1 is a third of the face width. */
function DecalLayer({ decals }: { decals: DecalData[] }) {
  return (
    <>
      {decals.map((decal, i) => {
        const w = 100 * decal.scale;
        return (
          <g key={i} opacity={decal.muted ? 0.35 : 1}>
            <StrokedUse
              xlinkHref={`${decal.id}#root`}
              x={FACE_W / 2 - w / 2 + decal.offset[0] / 6}
              y={FACE_H / 2 - w / 2 + decal.offset[1] / 6}
              width={w}
              height={w}
              fill="#ffffff"
              stroke={decal.outline ? '#000000' : undefined}
              strokeWidth={decal.outline ? 1.5 : undefined}
            />
          </g>
        );
      })}
    </>
  );
}

/** Placed text: centred on its own offset, each newline a further line down. */
function TextLayer({ texts }: { texts: TextElement[] }) {
  return (
    <>
      {texts.map((text, i) => {
        const lines = text.content.split('\n');
        return (
          <g key={i} fill="#ffffff" textAnchor="middle" filter="drop-shadow(0 0 4px rgb(0 0 0 / 0.9))">
            {lines.map((line, l) => (
              <text
                key={l}
                x={FACE_W / 2 + text.offset[0]}
                y={FACE_H / 2 + text.offset[1] + l * text.size * 1.05}
                style={{ fontSize: text.size, fontWeight: 700 }}
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}
    </>
  );
}

function RectangleFace({ face, variant }: { face: Face; variant: Variant }) {
  const symbolW = 90 * face.symbolScale;
  return (
    <BackgroundRenderer background={face.background} className={styles.face}>
      <svg viewBox={`0 0 ${FACE_W} ${FACE_H}`} aria-label="Rectangle token face">
        {/* variation a keeps the token's centred symbol; b and c do not */}
        {variant === 'a' ? (
          <g filter="drop-shadow( 0 0 9px rgba(0, 0, 0, 0.6))">
            <StrokedUse
              xlinkHref={`${face.symbol}#root`}
              x={FACE_W / 2 - symbolW / 2}
              y={FACE_H / 2 - symbolW / 2}
              width={symbolW}
              height={symbolW}
              fill="#ffffff"
            />
          </g>
        ) : null}

        <DecalLayer decals={face.decals} />

        {variant === 'd' ? <TextLayer texts={face.texts} /> : null}

        {face.ring && variant !== 'c' ? (
          <rect
            x={8}
            y={8}
            width={FACE_W - 16}
            height={FACE_H - 16}
            rx={10}
            fill="transparent"
            stroke="#ffffff"
            strokeWidth={1.3}
          />
        ) : null}

        {/* variation a: the three token labels, straightened onto baselines */}
        {variant === 'a' ? (
          <g fill="#ffffff" textAnchor="middle" filter="drop-shadow(0 0 5px rgb(0 0 0 / 1))">
            <text x={FACE_W / 2} y={32} style={{ fontSize: 24, textTransform: 'uppercase' }}>
              {face.top}
            </text>
            <text x={FACE_W / 2} y={FACE_H - 30} style={{ fontSize: 14, textTransform: 'uppercase' }}>
              {face.bottom1}
            </text>
            <text x={FACE_W / 2} y={FACE_H - 14} style={{ fontSize: 14, textTransform: 'uppercase' }}>
              {face.bottom2}
            </text>
          </g>
        ) : null}

        {/* variation b: card anatomy — a name and a type line, left aligned like a card head */}
        {variant === 'b' ? (
          <g fill="#ffffff" filter="drop-shadow(0 0 5px rgb(0 0 0 / 1))">
            <text x={18} y={34} style={{ fontSize: 26 }}>
              {face.name}
            </text>
            <text x={18} y={54} style={{ fontSize: 14, opacity: 0.85 }}>
              {face.type}
            </text>
          </g>
        ) : null}
      </svg>
    </BackgroundRenderer>
  );
}

/* ------------------------------ the editor ------------------------------ */

const panel = (children: ReactNode) => <Stack gap="lg">{children}</Stack>;

function BackgroundField({ face, patch }: { face: Face; patch: (f: Partial<Face>) => void }) {
  const selected = BACKGROUND_PRESETS.find((p) => p.background === face.background)?.key ?? 'custom';
  return (
    <ControlBlock
      title="Background"
      description="The background behind the whole face."
      input={
        <BackgroundPresetPicker
          presets={BACKGROUND_PRESETS}
          selected={selected}
          customBackground={face.background}
          onSelect={(key) => {
            const preset = BACKGROUND_PRESETS.find((p) => p.key === key);
            if (preset) {
              patch({ background: preset.background });
            }
          }}
        />
      }
    />
  );
}

function DecalsField({ face, patch }: { face: Face; patch: (f: Partial<Face>) => void }) {
  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Text fw={700} size="sm">
          Decals
        </Text>
        <ListLengthActions
          addLabel="Add decal"
          removeLabel="Remove last decal"
          removeDisabled={face.decals.length === 0}
          onAdd={() =>
            patch({
              decals: [
                ...face.decals,
                {
                  id: (decalAssetOptions[0] ?? '') as DecalData['id'],
                  muted: false,
                  outline: true,
                  scale: 1,
                  offset: [0, 0],
                },
              ],
            })
          }
          onRemove={() => patch({ decals: face.decals.slice(0, -1) })}
        />
      </Group>
      {face.decals.length === 0 ? (
        <Alert color="gray" variant="light" title="No decals">
          The rectangle is the decal-bearing shape — add one to see what it buys.
        </Alert>
      ) : null}
      {face.decals.map((decal, index) => (
        <DecalControls
          key={index}
          value={decal}
          onChange={(next) => patch({ decals: face.decals.map((d, i) => (i === index ? next : d)) })}
          label={`decal ${index + 1}`}
          offsetRange={[150, 93]}
        />
      ))}
    </Stack>
  );
}

/* Text gets exactly what decals get: a list you extend, and position plus size per element. */
function TextsField({ face, patch }: { face: Face; patch: (f: Partial<Face>) => void }) {
  const setText = (index: number, update: Partial<TextElement>) =>
    patch({ texts: face.texts.map((t, i) => (i === index ? { ...t, ...update } : t)) });
  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Text fw={700} size="sm">
          Text elements
        </Text>
        <ListLengthActions
          addLabel="Add text"
          removeLabel="Remove last text"
          removeDisabled={face.texts.length === 0}
          onAdd={() => patch({ texts: [...face.texts, { content: 'TEXT', offset: [0, 0], size: 28 }] })}
          onRemove={() => patch({ texts: face.texts.slice(0, -1) })}
        />
      </Group>
      {face.texts.length === 0 ? (
        <Alert color="gray" variant="light" title="No text">
          The rectangle places its text rather than slotting it — add one and drag it anywhere.
        </Alert>
      ) : null}
      {face.texts.map((text, index) => (
        <Stack key={index} gap="sm">
          {index > 0 ? <Divider /> : null}
          <Text size="sm" fw={600}>
            Text {index + 1}
          </Text>
          <ControlBlock
            title="Content"
            description="Each line break becomes another line, centred on the same point."
            input={
              <Textarea
                autosize
                minRows={1}
                value={text.content}
                onChange={(e) => setText(index, { content: e.currentTarget.value })}
              />
            }
          />
          <ControlBlock
            title="Size"
            description="Cap height in face units."
            input={
              <Slider
                min={8}
                max={110}
                step={1}
                value={text.size}
                onChange={(value) => setText(index, { size: value })}
              />
            }
          />
          <Group grow>
            <ControlBlock
              title="Horizontal offset"
              input={
                <Slider
                  min={-FACE_W / 2}
                  max={FACE_W / 2}
                  step={1}
                  value={text.offset[0]}
                  onChange={(value) => setText(index, { offset: [value, text.offset[1]] })}
                />
              }
            />
            <ControlBlock
              title="Vertical offset"
              input={
                <Slider
                  min={-FACE_H / 2}
                  max={FACE_H / 2}
                  step={1}
                  value={text.offset[1]}
                  onChange={(value) => setText(index, { offset: [text.offset[0], value] })}
                />
              }
            />
          </Group>
        </Stack>
      ))}
    </Stack>
  );
}

function RectangleTokenPrototype() {
  const { v } = Route.useSearch();
  const navigate = useNavigate();
  const [face, setFace] = useState<Face>(referenceFace);
  const [backMode, setBackMode] = useState<'token' | 'custom'>('custom');
  const [backFace, setBackFace] = useState<Face>(emptyFace);
  const [chapter, setChapter] = useState('identity');
  const patch = (update: Partial<Face>) => setFace((prev) => ({ ...prev, ...update }));
  const patchBack = (update: Partial<Face>) => setBackFace((prev) => ({ ...prev, ...update }));

  const frontChapter =
    v === 'a' ? (
      <Stack gap="lg">
        <BackgroundField face={face} patch={patch} />
        <ControlBlock
          title="Symbol"
          description="The centred vector, as on the round token."
          input={
            <Select
              data={VECTORS.map((value) => ({ value, label: value.split('/').pop() ?? value }))}
              value={face.symbol}
              onChange={(value) => value && patch({ symbol: value })}
            />
          }
        />
        <ControlBlock
          title="Symbol scale"
          description="1 is the reference size."
          input={
            <Slider
              min={0.4}
              max={2}
              step={0.05}
              value={face.symbolScale}
              onChange={(value) => patch({ symbolScale: value })}
            />
          }
        />
        <ControlBlock
          title="Top label"
          description="Straight, not curved — the arc geometry does not survive the rectangle."
          input={<TextInput value={face.top} onChange={(e) => patch({ top: e.currentTarget.value })} />}
        />
        <Group grow>
          <ControlBlock
            title="Bottom line 1"
            input={<TextInput value={face.bottom1} onChange={(e) => patch({ bottom1: e.currentTarget.value })} />}
          />
          <ControlBlock
            title="Bottom line 2"
            input={<TextInput value={face.bottom2} onChange={(e) => patch({ bottom2: e.currentTarget.value })} />}
          />
        </Group>
        <ControlBlock
          title="Edge ring"
          description="A rounded inset rule, standing in for the round token's edge ring."
          input={<Switch checked={face.ring} onChange={(e) => patch({ ring: e.currentTarget.checked })} />}
        />
      </Stack>
    ) : v === 'b' ? (
      <Stack gap="lg">
        <ControlBlock
          title="Name"
          input={<TextInput value={face.name} onChange={(e) => patch({ name: e.currentTarget.value })} />}
        />
        <ControlBlock
          title="Type"
          input={<TextInput value={face.type} onChange={(e) => patch({ type: e.currentTarget.value })} />}
        />
        <BackgroundField face={face} patch={patch} />
        <ControlBlock
          title="Edge ring"
          input={<Switch checked={face.ring} onChange={(e) => patch({ ring: e.currentTarget.checked })} />}
        />
      </Stack>
    ) : v === 'c' ? (
      <Stack gap="lg">
        <BackgroundField face={face} patch={patch} />
        <Text size="sm" c="dimmed">
          No symbol, no labels, no ring — the face is background plus decals and nothing else.
        </Text>
      </Stack>
    ) : (
      <Stack gap="lg">
        <BackgroundField face={face} patch={patch} />
        <ControlBlock
          title="Edge ring"
          description="A rounded inset rule; the reference token has none."
          input={<Switch checked={face.ring} onChange={(e) => patch({ ring: e.currentTarget.checked })} />}
        />
        <Text size="sm" c="dimmed">
          Everything else on this face is a placed element: add decals and text, and put them where you want them.
        </Text>
      </Stack>
    );

  const items = [
    {
      value: 'identity',
      label: 'Identity',
      icon: <Type size={21} aria-hidden />,
      panel: panel(
        <Stack gap="lg">
          <ControlBlock
            title="Name"
            description="Names the token and determines its URL."
            input={<TextInput value={face.name} onChange={(e) => patch({ name: e.currentTarget.value })} />}
          />
          <ControlBlock
            title="Backside"
            description="Every token has one: authored here, or an existing token used as the back."
            input={
              <SegmentedControl
                fullWidth
                value={backMode}
                onChange={(value) => setBackMode(value as 'token' | 'custom')}
                data={[
                  { value: 'custom', label: 'Custom back' },
                  { value: 'token', label: 'Existing token' },
                ]}
              />
            }
          />
          {backMode === 'token' ? (
            <Select
              label="Back token"
              data={[
                { value: 'heighliner', label: 'Heighliner (by gurney)' },
                { value: 'karama', label: 'Karama (by irulan)' },
              ]}
              defaultValue="heighliner"
            />
          ) : null}
        </Stack>
      ),
    },
    {
      value: 'front',
      label: 'Front',
      icon: <Layers size={21} aria-hidden />,
      panel: panel(frontChapter),
    },
    {
      value: 'decals',
      label: 'Decals',
      icon: <Brush size={21} aria-hidden />,
      panel: panel(<DecalsField face={face} patch={patch} />),
    },
    ...(v === 'd'
      ? [
          {
            value: 'text',
            label: 'Text',
            icon: <Type size={21} aria-hidden />,
            panel: panel(<TextsField face={face} patch={patch} />),
          },
        ]
      : []),
    ...(backMode === 'custom'
      ? [
          {
            value: 'back',
            label: 'Back',
            icon: <Images size={21} aria-hidden />,
            panel: panel(
              <Stack gap="lg">
                <BackgroundField face={backFace} patch={patchBack} />
                <DecalsField face={backFace} patch={patchBack} />
              </Stack>
            ),
          },
        ]
      : []),
  ];

  return (
    <PageLayout>
      <PageLayout.Content>
        <Stack gap="sm" style={{ width: '100%', maxWidth: '78rem', margin: '0 auto' }}>
          <Surface padding="md">
            <Group justify="space-between">
              <Text size="sm" fw={700}>
                PROTOTYPE — rectangle token editor (#508)
              </Text>
              <SegmentedControl
                value={v}
                onChange={(value) => void navigate({ to: '.', search: { v: value as Variant } })}
                data={[
                  { value: 'd', label: 'D · Free composition' },
                  { value: 'a', label: 'A · Token, stretched' },
                  { value: 'b', label: 'B · Card, shrunk' },
                  { value: 'c', label: 'C · Pictorial strip' },
                ]}
              />
            </Group>
          </Surface>
          <div
            style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(17rem, 21rem)', alignItems: 'start' }}
          >
            <ConnectedTabs value={chapter} onValueChange={setChapter} ariaLabel="Token chapters" items={items} />
            <div style={{ minWidth: 0, paddingLeft: 'var(--mantine-spacing-md)' }}>
              <Stack gap="md" style={{ position: 'sticky', top: 96 }}>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" ta="center">
                  Front
                </Text>
                <CanvasScale canvasWidth={FACE_W} canvasHeight={FACE_H}>
                  <RectangleFace face={face} variant={v} />
                </CanvasScale>
                {backMode === 'custom' ? (
                  <>
                    <Text size="xs" fw={700} tt="uppercase" c="dimmed" ta="center">
                      Back
                    </Text>
                    <CanvasScale canvasWidth={FACE_W} canvasHeight={FACE_H}>
                      <RectangleFace face={backFace} variant={v} />
                    </CanvasScale>
                  </>
                ) : (
                  <Alert color="gray" variant="light" title="Referenced back">
                    The back is another token; this token publishes only its front.
                  </Alert>
                )}
              </Stack>
            </div>
          </div>
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
