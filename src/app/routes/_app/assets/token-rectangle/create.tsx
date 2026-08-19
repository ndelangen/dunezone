/**
 * PROTOTYPE — wayfinder ticket #508 "Rectangle token editor".
 * THROWAWAY.
 *
 * Direction settled with Norbert: FREE COMPOSITION.
 * The rectangle is not a stretched token and not a shrunk card — its face is a background plus two lists of *placed* elements, decals and text, each positioned and scaled where the author puts it.
 * That is a capability no other Asset type has: every other type slots its text into fixed places.
 * No bevel.
 *
 * Round 2 asks, all in: more freedom in positioning and scaling (sliders for reach, paired unclamped number inputs for precision and for going past the face edge), the project's seven game fonts, and per-element opacity.
 *
 * There is NO rectangular token renderer in `src/game` — every one draws a circle on a square viewBox, and `CustomToken`'s labels are curved arcs meaningless here.
 * The face below is an honest stand-in from the same primitives the real renderer would use (BackgroundRenderer + StrokedUse) on a 300x186 viewBox — the 110/68 aspect the catalogue already reserves.
 * Not print-faithful.
 *
 * Settled elsewhere, not re-litigated (#502, #498): shape is the Asset type and never a tab;
 * every token has a backside, custom or a reference;
 * a custom back publishes under a face-qualified id.
 */
import {
  Alert,
  Divider,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { ControlBlock } from '@ui/control/ControlBlock';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { FlipHorizontal2, IdCard, RectangleHorizontal, Sticker, Type } from 'lucide-react';
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

export const Route = createFileRoute('/_app/assets/token-rectangle/create')({
  component: RectangleTokenPrototype,
});

/* 110/68 — the aspect the catalogue already reserves for this shape. */
const FACE_W = 300;
const FACE_H = 186;

/** The fonts the project actually ships (src/app/styles/fonts.css). */
const FONTS = [
  'C_Copperplate_Gothic',
  'C_Copperplate_Gothic_Heavy',
  'C_Busorama',
  'C_Desdemona',
  'C_Advokat_Modern',
  'C_Candara',
  'C_Trebuchet',
];

/** Text the author places, like a decal — not slotted. */
type TextElement = {
  content: string;
  /** face units from centre; unclamped, so an element may hang off the edge */
  offset: [number, number];
  /** cap height in face units */
  size: number;
  font: string;
  opacity: number;
};

/**
 * A decal with an opacity of its own.
 * The shared `Decal` schema has no opacity — only the binary
 * `muted` treatment — so the prototype carries it alongside rather than mutating a contract the faction and card editors both depend on.
 * If this direction holds, the build adds an optional
 * `opacity` to the shared schema and `DecalControls` grows the slider for every consumer.
 */
type PlacedDecal = DecalData & { opacity: number };

type Face = {
  background: BackgroundData;
  ring: boolean;
  decals: PlacedDecal[];
  texts: TextElement[];
};

const BACKGROUND_PRESETS = [
  { key: 'weapon', label: 'Weapon', background: backgroundPresets.weapon },
  { key: 'defense', label: 'Defense', background: backgroundPresets.defense },
  { key: 'special', label: 'Special', background: backgroundPresets.special },
  { key: 'worthless', label: 'Worthless', background: backgroundPresets.worthless },
];

const emptyFace = (): Face => ({
  background: backgroundPresets.special,
  ring: false,
  decals: [],
  texts: [],
});

const newDecal = (): PlacedDecal => ({
  id: (decalAssetOptions[0] ?? '') as DecalData['id'],
  muted: false,
  outline: false,
  scale: 1,
  offset: [0, 0],
  opacity: 1,
});

const newText = (): TextElement => ({
  content: 'TEXT',
  offset: [0, 0],
  size: 28,
  font: FONTS[0] as string,
  opacity: 1,
});

/* Seeded to the reference token: an emblem left, the name under it, a large modifier right. */
const referenceFace = (): Face => ({
  ...emptyFace(),
  decals: [{ ...newDecal(), scale: 0.9, offset: [-55, -18] }],
  texts: [
    { content: 'KWISATZ\nHADERACH', offset: [-58, 34], size: 15, font: 'C_Copperplate_Gothic_Heavy', opacity: 1 },
    { content: '+2', offset: [72, 6], size: 76, font: 'C_Busorama', opacity: 1 },
  ],
});

/* ------------------------------ the face ------------------------------ */

function DecalLayer({ decals }: { decals: PlacedDecal[] }) {
  return (
    <>
      {decals.map((decal, i) => {
        const w = 100 * decal.scale;
        return (
          <g key={i} opacity={decal.opacity * (decal.muted ? 0.35 : 1)}>
            <StrokedUse
              xlinkHref={`${decal.id}#root`}
              x={FACE_W / 2 - w / 2 + decal.offset[0]}
              y={FACE_H / 2 - w / 2 + decal.offset[1]}
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

function TextLayer({ texts }: { texts: TextElement[] }) {
  return (
    <>
      {texts.map((text, i) => (
        <g
          key={i}
          fill="#ffffff"
          textAnchor="middle"
          opacity={text.opacity}
          filter="drop-shadow(0 0 4px rgb(0 0 0 / 0.9))"
        >
          {text.content.split('\n').map((line, l) => (
            <text
              key={l}
              x={FACE_W / 2 + text.offset[0]}
              y={FACE_H / 2 + text.offset[1] + l * text.size * 1.05}
              style={{ fontSize: text.size, fontFamily: `"${text.font}", sans-serif` }}
            >
              {line}
            </text>
          ))}
        </g>
      ))}
    </>
  );
}

function RectangleFace({ face }: { face: Face }) {
  return (
    <BackgroundRenderer background={face.background} className={styles.face}>
      <svg viewBox={`0 0 ${FACE_W} ${FACE_H}`} aria-label="Rectangle token face">
        <DecalLayer decals={face.decals} />
        <TextLayer texts={face.texts} />
        {face.ring ? (
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
      </svg>
    </BackgroundRenderer>
  );
}

/* ------------------------------ the editor ------------------------------ */

const panel = (children: ReactNode) => <Stack gap="lg">{children}</Stack>;

type Patch = (update: Partial<Face>) => void;

/** A slider for reach with an unclamped number beside it for precision — the decal pattern. */
function PlacementControl({
  title,
  description,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  title: string;
  description?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <ControlBlock
      title={title}
      description={description}
      tool={
        <NumberInput
          aria-label={title}
          w={96}
          step={step}
          decimalScale={2}
          value={value}
          onChange={(next) => {
            if (typeof next === 'number') {
              onChange(next);
            }
          }}
        />
      }
      input={
        <Slider aria-label={`${title} slider`} min={min} max={max} step={step} value={value} onChange={onChange} />
      }
    />
  );
}

function BackgroundField({ face, patch }: { face: Face; patch: Patch }) {
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

function DecalsField({ face, patch }: { face: Face; patch: Patch }) {
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
          onAdd={() => patch({ decals: [...face.decals, newDecal()] })}
          onRemove={() => patch({ decals: face.decals.slice(0, -1) })}
        />
      </Group>
      {face.decals.length === 0 ? (
        <Alert color="gray" variant="light" title="No decals">
          Add one and put it anywhere on the face.
        </Alert>
      ) : null}
      {face.decals.map((decal, index) => (
        <Stack key={index} gap="sm">
          {index > 0 ? <Divider /> : null}
          <Text size="sm" fw={600}>
            Decal {index + 1}
          </Text>
          <DecalControls
            value={decal}
            onChange={(next) =>
              patch({
                decals: face.decals.map((d, i) => (i === index ? { ...next, opacity: d.opacity } : d)),
              })
            }
            label={`decal ${index + 1}`}
            /* The sliders reach a full face past centre in each direction; the number inputs
               beside them are unclamped, so nothing stops an element hanging off the edge. */
            offsetRange={[FACE_W, FACE_H]}
          />
          <PlacementControl
            title="Opacity"
            description="1 is fully opaque; multiplies with the muted treatment."
            value={decal.opacity}
            onChange={(value) =>
              patch({ decals: face.decals.map((d, i) => (i === index ? { ...d, opacity: value } : d)) })
            }
            min={0}
            max={1}
            step={0.05}
          />
        </Stack>
      ))}
    </Stack>
  );
}

function TextsField({ face, patch }: { face: Face; patch: Patch }) {
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
          onAdd={() => patch({ texts: [...face.texts, newText()] })}
          onRemove={() => patch({ texts: face.texts.slice(0, -1) })}
        />
      </Group>
      {face.texts.length === 0 ? (
        <Alert color="gray" variant="light" title="No text">
          The rectangle places its text rather than slotting it — add one and put it anywhere.
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
                aria-label={`Content for text ${index + 1}`}
                autosize
                minRows={1}
                value={text.content}
                onChange={(event) => setText(index, { content: event.currentTarget.value })}
              />
            }
          />
          <ControlBlock
            title="Font"
            description="The faces the project ships."
            input={
              <Select
                aria-label={`Font for text ${index + 1}`}
                data={FONTS.map((font) => ({ value: font, label: font.replace(/^C_/, '').replace(/_/g, ' ') }))}
                value={text.font}
                allowDeselect={false}
                onChange={(value) => value && setText(index, { font: value })}
              />
            }
          />
          <PlacementControl
            title="Size"
            description="Cap height in face units; the face is 186 tall."
            value={text.size}
            onChange={(value) => setText(index, { size: value })}
            min={4}
            max={160}
          />
          <PlacementControl
            title="Opacity"
            description="1 is fully opaque."
            value={text.opacity}
            onChange={(value) => setText(index, { opacity: value })}
            min={0}
            max={1}
            step={0.05}
          />
          <Group grow align="flex-start">
            <PlacementControl
              title="Horizontal offset"
              value={text.offset[0]}
              onChange={(value) => setText(index, { offset: [value, text.offset[1]] })}
              min={-FACE_W}
              max={FACE_W}
            />
            <PlacementControl
              title="Vertical offset"
              value={text.offset[1]}
              onChange={(value) => setText(index, { offset: [text.offset[0], value] })}
              min={-FACE_H}
              max={FACE_H}
            />
          </Group>
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * One face, three chapters — the surface, its decals, its text. Both faces get the same set, so
 * the icons say which *kind* of work a chapter is; the face icon differs so front and back never
 * read alike.
 */
function faceChapters(key: string, label: string, faceIcon: ReactNode, face: Face, patch: Patch) {
  return [
    {
      value: key,
      label,
      icon: faceIcon,
      panel: panel(
        <Stack gap="lg">
          <BackgroundField face={face} patch={patch} />
          <ControlBlock
            title="Edge ring"
            description="A rounded inset rule. The reference token has none, so it is off by default."
            input={<Switch checked={face.ring} onChange={(event) => patch({ ring: event.currentTarget.checked })} />}
          />
        </Stack>
      ),
    },
    {
      value: `${key}-decals`,
      label: `${label} decals`,
      icon: <Sticker size={21} aria-hidden />,
      panel: panel(<DecalsField face={face} patch={patch} />),
    },
    {
      value: `${key}-text`,
      label: `${label} text`,
      icon: <Type size={21} aria-hidden />,
      panel: panel(<TextsField face={face} patch={patch} />),
    },
  ];
}

function RectangleTokenPrototype() {
  const [name, setName] = useState('Kwisatz Haderach');
  const [face, setFace] = useState<Face>(referenceFace);
  const [backMode, setBackMode] = useState<'token' | 'custom'>('custom');
  const [backFace, setBackFace] = useState<Face>(emptyFace);
  const [chapter, setChapter] = useState('identity');
  const patch: Patch = (update) => setFace((prev) => ({ ...prev, ...update }));
  const patchBack: Patch = (update) => setBackFace((prev) => ({ ...prev, ...update }));

  const items = [
    {
      value: 'identity',
      label: 'Identity',
      icon: <IdCard size={21} aria-hidden />,
      panel: panel(
        <Stack gap="lg">
          <ControlBlock
            title="Name"
            description="Names the token and determines its URL."
            input={<TextInput value={name} onChange={(event) => setName(event.currentTarget.value)} />}
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
    ...faceChapters('front', 'Front', <RectangleHorizontal size={21} aria-hidden />, face, patch),
    /* The back is authored exactly like the front — same three chapters, same controls. */
    ...(backMode === 'custom'
      ? faceChapters('back', 'Back', <FlipHorizontal2 size={21} aria-hidden />, backFace, patchBack)
      : []),
  ];

  return (
    <PageLayout>
      <PageLayout.Content>
        <Stack gap="sm" style={{ width: '100%', maxWidth: '78rem', margin: '0 auto' }}>
          <Surface padding="md">
            <Text size="sm" fw={700}>
              PROTOTYPE — rectangle token editor (#508) · free composition
            </Text>
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
                  <RectangleFace face={face} />
                </CanvasScale>
                {backMode === 'custom' ? (
                  <>
                    <Text size="xs" fw={700} tt="uppercase" c="dimmed" ta="center">
                      Back
                    </Text>
                    <CanvasScale canvasWidth={FACE_W} canvasHeight={FACE_H}>
                      <RectangleFace face={backFace} />
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
