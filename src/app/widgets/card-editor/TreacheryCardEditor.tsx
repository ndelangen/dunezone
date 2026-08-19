import { Alert, Group, NumberInput, SegmentedControl, Slider, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Brush, ScrollText, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { BackgroundComposer } from '@app/widgets/background-composer/BackgroundComposer';
import { DecalControls } from '@app/widgets/decal-editor/DecalControls';
import {
  assetOptionToPreviewSrc,
  decalAssetOptions,
  iconAssetOptions,
  iconAssetOptionToLabel,
} from '@app/widgets/faction-editor/factionFormAssetUtils';
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { backgroundPresets } from '@game/data/backgrounds';
import type { Treachery } from '@game/data/objects';
import { card as CARD_SIZE } from '@game/data/sizes';

import styles from './TreacheryCardEditor.module.css';

const iconOptions = iconAssetOptions.map((value) => ({ value, label: iconAssetOptionToLabel(value) }));

/* ------------------------------ draft model ------------------------------ */
/* The draft IS the stored shape: the same Treachery zod validates on save (server-side
   in assets.create/update) and drives the renderer live. */

export type TreacheryDraft = z.infer<typeof Treachery>;

const CARD_KINDS = [
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

const HEAD_PRESETS = CARD_KINDS.map(({ key, label, head }) => ({ key, label, background: head }));
const ICON_BACKDROP_PRESETS = CARD_KINDS.map(({ key, label, striped }) => ({ key, label, background: striped }));

/* Center-to-edge slider span: the treachery card is 900 × 1263 in card space. */
const DECAL_OFFSET_RANGE = [450, 630] as const;

const DEFAULT_TAB_VECTOR = '/vector/icon/projectile.svg';

/* ------------------------------ rail proof ------------------------------ */

function FillCard({ draft }: { draft: TreacheryDraft }) {
  const [width, setWidth] = useState(0);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!node) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  const scale = width / CARD_SIZE.width;
  return (
    <div ref={setNode} style={{ width: '100%' }}>
      {width > 0 && (
        <div
          style={{
            width,
            height: width * (CARD_SIZE.height / CARD_SIZE.width),
            position: 'relative',
            borderRadius: width / 18,
            overflow: 'hidden',
            boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
          }}
        >
          <div
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              width: CARD_SIZE.width,
              height: CARD_SIZE.height,
              pointerEvents: 'none',
            }}
          >
            <TreacheryCard {...draft} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ field editors ------------------------------ */

type Patch = (update: Partial<TreacheryDraft>) => void;

function IdentityFields({ draft, patch }: { draft: TreacheryDraft; patch: Patch }) {
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
        title="Type line"
        description="Shown under the name, e.g. “Weapon - Projectile”."
        input={
          <TextInput
            aria-label="Type line"
            value={draft.subName}
            onChange={(event) => patch({ subName: event.currentTarget.value })}
          />
        }
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
          <SegmentedControl
            fullWidth
            value={selected}
            onChange={(next) => {
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
            data={[
              ...presets.map((preset) => ({ value: preset.key, label: preset.label })),
              { value: 'custom', label: 'Custom' },
            ]}
          />
          {selected === 'custom' ? (
            <BackgroundComposer value={value} onChange={(background) => onChange(background, null)} usedOn={usedOn} />
          ) : null}
        </Stack>
      }
    />
  );
}

function FrameFields({ draft, patch }: { draft: TreacheryDraft; patch: Patch }) {
  return (
    <Stack gap="md">
      <BackgroundPresetControl
        title="Card kind"
        description="The title band's background. Picking a kind also resets the icon backdrop to that kind's stripes."
        usedOn="this card's head"
        presets={HEAD_PRESETS}
        value={draft.head}
        onChange={(head, presetKey) => {
          const kind = CARD_KINDS.find((candidate) => candidate.key === presetKey);
          patch(kind ? { head, icon: [kind.striped, draft.icon[1]] } : { head });
        }}
      />
      <BackgroundPresetControl
        title="Icon backdrop"
        description="The background behind the top-right corner icon, independent of the title band."
        usedOn="the corner icon disc"
        presets={ICON_BACKDROP_PRESETS}
        value={draft.icon[0]}
        onChange={(backdrop) => patch({ icon: [backdrop, draft.icon[1]] })}
      />
      <ControlBlock
        title="Corner icon"
        description="The vector in the top-right disc; it doubles as this chapter's tab icon."
        input={
          <AssetSelect
            aria-label="Corner icon"
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
        title="Icon scale"
        description="Resize the corner icon within its disc; 1 is the reference size."
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
    </Stack>
  );
}

function ArtworkFields({ draft, patch }: { draft: TreacheryDraft; patch: Patch }) {
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
          Decals are optional. The card remains valid without decorative artwork.
        </Alert>
      ) : null}
      {decals.map((decal, index) => (
        <Stack
          key={index}
          gap="sm"
          style={{ borderLeft: '2px solid var(--mantine-color-default-border)', paddingLeft: 10 }}
        >
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

function RulesTextField({ draft, patch }: { draft: TreacheryDraft; patch: Patch }) {
  return (
    <ControlBlock
      title="Rules text"
      description="Line breaks become paragraphs on the card."
      input={
        <Textarea
          aria-label="Rules text"
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

export type TreacheryChapter = 'identity' | 'frame' | 'artwork' | 'rules';

export type TreacheryDraftWarning = { source: string; missing: string; chapter: TreacheryChapter };

export function treacheryDraftWarnings(draft: TreacheryDraft): TreacheryDraftWarning[] {
  const warnings: TreacheryDraftWarning[] = [];
  if (!draft.name.trim()) {
    warnings.push({ source: 'Identity', missing: 'a name', chapter: 'identity' });
  }
  if (!draft.subName.trim()) {
    warnings.push({ source: 'Identity', missing: 'a type line', chapter: 'identity' });
  }
  if (!draft.text.trim()) {
    warnings.push({ source: 'Rules', missing: 'rules text', chapter: 'rules' });
  }
  return warnings;
}

/* ------------------------------ workbench ------------------------------ */

/** The Frame tab wears the card's own corner icon, so the chapter list reflects the data. */
function ChapterGlyph({ vector }: { vector: string }) {
  const src = assetOptionToPreviewSrc(vector) ?? assetOptionToPreviewSrc(DEFAULT_TAB_VECTOR);
  return src ? <img src={src} alt="" width={21} height={21} className={styles.glyph} /> : null;
}

const panel = (children: ReactNode) => (
  <Stack gap="md" p="lg">
    {children}
  </Stack>
);

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
            value: 'identity',
            label: 'Identity',
            icon: <Type size={21} aria-hidden />,
            panel: panel(<IdentityFields draft={draft} patch={patch} />),
          },
          {
            value: 'frame',
            label: 'Frame',
            icon: <ChapterGlyph vector={draft.icon[1]} />,
            panel: panel(<FrameFields draft={draft} patch={patch} />),
          },
          {
            value: 'artwork',
            label: 'Artwork',
            icon: <Brush size={21} aria-hidden />,
            panel: panel(<ArtworkFields draft={draft} patch={patch} />),
          },
          {
            value: 'rules',
            label: 'Rules',
            icon: <ScrollText size={21} aria-hidden />,
            panel: panel(<RulesTextField draft={draft} patch={patch} />),
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
