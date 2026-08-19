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
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Brush, ScrollText, Type } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { BackgroundComposer } from '@app/widgets/background-composer/BackgroundComposer';
import { BackgroundPresetPicker } from '@app/widgets/background-composer/BackgroundPresetPicker';
import { DecalControls } from '@app/widgets/decal-editor/DecalControls';
import {
  assetOptionToPreviewSrc,
  decalAssetOptions,
  decalAssetOptionToLabel,
} from '@app/widgets/faction-editor/factionFormAssetUtils';
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { backgroundPresets } from '@game/data/backgrounds';
import type { Treachery } from '@game/data/objects';
import { card as CARD_SIZE } from '@game/data/sizes';

import styles from './TreacheryCardEditor.module.css';

/* The icon draws from the same full vector pool the decals do — the schema's ALL union, not just the icon set. */
const iconOptions = decalAssetOptions.map((value) => ({ value, label: decalAssetOptionToLabel(value) }));

/* ------------------------------ draft model ------------------------------ */
/* The draft IS the stored shape: the same Treachery zod validates on save (server-side
   in assets.create/update) and drives the renderer live. */

export type TreacheryDraft = z.infer<typeof Treachery>;

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
  subName: '',
  head: backgroundPresets.weapon,
  icon: [backgroundPresets.stripedWeapon, '/vector/icon/projectile.svg'],
  decals: [],
  text: '',
};

/* Field-by-field, not identity or JSON: a head that round-tripped through the database is a clone of its preset with Zod's key order. */
function sameBackground(a: TreacheryDraft['head'], b: TreacheryDraft['head']): boolean {
  return (
    a.image === b.image &&
    a.invert === b.invert &&
    a.definition === b.definition &&
    a.influence === b.influence &&
    JSON.stringify(a.colors) === JSON.stringify(b.colors)
  );
}

const HEAD_PRESETS = CARD_PRESETS.map(({ key, label, head }) => ({ key, label, background: head }));
const ICON_BACKGROUND_PRESETS = CARD_PRESETS.map(({ key, label, striped }) => ({ key, label, background: striped }));

/* Center-to-edge slider span: the treachery card is 900 × 1263 in card space. */
const DECAL_OFFSET_RANGE = [450, 630] as const;

/* The icon disc is 125 card-space pixels; half a disc of nudge per axis, number inputs unclamped. */
const ICON_OFFSET_RANGE = 60;

const DEFAULT_TAB_VECTOR = '/vector/icon/projectile.svg';

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
        description="The background behind the card's name. Picking a preset also resets the icon background to its matching stripes."
        usedOn="this card's head"
        presets={HEAD_PRESETS}
        value={draft.head}
        onChange={(head, presetKey) => {
          const preset = CARD_PRESETS.find((candidate) => candidate.key === presetKey);
          patch(preset ? { head, icon: [preset.striped, draft.icon[1]] } : { head });
        }}
      />
    </Stack>
  );
}

/* A background chosen from named presets, with the composer behind a Custom option.
   "Custom" stays selected while the value still equals a preset — the choice itself opens the composer. */
function BackgroundPresetControl({
  title,
  description,
  usedOn,
  presets,
  value,
  onChange,
}: {
  title: string;
  description: string;
  usedOn: string;
  presets: readonly { key: string; label: string; background: TreacheryDraft['head'] }[];
  value: TreacheryDraft['head'];
  onChange: (background: TreacheryDraft['head'], presetKey: string | null) => void;
}) {
  const presetKey = presets.find((preset) => sameBackground(preset.background, value))?.key ?? null;
  const [customChosen, setCustomChosen] = useState(presetKey === null);
  const selected = customChosen || presetKey === null ? 'custom' : presetKey;
  return (
    <ControlBlock
      title={title}
      description={description}
      input={
        <Stack gap="sm">
          <BackgroundPresetPicker
            presets={presets}
            selected={selected}
            customBackground={value}
            onSelect={(next) => {
              if (next === 'custom') {
                setCustomChosen(true);
                return;
              }
              const preset = presets.find((candidate) => candidate.key === next);
              if (preset) {
                setCustomChosen(false);
                onChange(preset.background, preset.key);
              }
            }}
          />
          {selected === 'custom' ? (
            <BackgroundComposer value={value} onChange={(background) => onChange(background, null)} usedOn={usedOn} />
          ) : null}
        </Stack>
      }
    />
  );
}

/* The card's icon: the vector in the top-right disc, its Background, and its scale. */
function IconFields({ draft, patch }: { draft: TreacheryDraft; patch: Patch }) {
  return (
    <Stack gap="md">
      <ControlBlock
        title="Icon"
        description="The vector in the top-right disc; it doubles as this chapter's tab icon."
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

export type TreacheryChapter = 'head' | 'icon' | 'decals' | 'body';

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

/** The Icon tab wears the card's own icon, so the chapter list reflects the data. */
function ChapterGlyph({ vector }: { vector: string }) {
  const src = assetOptionToPreviewSrc(vector) ?? assetOptionToPreviewSrc(DEFAULT_TAB_VECTOR);
  return src ? <img src={src} alt="" width={21} height={21} className={styles.glyph} /> : null;
}

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
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(17rem, 21rem)',
        alignItems: 'start',
      }}
      onBlurCapture={onSettle}
    >
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
            icon: <Type size={21} aria-hidden />,
            panel: panel(<HeadFields draft={draft} patch={patch} />),
          },
          {
            value: 'icon',
            label: 'Icon',
            icon: <ChapterGlyph vector={draft.icon[1]} />,
            panel: panel(<IconFields draft={draft} patch={patch} />),
          },
          {
            value: 'decals',
            label: 'Decals',
            icon: <Brush size={21} aria-hidden />,
            panel: panel(<DecalFields draft={draft} patch={patch} />),
          },
          {
            value: 'body',
            label: 'Body',
            icon: <ScrollText size={21} aria-hidden />,
            panel: panel(<BodyField draft={draft} patch={patch} />),
          },
        ]}
      />
      <div style={{ minWidth: 0, paddingLeft: 'var(--mantine-spacing-md)' }}>
        <div style={{ position: 'sticky', top: 96 }}>
          <FillCard draft={draft} />
        </div>
      </div>
    </div>
  );
}
