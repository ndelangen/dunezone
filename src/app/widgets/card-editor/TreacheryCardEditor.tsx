import {
  Alert,
  Divider,
  Grid,
  Group,
  NumberInput,
  Slider,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { TopicIcon } from '@ui/content/TopicIcon';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { ScrollText, Stamp } from 'lucide-react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { aboutChapter } from '@app/widgets/asset-about/AboutChapter';
import { BackgroundPresetControl, sameBackground } from '@app/widgets/background-composer/BackgroundPresetControl';
import { DecalControls } from '@app/widgets/decal-editor/DecalControls';
import {
  assetOptionToPreviewSrc,
  decalAssetOptions,
  decalAssetOptionToLabel,
} from '@app/widgets/faction-editor/factionFormAssetUtils';
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { backgroundPresets } from '@game/data/backgrounds';
import type { TreacheryAsset } from '@game/data/objects';
import { card as CARD_SIZE } from '@game/data/sizes';

import styles from './TreacheryCardEditor.module.css';

/* The icon draws from the same full vector pool the decals do — the schema's ALL union, not just the icon set. */
const iconOptions = decalAssetOptions.map((value) => ({ value, label: decalAssetOptionToLabel(value) }));

/* ------------------------------ draft model ------------------------------ */
/* The draft IS the stored shape: the same TreacheryAsset zod validates on save (server-side
   in assets.create/update) and drives the renderer live. Wider than the renderer's own `Treachery` props by
   exactly one field, About, which is the field that never reaches the face. */

export type TreacheryDraft = z.infer<typeof TreacheryAsset>;

/* The four stock treachery looks: a head Background paired with its striped icon Background. */
const CARD_PRESETS = [
  { key: 'weapon', label: 'Weapon', head: backgroundPresets.weapon, striped: backgroundPresets.stripedWeapon },
  { key: 'defense', label: 'Defense', head: backgroundPresets.defense, striped: backgroundPresets.stripedDefense },
  { key: 'special', label: 'Special', head: backgroundPresets.special, striped: backgroundPresets.stripedSpecial },
  {
    key: 'worthless',
    label: 'Worthless',
    head: backgroundPresets.worthless,
    striped: backgroundPresets.stripedWorthless,
  },
] as const;

export const INITIAL_TREACHERY_DRAFT: TreacheryDraft = {
  name: '',
  about: '',
  subName: '',
  head: backgroundPresets.weapon,
  icon: [backgroundPresets.stripedWeapon, '/vector/icon/projectile.svg'],
  decals: [],
  text: '',
};

/* Field-by-field, not identity or JSON: a head that round-tripped through the database is a clone of its preset with Zod's key order. */

const HEAD_PRESETS = CARD_PRESETS.map(({ key, label, head }) => ({ key, label, background: head }));
const ICON_BACKGROUND_PRESETS = CARD_PRESETS.map(({ key, label, striped }) => ({ key, label, background: striped }));

/* Center-to-edge slider span: the treachery card is 900 × 1263 in card space. */
const DECAL_OFFSET_RANGE = [450, 630] as const;

/* The icon disc is 125 card-space pixels; half a disc of nudge per axis, number inputs unclamped. */
const ICON_OFFSET_RANGE = 60;

/* ------------------------------ rail proof ------------------------------ */

function FillCard({ draft }: { draft: TreacheryDraft }) {
  return (
    <CanvasScale canvasWidth={CARD_SIZE.width} canvasHeight={CARD_SIZE.height} frameClassName={styles.proofFrame}>
      <TreacheryCard {...draft} />
    </CanvasScale>
  );
}

/* ------------------------------ field editors ------------------------------ */

type Patch = (update: Partial<TreacheryDraft>) => void;

/* The card's head: its name, type, and the Background behind them. */
function HeadFields({ draft, patch }: { draft: TreacheryDraft; patch: Patch }) {
  return (
    <Stack gap="md">
      <ControlBlock
        title="Name"
        description="Names the card and determines its URL."
        input={
          <TextInput
            aria-label="Name"
            value={draft.name}
            onChange={(event) => patch({ name: event.currentTarget.value })}
          />
        }
      />
      <ControlBlock
        title="Type"
        description="Shown under the name, e.g. “Weapon - Projectile”."
        input={
          <TextInput
            aria-label="Type"
            value={draft.subName}
            onChange={(event) => patch({ subName: event.currentTarget.value })}
          />
        }
      />
      <BackgroundPresetControl
        title="Head background"
        description="The background behind the card's name. The icon's stripes follow it, unless you have composed your own."
        usedOn="this card's head"
        presets={HEAD_PRESETS}
        value={draft.head}
        onChange={(head, presetKey) => {
          patch({ head, ...matchingStripes(presetKey, draft) });
        }}
      />
    </Stack>
  );
}

/**
 * The icon background a new head preset brings with it, or nothing when the author has composed their own.
 *
 * Picking a head used to rewrite the icon's background unconditionally.
 * That is a convenience while the icon still wears the stripes a previous head gave it, and a silent discard of the author's work the moment it does not, with no undo and no word at the time it happens.
 * It also became repeatable: the tile control is a radio group, so arrowing across the presets would have rewritten the icon at every step (Norbert, 2026-08-21, choosing to fix the coupling rather than stop arrows selecting).
 *
 * So the stripes still follow the head, and only while there is nothing to lose.
 */
function matchingStripes(presetKey: string | null, draft: TreacheryDraft): Pick<TreacheryDraft, 'icon'> | undefined {
  const preset = CARD_PRESETS.find((candidate) => candidate.key === presetKey);
  if (!preset) {
    return undefined;
  }
  const wornHead = CARD_PRESETS.find((candidate) => sameBackground(candidate.head, draft.head));
  const iconIsStillItsStripes = wornHead ? sameBackground(wornHead.striped, draft.icon[0]) : false;
  return iconIsStillItsStripes ? { icon: [preset.striped, draft.icon[1]] } : undefined;
}

/* The card's icon: the vector in the top-right disc, its Background, and its scale. */
function IconFields({ draft, patch }: { draft: TreacheryDraft; patch: Patch }) {
  return (
    <Stack gap="md">
      <ControlBlock
        title="Icon"
        description="The vector in the top-right disc."
        input={
          <AssetSelect
            aria-label="Icon"
            allowDeselect={false}
            limit={30}
            data={iconOptions}
            getPreviewSrc={assetOptionToPreviewSrc}
            glyphPreviews
            value={draft.icon[1]}
            onChange={(value) => {
              if (value) {
                patch({ icon: [draft.icon[0], value as TreacheryDraft['icon'][1]] });
              }
            }}
          />
        }
      />
      <Grid>
        <Grid.Col span={{ base: 12, xs: 6 }}>
          <ControlBlock
            title="Invert"
            description="Flips the icon from dark to light artwork."
            input={
              <Switch
                aria-label="Invert icon"
                checked={draft.iconInvert ?? false}
                onChange={(event) => patch({ iconInvert: event.currentTarget.checked })}
              />
            }
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, xs: 6 }}>
          <ControlBlock
            title="Opacity"
            description="Fades the icon; 1 is fully opaque."
            input={
              <Slider
                aria-label="Icon opacity"
                min={0}
                max={1}
                step={0.05}
                value={draft.iconOpacity ?? 1}
                onChange={(value) => patch({ iconOpacity: value })}
                label={(value) => value.toFixed(2)}
              />
            }
          />
        </Grid.Col>
      </Grid>
      <BackgroundPresetControl
        title="Icon background"
        description="The background behind the icon, independent of the head background."
        usedOn="this card's icon"
        presets={ICON_BACKGROUND_PRESETS}
        value={draft.icon[0]}
        onChange={(background) => patch({ icon: [background, draft.icon[1]] })}
      />
      <ControlBlock
        title="Icon scale"
        description="Resize the icon within its disc; 1 is the reference size."
        tool={
          <NumberInput
            aria-label="Icon scale"
            w={96}
            min={0.5}
            max={2}
            step={0.05}
            decimalScale={2}
            value={draft.iconScale ?? 1}
            onChange={(value) => {
              if (typeof value === 'number') {
                patch({ iconScale: value });
              }
            }}
          />
        }
        input={
          <Slider
            aria-label="Icon scale slider"
            min={0.5}
            max={2}
            step={0.05}
            value={draft.iconScale ?? 1}
            onChange={(value) => patch({ iconScale: value })}
            label={(value) => value.toFixed(2)}
          />
        }
      />
      <Grid>
        <Grid.Col span={{ base: 12, xs: 6 }}>
          <ControlBlock
            title="Horizontal offset"
            description="Move the icon left with a negative value or right with a positive value."
            tool={
              <NumberInput
                aria-label="Horizontal icon offset"
                w={96}
                step={1}
                value={draft.iconOffset?.[0] ?? 0}
                onChange={(value) => {
                  if (typeof value === 'number') {
                    patch({ iconOffset: [value, draft.iconOffset?.[1] ?? 0] });
                  }
                }}
              />
            }
            input={
              <Slider
                aria-label="Horizontal icon offset slider"
                min={-ICON_OFFSET_RANGE}
                max={ICON_OFFSET_RANGE}
                step={1}
                value={draft.iconOffset?.[0] ?? 0}
                onChange={(value) => patch({ iconOffset: [value, draft.iconOffset?.[1] ?? 0] })}
              />
            }
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, xs: 6 }}>
          <ControlBlock
            title="Vertical offset"
            description="Move the icon up with a negative value or down with a positive value."
            tool={
              <NumberInput
                aria-label="Vertical icon offset"
                w={96}
                step={1}
                value={draft.iconOffset?.[1] ?? 0}
                onChange={(value) => {
                  if (typeof value === 'number') {
                    patch({ iconOffset: [draft.iconOffset?.[0] ?? 0, value] });
                  }
                }}
              />
            }
            input={
              <Slider
                aria-label="Vertical icon offset slider"
                min={-ICON_OFFSET_RANGE}
                max={ICON_OFFSET_RANGE}
                step={1}
                value={draft.iconOffset?.[1] ?? 0}
                onChange={(value) => patch({ iconOffset: [draft.iconOffset?.[0] ?? 0, value] })}
              />
            }
          />
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

function DecalFields({ draft, patch }: { draft: TreacheryDraft; patch: Patch }) {
  const decals = draft.decals;
  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Text fw={700} size="sm">
          Decals
        </Text>
        <ListLengthActions
          addLabel="Add decal"
          removeLabel="Remove last decal"
          removeDisabled={decals.length === 0}
          onAdd={() =>
            patch({
              decals: [
                ...decals,
                {
                  id: (decalAssetOptions[0] ?? '') as TreacheryDraft['decals'][number]['id'],
                  muted: false,
                  outline: true,
                  scale: 1,
                  offset: [0, 0],
                },
              ],
            })
          }
          onRemove={() => patch({ decals: decals.slice(0, -1) })}
        />
      </Group>
      {decals.length === 0 ? (
        <Alert color="gray" variant="light" title="No decals">
          Decals are optional. The card remains valid without them.
        </Alert>
      ) : null}
      {decals.map((decal, index) => (
        <Stack key={index} gap="sm">
          {index > 0 ? <Divider /> : null}
          <Text size="sm" fw={600}>
            Decal {index + 1}
          </Text>
          <DecalControls
            value={decal}
            onChange={(next) => patch({ decals: decals.map((current, i) => (i === index ? next : current)) })}
            label={`decal ${index + 1}`}
            offsetRange={DECAL_OFFSET_RANGE}
          />
        </Stack>
      ))}
    </Stack>
  );
}

/* The card's body: the text under the art band. */
function BodyField({ draft, patch }: { draft: TreacheryDraft; patch: Patch }) {
  return (
    <ControlBlock
      title="Body"
      description="Line breaks become paragraphs on the card."
      input={
        <Textarea
          aria-label="Body"
          autosize
          minRows={4}
          value={draft.text}
          onChange={(event) => patch({ text: event.currentTarget.value })}
        />
      }
    />
  );
}

/* ----------------------------- validation ----------------------------- */

export type TreacheryChapter = 'head' | 'icon' | 'decals' | 'body' | 'about';

export type TreacheryDraftWarning = { source: string; missing: string; chapter: TreacheryChapter };

export function treacheryDraftWarnings(draft: TreacheryDraft): TreacheryDraftWarning[] {
  const warnings: TreacheryDraftWarning[] = [];
  if (!draft.name.trim()) {
    warnings.push({ source: 'Head', missing: 'a name', chapter: 'head' });
  }
  if (!draft.subName.trim()) {
    warnings.push({ source: 'Head', missing: 'a type', chapter: 'head' });
  }
  if (!draft.text.trim()) {
    warnings.push({ source: 'Body', missing: 'body text', chapter: 'body' });
  }
  return warnings;
}

/* ------------------------------ workbench ------------------------------ */

/* No padding here: ConnectedTabs' panel shell owns the panel inset (--connected-tabs-panel-padding). */
const panel = (children: ReactNode) => <Stack gap="lg">{children}</Stack>;

/**
 * The treachery card workbench both the create and edit pages install identically: chaptered fields on the left, the full-width live card proof on the right.
 * Pages own the draft, its persistence, and the surrounding authoring chrome.
 */
export function TreacheryCardEditor({
  draft,
  patch,
  chapter,
  onChapterChange,
  onSettle,
}: {
  draft: TreacheryDraft;
  patch: Patch;
  chapter: TreacheryChapter;
  onChapterChange: (chapter: TreacheryChapter) => void;
  /** Fired on field blur and chapter switches — the signals that let an emptied warning list close the validation header. */
  onSettle: () => void;
}) {
  return (
    <WorkbenchLayout.Workbench onBlurCapture={onSettle}>
      <WorkbenchLayout.Chapters>
        <ConnectedTabs<TreacheryChapter>
          value={chapter}
          onValueChange={(next) => {
            onChapterChange(next);
            onSettle();
          }}
          ariaLabel="Card chapters"
          items={[
            {
              value: 'head',
              label: 'Head',
              icon: <TopicIcon topic="text" size={21} />,
              panel: panel(<HeadFields draft={draft} patch={patch} />),
            },
            {
              value: 'icon',
              label: 'Symbol',
              icon: <Stamp size={21} aria-hidden />,
              panel: panel(<IconFields draft={draft} patch={patch} />),
            },
            {
              value: 'decals',
              label: 'Decals',
              icon: <TopicIcon topic="decals" size={21} />,
              panel: panel(<DecalFields draft={draft} patch={patch} />),
            },
            {
              value: 'body',
              label: 'Body',
              icon: <ScrollText size={21} aria-hidden />,
              panel: panel(<BodyField draft={draft} patch={patch} />),
            },
            aboutChapter(draft.about, (about) => patch({ about })),
          ]}
        />
      </WorkbenchLayout.Chapters>
      <WorkbenchLayout.Rail>
        <FillCard draft={draft} />
      </WorkbenchLayout.Rail>
    </WorkbenchLayout.Workbench>
  );
}
