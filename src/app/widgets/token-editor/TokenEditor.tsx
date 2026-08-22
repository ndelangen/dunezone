import { Group, Slider, Stack, Switch, Text, TextInput } from '@mantine/core';
import type { TokenAsset } from '@shared/assets/schema';
import { TopicIcon } from '@ui/content/TopicIcon';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import { PreviewChoice } from '@ui/control/PreviewChoice';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Frame } from 'lucide-react';
import { useRef } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { aboutChapter } from '@app/widgets/asset-about/AboutChapter';
import { assetFaceAspect } from '@app/widgets/asset-face/AssetFace';
import { TokenFrame, tokenShapeOfType } from '@app/widgets/asset-face/AssetFace';
import { BackgroundPresetControl } from '@app/widgets/background-composer/BackgroundPresetControl';
import {
  assetOptionToPreviewSrc,
  decalAssetOptionToLabel,
  decalAssetOptions,
} from '@app/widgets/faction-editor/factionFormAssetUtils';
import { CustomToken } from '@game/assets/token/Custom';
import { backgroundPresets } from '@game/data/backgrounds';

/**
 * The size the rail's proof is drawn at before `CanvasScale` fits it to the rail.
 * Any number does.
 * This one matches the detail page, so a proof and the page it previews scale off the same canvas.
 */
const PROOF_CANVAS = 900;

/** The draft is the stored shape: the same Zod validates it server-side, so a UI-only field here would fail the save. */
/**
 * The draft is the stored shape, with one widening: a reference carries `asset_id: string | null`.
 *
 * Choosing the reference tile necessarily precedes picking the token, so the editor has to hold a reference that has not chosen its target yet.
 * Storage stays strict and never sees the null: the route refuses that save in words rather than letting Zod reject it, the same shape the deck uses.
 * Before this the state was inferred from route-held server state, so the widget needed the route to whisper what it already knew, and the two could disagree.
 */
export type TokenDraft = Omit<z.infer<typeof TokenAsset>, 'back'> & {
  back:
    | Extract<z.infer<typeof TokenAsset>['back'], { mode: 'custom' | 'same' }>
    | { mode: 'reference'; asset_id: string | null };
};
export type TokenFaceDraft = TokenDraft['front'];
/**
 * A token's chapters.
 * Each face contributes two: composing its artwork, and the rim it is edged and lettered with.
 * The back pair exists only while the backside is authored here.
 */
export type TokenChapter = 'identity' | 'front' | 'front-rim' | 'back' | 'back-rim' | 'about';

/* The four stock token looks, drawn from the same named backgrounds a card head uses so the editors share a vocabulary. */
const FACE_PRESETS = [
  { key: 'weapon', label: 'Weapon', background: backgroundPresets.weapon },
  { key: 'defense', label: 'Defense', background: backgroundPresets.defense },
  { key: 'special', label: 'Special', background: backgroundPresets.special },
  { key: 'worthless', label: 'Worthless', background: backgroundPresets.worthless },
];

const symbolOptions = decalAssetOptions.map((value) => ({ value, label: decalAssetOptionToLabel(value) }));

const INITIAL_FACE: TokenFaceDraft = {
  image: '/vector/icon/projectile.svg',
  background: {
    image: '/image/texture/015.jpg',
    colors: ['#4B4C0D', '#262B04'],
    invert: true,
    definition: 0,
    influence: 0.5,
  },
  symbolScale: 1,
  top: '',
  bottomFirst: '',
  bottomSecond: '',
  ring: true,
};

/**
 * A fresh token, per shape.
 *
 * Only the edge ring varies, and only for tech tokens: a gear already reads as edged by its teeth, so a ring inside them is clutter rather than a rim (Norbert, 2026-08-20).
 * A function rather than a constant because the default is a fact about the shape, and the shape is the Asset type, which only the page knows.
 */
/** The seed for any newly authored face, ringed by shape: a gear's teeth are its rim, so it starts bare. */
function initialTokenFace(type: string): TokenFaceDraft {
  return { ...INITIAL_FACE, ring: type !== 'token-tech' };
}

export function initialTokenDraft(type: string): TokenDraft {
  const face = initialTokenFace(type);
  return { name: '', about: '', front: face, back: { mode: 'custom', face } };
}

/**
 * The renderer takes one `bottom` string and splits it on a newline;
 * the editor keeps the two lines apart so no field has to defend against a newline typed into it.
 */
function bottomFor(face: TokenFaceDraft): string {
  return `${face.bottomFirst}\n${face.bottomSecond}`;
}

/** One face at whatever width it is given, clipped to its shape by the same frame the catalogue surfaces use. */
export function TokenProof({ face, type, width }: { face: TokenFaceDraft; type: string; width: number }) {
  const shape = tokenShapeOfType(type) ?? 'round';
  return (
    <TokenFrame shape={shape} width={width}>
      <CustomToken
        background={face.background}
        image={face.image}
        circle={face.ring}
        circleShadow={face.ringShadow ?? false}
        top={face.top || undefined}
        bottom={face.bottomFirst || face.bottomSecond ? bottomFor(face) : undefined}
        /* The renderer centres the symbol in a 300-unit box, so scale is expressed against its reference size. */
        size={{ width: 100 * face.symbolScale, height: 100 * face.symbolScale }}
      />
    </TokenFrame>
  );
}

type FacePatch = (update: Partial<TokenFaceDraft>) => void;

/** Both faces are authored identically, so there is one component and the chapter decides which face it edits. */
function FaceFields({ face, patch }: { face: TokenFaceDraft; patch: FacePatch }) {
  return (
    <>
      <BackgroundPresetControl
        title="Background"
        description="The disc behind the symbol."
        usedOn="this face"
        presets={FACE_PRESETS}
        value={face.background}
        onChange={(background) => patch({ background })}
      />
      <ControlBlock
        title="Symbol"
        description="The vector at the centre of the face."
        input={
          <AssetSelect
            aria-label="Symbol"
            allowDeselect={false}
            limit={30}
            data={symbolOptions}
            getPreviewSrc={assetOptionToPreviewSrc}
            glyphPreviews
            value={face.image}
            onChange={(next) => {
              if (next) {
                patch({ image: next as TokenFaceDraft['image'] });
              }
            }}
          />
        }
      />
      <ControlBlock
        title="Symbol scale"
        description="Against the renderer's reference size."
        input={
          <Slider
            aria-label="Symbol scale"
            min={0.5}
            max={2}
            step={0.05}
            label={(value) => `${value.toFixed(2)}x`}
            value={face.symbolScale}
            onChange={(symbolScale) => patch({ symbolScale })}
          />
        }
      />
    </>
  );
}

/**
 * The rim of one face: the ring just inside the edge, and the lines that curve along it.
 *
 * Its own chapter rather than the tail of the face, because the ring and the labels are one thing
 * (the labels curve along the ring) and neither is part of composing the face's artwork (Norbert, 2026-08-20).
 */
function FaceRim({ face, patch }: { face: TokenFaceDraft; patch: FacePatch }) {
  return (
    <>
      <ControlBlock
        title="Edge ring"
        description="The thin ring just inside the edge."
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
      <ControlBlock
        title="Labels"
        description="One curved line along the top, two along the bottom."
        input={
          <Stack gap="sm">
            <TextInput label="Top label" value={face.top} onChange={(e) => patch({ top: e.currentTarget.value })} />
            <Group grow>
              <TextInput
                label="Bottom line 1"
                value={face.bottomFirst}
                onChange={(e) => patch({ bottomFirst: e.currentTarget.value })}
              />
              <TextInput
                label="Bottom line 2"
                value={face.bottomSecond}
                onChange={(e) => patch({ bottomSecond: e.currentTarget.value })}
              />
            </Group>
          </Stack>
        }
      />
    </>
  );
}

export type TokenWarning = { source: string; missing: string; chapter: TokenChapter };

/**
 * What is incomplete rather than invalid.
 * A blank name blocks the save outright, so it is not listed here;
 * these are the fields a token can be saved without and probably should not be.
 */
export function tokenDraftWarnings(draft: TokenDraft): TokenWarning[] {
  const warnings: TokenWarning[] = [];
  if (!draft.front.top.trim() && !draft.front.bottomFirst.trim() && !draft.front.bottomSecond.trim()) {
    warnings.push({ source: 'Front rim', missing: 'any label', chapter: 'front-rim' });
  }
  if (draft.back.mode === 'reference' && draft.back.asset_id === null) {
    warnings.push({ source: 'Identity', missing: 'a back token', chapter: 'identity' });
  }
  return warnings;
}

/* No padding here: ConnectedTabs' panel shell owns the panel inset. */
const panel = (children: ReactNode) => <Stack gap="lg">{children}</Stack>;

/**
 * The token workbench, installed identically by the create and edit pages for all three shapes.
 *
 * Shape is the Asset type rather than a field, so this component differs per shape only in how the proof is clipped.
 * The Back chapter exists only while the backside is authored here;
 * a referenced back is another token's front and has nothing to edit.
 */
/**
 * The back a chosen mode becomes, restoring the composition the author last had.
 *
 * Storage is strict and the draft remembers («The stored shape of three back modes», section 2): a saved row holds exactly one mode with exactly that mode's fields, but while editing you can switch away from a composed back and return to find it in the shape you left it.
 * The memory is component state rather than draft state because the stored union has nowhere to keep it, which is the whole point of storage being strict.
 */
function backForMode(
  mode: TokenDraft['back']['mode'],
  draft: TokenDraft,
  type: string,
  remembered: TokenFaceDraft | null,
  rememberedTarget: string | null
): TokenDraft['back'] {
  switch (mode) {
    case 'custom':
      return {
        mode: 'custom',
        face: draft.back.mode === 'custom' ? draft.back.face : (remembered ?? initialTokenFace(type)),
      };
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

export function TokenEditor({
  nameField,
  draft,
  patch,
  type,
  chapter,
  onChapterChange,
  onSettle,
  backPicker,
  backProof,
}: {
  draft: TokenDraft;
  /** The Name field, constructed by the route: checking a name's address is a fetch, and fetching controls are Pickers the routes own. */
  nameField: ReactNode;
  patch: (update: Partial<TokenDraft>) => void;
  /** The Asset type, which fixes the shape of every proof on this page. */
  type: string;
  chapter: TokenChapter;
  onChapterChange: (chapter: TokenChapter) => void;
  onSettle: () => void;
  /**
   * Chooses which existing token serves as the back, rendered in Identity and disabled while the back is authored here.
   * A function of that disabled state rather than a node, so the rule lives here and the organ still renders a properly disabled control rather than an inert-looking one.
   */
  backPicker: (disabled: boolean) => ReactNode;
  /**
   * The referenced token's **back**, drawn on the reference tile and in the rail in place of an authored one.
   * Its back, never its front, per «A referenced back shows the other token's back, never its front».
   */
  backProof: ReactNode;
}) {
  /* The composition the author last had, kept across mode flips; the stored union cannot hold it. */
  const composedFace = useRef<TokenFaceDraft | null>(draft.back.mode === 'custom' ? draft.back.face : null);
  /* The target the author last picked, kept across mode flips for the same reason the face is. */
  const referencedTarget = useRef<string | null>(
    draft.back.mode === 'reference' ? (draft.back.asset_id ?? null) : null
  );

  const patchFace = (key: 'front' | 'back'): FacePatch =>
    key === 'front'
      ? (update) => patch({ front: { ...draft.front, ...update } })
      : (update) =>
          draft.back.mode === 'custom'
            ? patch({ back: { mode: 'custom', face: { ...draft.back.face, ...update } } })
            : undefined;

  const items = [
    {
      value: 'identity' as const,
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
                aspectRatio={String(1 / assetFaceAspect(type))}
                onChange={(mode) => {
                  /* Captured on the way out, so returning to Composed finds the face as it was left. */
                  if (draft.back.mode === 'custom') {
                    composedFace.current = draft.back.face;
                  }
                  if (draft.back.mode === 'reference' && draft.back.asset_id) {
                    referencedTarget.current = draft.back.asset_id;
                  }
                  patch({ back: backForMode(mode, draft, type, composedFace.current, referencedTarget.current) });
                }}
                options={[
                  {
                    value: 'custom',
                    label: 'Composed here',
                    /* Always drawable, the deck's stock tile's rule: the composed face, the one the author left behind, or the composer's own starting point. Never a dashed nothing (Norbert, 2026-08-21). */
                    preview: (
                      <TokenProof
                        face={
                          draft.back.mode === 'custom'
                            ? draft.back.face
                            : (composedFace.current ?? initialTokenFace(type))
                        }
                        type={type}
                        width={PROOF_CANVAS}
                      />
                    ),
                    canvas: { width: PROOF_CANVAS, height: PROOF_CANVAS * assetFaceAspect(type) },
                  },
                  {
                    value: 'same',
                    label: 'Same as front',
                    preview: <TokenProof face={draft.front} type={type} width={PROOF_CANVAS} />,
                    canvas: { width: PROOF_CANVAS, height: PROOF_CANVAS * assetFaceAspect(type) },
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
    {
      value: 'front' as const,
      label: 'Front face',
      icon: <TopicIcon topic="face" size={21} />,
      panel: panel(<FaceFields face={draft.front} patch={patchFace('front')} />),
    },
    {
      value: 'front-rim' as const,
      label: 'Front rim',
      icon: <Frame size={21} aria-hidden />,
      panel: panel(<FaceRim face={draft.front} patch={patchFace('front')} />),
    },
    ...(draft.back.mode === 'custom'
      ? [
          {
            value: 'back' as const,
            label: 'Back face',
            icon: <TopicIcon topic="face" size={21} />,
            panel: panel(<FaceFields face={draft.back.face} patch={patchFace('back')} />),
          },
          {
            value: 'back-rim' as const,
            label: 'Back rim',
            icon: <Frame size={21} aria-hidden />,
            panel: panel(<FaceRim face={draft.back.face} patch={patchFace('back')} />),
          },
        ]
      : []),
    aboutChapter(draft.about, (about) => patch({ about })),
  ];

  /* Switching to a referenced back removes the Back tab, so a selection sitting on it has to fall back. */
  const activeChapter = items.some((item) => item.value === chapter) ? chapter : 'identity';

  return (
    <WorkbenchLayout.Workbench onBlurCapture={onSettle}>
      <WorkbenchLayout.Chapters>
        <ConnectedTabs<TokenChapter>
          value={activeChapter}
          onValueChange={(next) => {
            onChapterChange(next);
            onSettle();
          }}
          ariaLabel="Token chapters"
          items={items}
        />
      </WorkbenchLayout.Chapters>
      <WorkbenchLayout.Rail>
        <Stack gap="md" align="center">
          <Stack gap={4} align="center" w="100%">
            <CanvasScale rounded canvasWidth={PROOF_CANVAS} canvasHeight={PROOF_CANVAS * assetFaceAspect(type)}>
              <TokenProof face={draft.front} type={type} width={PROOF_CANVAS} />
            </CanvasScale>
            <Text size="xs" c="dimmed">
              Front
            </Text>
          </Stack>
          {draft.back.mode === 'custom' ? (
            <Stack gap={4} align="center" w="100%">
              <CanvasScale rounded canvasWidth={PROOF_CANVAS} canvasHeight={PROOF_CANVAS * assetFaceAspect(type)}>
                <TokenProof face={draft.back.face} type={type} width={PROOF_CANVAS} />
              </CanvasScale>
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
