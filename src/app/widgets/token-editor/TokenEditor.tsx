import { Group, SegmentedControl, Slider, Stack, Switch, Text, TextInput } from '@mantine/core';
import type { TokenAsset } from '@shared/assets/schema';
import { TopicIcon } from '@ui/content/TopicIcon';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Coins, FlipHorizontal2 } from 'lucide-react';
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
export type TokenDraft = z.infer<typeof TokenAsset>;
export type TokenFaceDraft = TokenDraft['front'];
export type TokenChapter = 'identity' | 'front' | 'back' | 'about';

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
export function initialTokenDraft(type: string): TokenDraft {
  const face = { ...INITIAL_FACE, ring: type !== 'token-tech' };
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
export function tokenDraftWarnings(draft: TokenDraft, hasBackReference: boolean): TokenWarning[] {
  const warnings: TokenWarning[] = [];
  if (!draft.front.top.trim() && !draft.front.bottomFirst.trim() && !draft.front.bottomSecond.trim()) {
    warnings.push({ source: 'Front', missing: 'any label', chapter: 'front' });
  }
  if (draft.back.mode === 'reference' && !hasBackReference) {
    warnings.push({ source: 'Identity', missing: 'a back token', chapter: 'identity' });
  }
  return warnings;
}

/* No padding here: ConnectedTabs' panel shell owns the panel inset. */
const panel = (children: ReactNode) => <Stack gap="lg">{children}</Stack>;

/**
 * The tech token workbench, installed identically by the create and edit pages for all three shapes.
 *
 * Shape is the Asset type rather than a field, so this component differs per shape only in how the proof is clipped.
 * The Back chapter exists only while the backside is authored here;
 * a referenced back is another token's front and has nothing to edit.
 */
export function TokenEditor({
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
  patch: (update: Partial<TokenDraft>) => void;
  /** The Asset type, which fixes the shape of every proof on this page. */
  type: string;
  chapter: TokenChapter;
  onChapterChange: (chapter: TokenChapter) => void;
  onSettle: () => void;
  /** Chooses which existing token serves as the back. Rendered in Identity only while the mode is `reference`. */
  backPicker: ReactNode;
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

  const items = [
    {
      value: 'identity' as const,
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
            description="Every token has one. Author it here, or point at a token that already exists."
            input={
              <Stack gap="sm">
                <SegmentedControl
                  fullWidth
                  aria-label="Backside"
                  value={draft.back.mode}
                  data={[
                    { value: 'custom', label: 'Custom back' },
                    { value: 'reference', label: 'Existing token' },
                  ]}
                  onChange={(value) =>
                    patch({
                      back:
                        value === 'custom'
                          ? { mode: 'custom', face: draft.back.mode === 'custom' ? draft.back.face : INITIAL_FACE }
                          : { mode: 'reference' },
                    })
                  }
                />
                {draft.back.mode === 'reference' ? backPicker : null}
              </Stack>
            }
          />
        </>
      ),
    },
    {
      value: 'front' as const,
      label: 'Front',
      icon: <Coins size={21} aria-hidden />,
      panel: panel(<FaceFields face={draft.front} patch={patchFace('front')} />),
    },
    ...(draft.back.mode === 'custom'
      ? [
          {
            value: 'back' as const,
            label: 'Back',
            icon: <FlipHorizontal2 size={21} aria-hidden />,
            panel: panel(<FaceFields face={draft.back.face} patch={patchFace('back')} />),
          },
        ]
      : []),
    aboutChapter(draft.about, (about) => patch({ about })),
  ];

  /* Switching to a referenced back removes the Back tab, so a selection sitting on it has to fall back. */
  const activeChapter = items.some((item) => item.value === chapter) ? chapter : 'identity';

  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(17rem, 21rem)', alignItems: 'start' }}
      onBlurCapture={onSettle}
    >
      <ConnectedTabs<TokenChapter>
        value={activeChapter}
        onValueChange={(next) => {
          onChapterChange(next);
          onSettle();
        }}
        ariaLabel="Token chapters"
        items={items}
      />
      <div style={{ minWidth: 0, paddingLeft: 'var(--mantine-spacing-md)' }}>
        <div style={{ position: 'sticky', top: 96 }}>
          {/* The face stacks take the full width, or a centred flex child shrinks to its content and `CanvasScale` has nothing to fill. */}
          <Stack gap="md" align="center">
            <Stack gap={4} align="center" w="100%">
              <CanvasScale canvasWidth={PROOF_CANVAS} canvasHeight={PROOF_CANVAS * assetFaceAspect(type)}>
                <TokenProof face={draft.front} type={type} width={PROOF_CANVAS} />
              </CanvasScale>
              <Text size="xs" c="dimmed">
                Front
              </Text>
            </Stack>
            {draft.back.mode === 'custom' ? (
              <Stack gap={4} align="center" w="100%">
                <CanvasScale canvasWidth={PROOF_CANVAS} canvasHeight={PROOF_CANVAS * assetFaceAspect(type)}>
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
        </div>
      </div>
    </div>
  );
}
