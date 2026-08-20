import {
  Alert,
  Divider,
  Group,
  NumberInput,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { RECTANGLE_TOKEN_FONTS } from '@shared/assets/schema';
import type { RectangleTokenAsset } from '@shared/assets/schema';
import { TopicIcon } from '@ui/content/TopicIcon';
import { ControlBlock } from '@ui/control/ControlBlock';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { RectangleHorizontal, Type } from 'lucide-react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { assetFaceAspect, TokenFrame } from '@app/widgets/asset-face/AssetFace';
import { BackgroundPresetPicker } from '@app/widgets/background-composer/BackgroundPresetPicker';
import { DecalControls } from '@app/widgets/decal-editor/DecalControls';
import { decalAssetOptions } from '@app/widgets/faction-editor/factionFormAssetUtils';
import { RectangleToken } from '@game/assets/token/Rectangle';
import { backgroundPresets } from '@game/data/backgrounds';

/**
 * The size the rail's proof is drawn at before `CanvasScale` fits it to the rail.
 * Any number does.
 * This one matches the detail page, so a proof and the page it previews scale off the same canvas.
 */
const PROOF_CANVAS = 900;

export type RectangleDraft = z.infer<typeof RectangleTokenAsset>;
export type RectangleFaceDraft = RectangleDraft['front'];
export type RectangleChapter =
  | 'identity'
  | 'front'
  | 'front-decals'
  | 'front-text'
  | 'back'
  | 'back-decals'
  | 'back-text';

/**
 * The face's own units, matching the renderer's viewBox.
 * Sliders reach a full face past centre in each direction while the number inputs stay unclamped, so an element can be placed off the edge deliberately.
 */
const FACE_WIDTH = 300;
const FACE_HEIGHT = 186;

const BACKGROUND_PRESETS = [
  { key: 'weapon', label: 'Weapon', background: backgroundPresets.weapon },
  { key: 'defense', label: 'Defense', background: backgroundPresets.defense },
  { key: 'special', label: 'Special', background: backgroundPresets.special },
  { key: 'worthless', label: 'Worthless', background: backgroundPresets.worthless },
];

const INITIAL_FACE: RectangleFaceDraft = {
  background: backgroundPresets.special,
  ring: false,
  decals: [],
  texts: [],
};

export const INITIAL_RECTANGLE_DRAFT: RectangleDraft = {
  name: '',
  about: '',
  front: INITIAL_FACE,
  back: { mode: 'custom', face: INITIAL_FACE },
};

const newDecal = (): RectangleFaceDraft['decals'][number] => ({
  id: (decalAssetOptions[0] ?? '') as RectangleFaceDraft['decals'][number]['id'],
  muted: false,
  outline: false,
  scale: 1,
  offset: [0, 0],
  opacity: 1,
});

const newText = (): RectangleFaceDraft['texts'][number] => ({
  content: 'TEXT',
  offset: [0, 0],
  size: 28,
  font: RECTANGLE_TOKEN_FONTS[0],
  opacity: 1,
});

/** One face at whatever width it is given, clipped by the same frame the catalogue surfaces use. */
export function RectangleProof({ face, width }: { face: RectangleFaceDraft; width: number }) {
  return (
    <TokenFrame shape="rectangle" width={width}>
      <RectangleToken {...face} />
    </TokenFrame>
  );
}

/** A slider for reach with an unclamped number beside it for precision, the pattern `DecalControls` already uses. */
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

type FacePatch = (update: Partial<RectangleFaceDraft>) => void;

function SurfaceFields({ face, patch }: { face: RectangleFaceDraft; patch: FacePatch }) {
  const selected = BACKGROUND_PRESETS.find((preset) => preset.background === face.background)?.key ?? 'custom';
  return (
    <Stack gap="lg">
      <ControlBlock
        title="Background"
        description="Behind the whole face."
        input={
          <BackgroundPresetPicker
            presets={BACKGROUND_PRESETS}
            selected={selected}
            customBackground={face.background}
            onSelect={(key) => {
              const preset = BACKGROUND_PRESETS.find((candidate) => candidate.key === key);
              if (preset) {
                patch({ background: preset.background });
              }
            }}
          />
        }
      />
      <ControlBlock
        title="Edge ring"
        description="A rounded inset rule. Off by default, unlike the round shapes."
        input={
          <Switch
            aria-label="Edge ring"
            checked={face.ring}
            onChange={(event) => patch({ ring: event.currentTarget.checked })}
          />
        }
      />
    </Stack>
  );
}

function DecalsFields({ face, patch }: { face: RectangleFaceDraft; patch: FacePatch }) {
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
                /* `DecalControls` speaks the shared `Decal` contract, which has no opacity, so this type's own field is carried across the edit rather than lost. */
                decals: face.decals.map((current, position) =>
                  position === index ? { ...next, opacity: current.opacity } : current
                ),
              })
            }
            label={`decal ${index + 1}`}
            offsetRange={[FACE_WIDTH, FACE_HEIGHT]}
          />
          <PlacementControl
            title="Opacity"
            description="1 is fully opaque, and it multiplies with the muted treatment."
            value={decal.opacity}
            onChange={(value) =>
              patch({
                decals: face.decals.map((current, position) =>
                  position === index ? { ...current, opacity: value } : current
                ),
              })
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

function TextsFields({ face, patch }: { face: RectangleFaceDraft; patch: FacePatch }) {
  const setText = (index: number, update: Partial<RectangleFaceDraft['texts'][number]>) =>
    patch({
      texts: face.texts.map((current, position) => (position === index ? { ...current, ...update } : current)),
    });
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
          The rectangle places its text rather than slotting it. Add one and put it anywhere.
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
                allowDeselect={false}
                data={RECTANGLE_TOKEN_FONTS.map((font) => ({
                  value: font,
                  label: font.replace(/^C_/, '').replace(/_/g, ' '),
                }))}
                value={text.font}
                onChange={(value) => {
                  if (value) {
                    setText(index, { font: value as RectangleFaceDraft['texts'][number]['font'] });
                  }
                }}
                /* Every option is set in the face it names, so the list shows the choice rather than describing it. */
                renderOption={({ option }) => (
                  <span style={{ fontFamily: `"${option.value}", sans-serif`, fontSize: 18 }}>{option.label}</span>
                )}
                styles={{ input: { fontFamily: `"${text.font}", sans-serif` } }}
              />
            }
          />
          <PlacementControl
            title="Size"
            description={`Cap height in face units; the face is ${FACE_HEIGHT} tall.`}
            value={text.size}
            onChange={(value) => setText(index, { size: value })}
            min={4}
            max={160}
          />
          <PlacementControl
            title="Opacity"
            value={text.opacity}
            onChange={(value) => setText(index, { opacity: value })}
            min={0}
            max={1}
            step={0.05}
          />
          <Group grow align="flex-start">
            <PlacementControl
              title={`Text ${index + 1} horizontal offset`}
              value={text.offset[0]}
              onChange={(value) => setText(index, { offset: [value, text.offset[1]] })}
              min={-FACE_WIDTH}
              max={FACE_WIDTH}
            />
            <PlacementControl
              title={`Text ${index + 1} vertical offset`}
              value={text.offset[1]}
              onChange={(value) => setText(index, { offset: [text.offset[0], value] })}
              min={-FACE_HEIGHT}
              max={FACE_HEIGHT}
            />
          </Group>
        </Stack>
      ))}
    </Stack>
  );
}

export type RectangleWarning = { source: string; missing: string; chapter: RectangleChapter };

/**
 * What is incomplete rather than invalid.
 * A blank name blocks the save outright, so it is not listed here.
 * An empty face is the one state worth warning about, since a rectangle with no decals and no text is a bare background that says nothing.
 */
export function rectangleDraftWarnings(draft: RectangleDraft, hasBackReference: boolean): RectangleWarning[] {
  const warnings: RectangleWarning[] = [];
  if (draft.front.decals.length === 0 && draft.front.texts.length === 0) {
    warnings.push({ source: 'Front', missing: 'any decal or text', chapter: 'front-text' });
  }
  if (draft.back.mode === 'reference' && !hasBackReference) {
    warnings.push({ source: 'Identity', missing: 'a back token', chapter: 'identity' });
  }
  return warnings;
}

/* No padding here: ConnectedTabs' panel shell owns the panel inset. */
const panel = (children: ReactNode) => <Stack gap="lg">{children}</Stack>;

/**
 * The enhance token workbench.
 *
 * It is its own component rather than a branch inside `TokenEditor` because the two share only their backside rules.
 * A disc token's face is a symbol in a fixed slot with curved labels, and fits one chapter;
 * a rectangle's face is a free composition and takes three, so one editor would be two editors wearing one name.
 */
export function RectangleTokenEditor({
  draft,
  patch,
  chapter,
  onChapterChange,
  onSettle,
  backPicker,
  backProof,
}: {
  draft: RectangleDraft;
  patch: (update: Partial<RectangleDraft>) => void;
  chapter: RectangleChapter;
  onChapterChange: (chapter: RectangleChapter) => void;
  onSettle: () => void;
  /** Chooses which existing rectangle serves as the back. Rendered in Identity only while the mode is `reference`. */
  backPicker: (disabled: boolean) => ReactNode;
  /** The referenced token's front, drawn in the rail in place of an authored back. */
  backProof: ReactNode;
}) {
  const patchFace = (key: 'front' | 'back'): FacePatch =>
    key === 'front'
      ? (update) => patch({ front: { ...draft.front, ...update } })
      : (update) =>
          draft.back.mode === 'custom'
            ? patch({ back: { mode: 'custom', face: { ...draft.back.face, ...update } } })
            : undefined;

  const faceChapters = (key: 'front' | 'back', label: string, face: RectangleFaceDraft, facePatch: FacePatch) => [
    {
      value: key as RectangleChapter,
      label,
      icon: <RectangleHorizontal size={21} aria-hidden />,
      panel: panel(<SurfaceFields face={face} patch={facePatch} />),
    },
    {
      value: `${key}-decals` as RectangleChapter,
      label: `${label} decals`,
      icon: <TopicIcon topic="decals" size={21} />,
      panel: panel(<DecalsFields face={face} patch={facePatch} />),
    },
    {
      value: `${key}-text` as RectangleChapter,
      label: `${label} text`,
      icon: <Type size={21} aria-hidden />,
      panel: panel(<TextsFields face={face} patch={facePatch} />),
    },
  ];

  const items = [
    {
      value: 'identity' as RectangleChapter,
      label: 'Identity',
      icon: <TopicIcon topic="identity" size={21} />,
      panel: panel(
        <>
          <ControlBlock
            title="Name"
            description="Determines the token's URL."
            input={
              <TextInput
                aria-label="Name"
                value={draft.name}
                onChange={(event) => patch({ name: event.currentTarget.value })}
              />
            }
          />
          <ControlBlock
            title="Backside"
            description="Every token has one. Author it here, or point at an enhance token that already exists."
            input={
              <Stack gap="sm">
                <Switch
                  aria-label="Custom"
                  label="Custom"
                  checked={draft.back.mode === 'custom'}
                  onChange={(event) =>
                    patch({
                      back: event.currentTarget.checked
                        ? { mode: 'custom', face: draft.back.mode === 'custom' ? draft.back.face : INITIAL_FACE }
                        : { mode: 'reference' },
                    })
                  }
                />
                {/* Always present, inert while the back is authored here: the alternative stays visible instead of the control disappearing under the toggle. */}
                {backPicker(draft.back.mode === 'custom')}
              </Stack>
            }
          />
        </>
      ),
    },
    ...faceChapters('front', 'Front', draft.front, patchFace('front')),
    ...(draft.back.mode === 'custom' ? faceChapters('back', 'Back', draft.back.face, patchFace('back')) : []),
  ];

  /* Switching to a referenced back removes three tabs, so a selection sitting on one of them has to fall back. */
  const activeChapter = items.some((item) => item.value === chapter) ? chapter : 'identity';

  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(17rem, 21rem)', alignItems: 'start' }}
      onBlurCapture={onSettle}
    >
      <ConnectedTabs<RectangleChapter>
        value={activeChapter}
        onValueChange={(next) => {
          onChapterChange(next);
          onSettle();
        }}
        ariaLabel="Enhance token chapters"
        items={items}
      />
      <div style={{ minWidth: 0, paddingLeft: 'var(--mantine-spacing-md)' }}>
        <div style={{ position: 'sticky', top: 96 }}>
          {/* The face stacks take the full width, or a centred flex child shrinks to its content and `CanvasScale` has nothing to fill. */}
          <Stack gap="md" align="center">
            <Stack gap={4} align="center" w="100%">
              <CanvasScale canvasWidth={PROOF_CANVAS} canvasHeight={PROOF_CANVAS * assetFaceAspect('token-enhance')}>
                <RectangleProof face={draft.front} width={PROOF_CANVAS} />
              </CanvasScale>
              <Text size="xs" c="dimmed">
                Front
              </Text>
            </Stack>
            {draft.back.mode === 'custom' ? (
              <Stack gap={4} align="center" w="100%">
                <CanvasScale canvasWidth={PROOF_CANVAS} canvasHeight={PROOF_CANVAS * assetFaceAspect('token-enhance')}>
                  <RectangleProof face={draft.back.face} width={PROOF_CANVAS} />
                </CanvasScale>
                <Text size="xs" c="dimmed">
                  Back
                </Text>
              </Stack>
            ) : (
              backProof
            )}
          </Stack>
        </div>
      </div>
    </div>
  );
}
