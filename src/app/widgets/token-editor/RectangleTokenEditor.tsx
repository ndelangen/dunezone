import { Alert, Divider, Group, NumberInput, Select, Slider, Stack, Switch, Text, Textarea } from '@mantine/core';
import { RECTANGLE_TOKEN_FONTS } from '@shared/assets/schema';
import type { RectangleTokenAsset } from '@shared/assets/schema';
import { TopicIcon } from '@ui/content/TopicIcon';
import { ControlBlock } from '@ui/control/ControlBlock';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { PreviewChoice } from '@ui/control/PreviewChoice';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { aboutChapter } from '@app/widgets/asset-about/AboutChapter';
import { assetFaceAspect, TokenFrame } from '@app/widgets/asset-face/AssetFace';
import { BackgroundPresetControl } from '@app/widgets/background-composer/BackgroundPresetControl';
import { DecalControls } from '@app/widgets/decal-editor/DecalControls';
import { decalAssetOptions } from '@app/widgets/faction-editor/factionFormAssetUtils';
import { RectangleToken } from '@game/assets/token/Rectangle';
import { backgroundPresets } from '@game/data/backgrounds';

/**
 * The box a backside tile draws its proof inside, which `PreviewChoice` contain-fits to the tile.
 * Any number does.
 * This one matches the detail page, so a tile and the page it previews scale off the same canvas.
 * The rail's own proofs no longer need it: they fill the rail and hold their own ratio.
 */
const PROOF_CANVAS = 900;

/**
 * The draft is the stored shape, with one widening: a reference carries `asset_id: string | null`.
 *
 * Choosing the reference tile necessarily precedes picking the token, so the editor has to hold a reference that has not chosen its target yet.
 * Storage stays strict and never sees the null: the route refuses that save in words rather than letting Zod reject it, the same shape the deck uses.
 * Before this the state was inferred from route-held server state, so the widget needed the route to whisper what it already knew, and the two could disagree.
 */
export type RectangleDraft = Omit<z.infer<typeof RectangleTokenAsset>, 'back'> & {
  back:
    | Extract<z.infer<typeof RectangleTokenAsset>['back'], { mode: 'custom' | 'same' }>
    | { mode: 'reference'; asset_id: string | null };
};
export type RectangleFaceDraft = RectangleDraft['front'];
export type RectangleChapter =
  | 'identity'
  | 'about'
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

/** One face filling the box it is put in, clipped by the same frame the catalogue surfaces use. */
export function RectangleProof({ face }: { face: RectangleFaceDraft }) {
  return (
    <TokenFrame shape="rectangle">
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

function SurfaceFields({
  face,
  patch,
  declaredCustom,
  onDeclaredCustomChange,
}: {
  face: RectangleFaceDraft;
  patch: FacePatch;
  declaredCustom: boolean;
  onDeclaredCustomChange: (next: boolean) => void;
}) {
  return (
    <Stack gap="lg">
      {/*
       * The same control the round editor uses, rather than the bare picker this once reached for.
       * The bare picker offers a Custom tile with nothing behind it: choosing it found no preset and
       * patched nothing, so the option sat there dead. `BackgroundPresetControl` owns the composer
       * that Custom is supposed to open, and the two token editors now compose a background the same way.
       */}
      <BackgroundPresetControl
        title="Background"
        description="Behind the whole face."
        usedOn="this token's face"
        presets={BACKGROUND_PRESETS}
        value={face.background}
        declaredCustom={declaredCustom}
        onDeclaredCustomChange={onDeclaredCustomChange}
        onChange={(background) => patch({ background })}
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
      <ControlBlock
        title="Ring shadow"
        description="A pronounced shadow under the ring. Needs the ring."
        input={
          <Switch
            aria-label="Ring shadow"
            checked={face.ringShadow ?? false}
            disabled={!face.ring}
            onChange={(event) => patch({ ringShadow: event.currentTarget.checked })}
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
                /* `DecalControls` speaks the shared `Decal` contract, which has neither opacity nor shadow, so this type's own fields are carried across the edit rather than lost. */
                decals: face.decals.map((current, position) =>
                  position === index ? { ...next, opacity: current.opacity, shadow: current.shadow } : current
                ),
              })
            }
            label={`decal ${index + 1}`}
            offsetRange={[FACE_WIDTH, FACE_HEIGHT]}
          />
          {/* Beside `DecalControls` rather than inside it, the same seam Opacity uses: the shared contract stays narrow. */}
          <ControlBlock
            title="Shadow"
            description="A drop shadow under the decal, the ring shadow's twin."
            input={
              <Switch
                aria-label={`Shadow for decal ${index + 1}`}
                checked={decal.shadow ?? false}
                onChange={(event) =>
                  patch({
                    decals: face.decals.map((current, position) =>
                      position === index ? { ...current, shadow: event.currentTarget.checked } : current
                    ),
                  })
                }
              />
            }
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
export function rectangleDraftWarnings(draft: RectangleDraft): RectangleWarning[] {
  const warnings: RectangleWarning[] = [];
  if (draft.front.decals.length === 0 && draft.front.texts.length === 0) {
    warnings.push({ source: 'Front', missing: 'any decal or text', chapter: 'front-text' });
  }
  if (draft.back.mode === 'reference' && draft.back.asset_id === null) {
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
/**
 * The back a chosen mode becomes, restoring the composition the author last had.
 *
 * The rectangle twin of the round editor's helper, and it keeps the same promise: storage is strict and the draft remembers («The stored shape of three back modes», section 2).
 * Switch away from a composed back and return, and it is in the shape you left it;
 * only saving collapses to one truth.
 */
function backForMode(
  mode: RectangleDraft['back']['mode'],
  draft: RectangleDraft,
  remembered: RectangleFaceDraft | null,
  rememberedTarget: string | null
): RectangleDraft['back'] {
  switch (mode) {
    case 'custom':
      return { mode: 'custom', face: draft.back.mode === 'custom' ? draft.back.face : (remembered ?? INITIAL_FACE) };
    case 'same':
      return { mode: 'same' };
    case 'reference':
      if (draft.back.mode === 'reference') {
        return draft.back;
      }
      /* The pick survives the flip too: the display never stopped showing it, so the save must not disagree. */
      return { mode: 'reference', asset_id: rememberedTarget };
  }
}

/**
 * What this editor's session needs and a stored token has no room for, the rectangle twin of `TokenMemory`.
 *
 * The face and the target the author last had, kept across mode flips, plus the declared Custom intent for the background control.
 * In the route's reducer rather than in refs here, so a Reset discards them with the draft (D3's first unlocked finding on «Work the editors wave»).
 */
export type RectangleMemory = {
  composedFace: RectangleFaceDraft | null;
  referencedTarget: string | null;
  /**
   * One declared Custom intent per background control, and there are two: the front face's and the back's.
   * `SurfaceFields` is one component serving both faces, so a single bit here would let a declaration on one face open the composer on the other.
   */
  backgroundCustom: { front: boolean; back: boolean };
};

export function initialRectangleMemory(back: RectangleDraft['back']): RectangleMemory {
  return {
    composedFace: back.mode === 'custom' ? back.face : null,
    referencedTarget: back.mode === 'reference' ? (back.asset_id ?? null) : null,
    backgroundCustom: { front: false, back: false },
  };
}

export function RectangleTokenEditor({
  nameField,
  draft,
  patch,
  memory,
  remember,
  chapter,
  onChapterChange,
  onSettle,
  backPicker,
  backProof,
}: {
  draft: RectangleDraft;
  /** The session's memory and its setter, the same value plus onChange membrane the draft crosses on. */
  memory: RectangleMemory;
  remember: (update: Partial<RectangleMemory>) => void;
  /** The Name field, constructed by the route: checking a name's address is a fetch, and fetching controls are Pickers the routes own. */
  nameField: ReactNode;
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
      icon: <TopicIcon topic="face" size={21} />,
      panel: panel(
        <SurfaceFields
          face={face}
          patch={facePatch}
          declaredCustom={memory.backgroundCustom[key]}
          onDeclaredCustomChange={(next) => remember({ backgroundCustom: { ...memory.backgroundCustom, [key]: next } })}
        />
      ),
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
      icon: <TopicIcon topic="text" size={21} />,
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
          <ControlBlock title="Name" description="Determines the token's URL." input={nameField} />
          <ControlBlock
            title="Backside"
            description="Every token has one. Compose it, print the front on both sides, or wear another token's back."
            input={
              <PreviewChoice
                label="Backside"
                value={draft.back.mode}
                aspectRatio={String(1 / assetFaceAspect('token-enhance'))}
                onChange={(mode) => {
                  /* Captured on the way out, so returning to Composed finds the face as it was left. */
                  const keptFace = draft.back.mode === 'custom' ? draft.back.face : memory.composedFace;
                  const keptTarget =
                    draft.back.mode === 'reference' && draft.back.asset_id
                      ? draft.back.asset_id
                      : memory.referencedTarget;
                  remember({ composedFace: keptFace, referencedTarget: keptTarget });
                  patch({ back: backForMode(mode, draft, keptFace, keptTarget) });
                }}
                options={[
                  {
                    value: 'custom',
                    label: 'Composed here',
                    /* Always drawable, the deck's stock tile's rule: the composed face, the one the author left behind, or the composer's own starting point. Never a dashed nothing (Norbert, 2026-08-21). */
                    preview: (
                      <RectangleProof
                        face={draft.back.mode === 'custom' ? draft.back.face : (memory.composedFace ?? INITIAL_FACE)}
                      />
                    ),
                    canvas: { width: PROOF_CANVAS, height: PROOF_CANVAS * assetFaceAspect('token-enhance') },
                  },
                  {
                    value: 'same',
                    label: 'Same as front',
                    preview: <RectangleProof face={draft.front} />,
                    canvas: { width: PROOF_CANVAS, height: PROOF_CANVAS * assetFaceAspect('token-enhance') },
                  },
                  {
                    value: 'reference',
                    label: "Another token's back",
                    preview: backProof ?? undefined,
                    emptyHint: <Text size="xs">No token chosen</Text>,
                    detail: backPicker(false),
                  },
                ]}
              />
            }
          />
        </>
      ),
    },
    ...faceChapters('front', 'Front', draft.front, patchFace('front')),
    ...(draft.back.mode === 'custom' ? faceChapters('back', 'Back', draft.back.face, patchFace('back')) : []),
    /*
     * This editor was the only one of five with no About chapter, while `INITIAL_RECTANGLE_DRAFT` has carried
     * `about: ''` since «Assets gain an About field», so the prose was stored and unreachable (found 2026-08-20).
     */
    aboutChapter(draft.about, (about) => patch({ about })),
  ];

  /* Switching to a referenced back removes three tabs, so a selection sitting on one of them has to fall back. */
  const activeChapter = items.some((item) => item.value === chapter) ? chapter : 'identity';

  return (
    <WorkbenchLayout.Workbench>
      <WorkbenchLayout.Chapters>
        {/* Settling on focus leaving the fields is the editors' idiom, not the layout's, so it rides an element this widget owns. */}
        <div onBlurCapture={onSettle}>
          <ConnectedTabs<RectangleChapter>
            value={activeChapter}
            onValueChange={(next) => {
              onChapterChange(next);
              onSettle();
            }}
            ariaLabel="Enhance token chapters"
            items={items}
          />
        </div>
      </WorkbenchLayout.Chapters>
      <WorkbenchLayout.Rail>
        {/* The face stacks take the full width, or a centred flex child shrinks to its content and the proof, which fills the width it is given, is given none. */}
        <Stack gap="md" align="center">
          <Stack gap={4} align="center" w="100%">
            <RectangleProof face={draft.front} />
            <Text size="xs" c="dimmed">
              Front
            </Text>
          </Stack>
          {draft.back.mode === 'custom' ? (
            <Stack gap={4} align="center" w="100%">
              <RectangleProof face={draft.back.face} />
              <Text size="xs" c="dimmed">
                Back
              </Text>
            </Stack>
          ) : (
            backProof
          )}
        </Stack>
      </WorkbenchLayout.Rail>
    </WorkbenchLayout.Workbench>
  );
}
