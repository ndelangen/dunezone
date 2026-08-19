import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Group,
  NumberInput,
  SegmentedControl,
  Slider,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { Eyebrow } from '@ui/content/Eyebrow';
import { AssetSelect } from '@ui/control/AssetSelect';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Brush, Layers, Plus, ScrollText, Trash2, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { useCurrentProfile } from '@db/profiles';
import { useCreateAsset } from '@app/db/assets';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useValidationHeaderOpen } from '@app/widgets/authoring/useValidationHeaderOpen';
import { ValidationHeader } from '@app/widgets/authoring/ValidationHeader';
import {
  assetOptionToPreviewSrc,
  decalAssetOptions,
  decalAssetOptionToLabel,
  iconAssetOptions,
  iconAssetOptionToLabel,
} from '@app/widgets/faction-editor/factionFormAssetUtils';
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { backgroundPresets } from '@game/data/backgrounds';
import type { Treachery } from '@game/data/objects';
import { card as CARD_SIZE } from '@game/data/sizes';

const iconOptions = iconAssetOptions.map((value) => ({ value, label: iconAssetOptionToLabel(value) }));
const decalOptions = decalAssetOptions.map((value) => ({ value, label: decalAssetOptionToLabel(value) }));

export const Route = createFileRoute('/_app/assets/cards/create')({
  component: CreateTreacheryCardPage,
});

/* ------------------------------ draft model ------------------------------ */
/* The draft IS the stored shape: the same Treachery zod validates on save (server-side
   in assets.create) and drives the renderer live. */

type TreacheryDraft = z.infer<typeof Treachery>;

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

const INITIAL_DRAFT: TreacheryDraft = {
  name: '',
  subName: '',
  head: backgroundPresets.weapon,
  icon: [backgroundPresets.stripedWeapon, '/vector/icon/projectile.svg'],
  decals: [],
  text: '',
};

function kindOf(draft: TreacheryDraft): string {
  return CARD_KINDS.find((kind) => kind.head === draft.head)?.key ?? 'weapon';
}

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
    <Stack gap="sm">
      <TextInput
        label="Name"
        description="Names the card and determines its URL"
        value={draft.name}
        onChange={(event) => patch({ name: event.currentTarget.value })}
      />
      <TextInput
        label="Type line"
        description="Shown under the name, e.g. “Weapon - Projectile”"
        value={draft.subName}
        onChange={(event) => patch({ subName: event.currentTarget.value })}
      />
    </Stack>
  );
}

function FrameFields({ draft, patch }: { draft: TreacheryDraft; patch: Patch }) {
  return (
    <Stack gap="sm">
      <div>
        <Text size="sm" fw={500} mb={4}>
          Card kind
        </Text>
        <SegmentedControl
          fullWidth
          value={kindOf(draft)}
          onChange={(value) => {
            const kind = CARD_KINDS.find((candidate) => candidate.key === value);
            if (kind) {
              patch({ head: kind.head, icon: [kind.striped, draft.icon[1]] });
            }
          }}
          data={CARD_KINDS.map((kind) => ({ value: kind.key, label: kind.label }))}
        />
      </div>
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
      <div>
        <Text size="sm" fw={500} mb={4}>
          Icon scale
        </Text>
        <Slider
          min={0.5}
          max={2}
          step={0.05}
          value={draft.iconScale ?? 1}
          onChange={(value) => patch({ iconScale: value })}
          label={(value) => value.toFixed(2)}
        />
      </div>
    </Stack>
  );
}

function ArtworkFields({ draft, patch }: { draft: TreacheryDraft; patch: Patch }) {
  const setDecal = (index: number, update: Partial<TreacheryDraft['decals'][number]>) => {
    patch({ decals: draft.decals.map((decal, i) => (i === index ? { ...decal, ...update } : decal)) });
  };
  return (
    <Stack gap="md">
      {draft.decals.map((decal, index) => (
        <Stack
          key={index}
          gap={6}
          style={{ borderLeft: '2px solid var(--mantine-color-default-border)', paddingLeft: 10 }}
        >
          <Group justify="space-between">
            <Text size="sm" fw={600}>
              Decal {index + 1}
            </Text>
            <Button
              size="compact-xs"
              variant="subtle"
              color="red"
              leftSection={<Trash2 size={13} aria-hidden />}
              onClick={() => patch({ decals: draft.decals.filter((_, i) => i !== index) })}
            >
              Remove
            </Button>
          </Group>
          <AssetSelect
            aria-label={`Decal ${index + 1} artwork`}
            allowDeselect={false}
            limit={30}
            data={decalOptions}
            getPreviewSrc={assetOptionToPreviewSrc}
            glyphPreviews
            value={decal.id}
            onChange={(value) => {
              if (value) {
                setDecal(index, { id: value as TreacheryDraft['decals'][number]['id'] });
              }
            }}
          />
          <Slider
            min={0.4}
            max={2.2}
            step={0.05}
            value={decal.scale}
            onChange={(value) => setDecal(index, { scale: value })}
            label={(value) => `scale ${value.toFixed(2)}`}
          />
          <Group gap="md">
            <Checkbox
              label="Outline"
              checked={decal.outline}
              onChange={(event) => setDecal(index, { outline: event.currentTarget.checked })}
            />
            <Checkbox
              label="Muted"
              checked={decal.muted}
              onChange={(event) => setDecal(index, { muted: event.currentTarget.checked })}
            />
            <NumberInput
              size="xs"
              w={70}
              label="X"
              value={decal.offset[0]}
              onChange={(value) => setDecal(index, { offset: [Number(value) || 0, decal.offset[1]] })}
            />
            <NumberInput
              size="xs"
              w={70}
              label="Y"
              value={decal.offset[1]}
              onChange={(value) => setDecal(index, { offset: [decal.offset[0], Number(value) || 0] })}
            />
          </Group>
        </Stack>
      ))}
      <Button
        variant="light"
        size="xs"
        leftSection={<Plus size={14} aria-hidden />}
        onClick={() =>
          patch({
            decals: [
              ...draft.decals,
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
      >
        Add decal
      </Button>
    </Stack>
  );
}

function RulesTextField({ draft, patch }: { draft: TreacheryDraft; patch: Patch }) {
  return (
    <Textarea
      label="Rules text"
      description="Line breaks become paragraphs on the card"
      autosize
      minRows={4}
      value={draft.text}
      onChange={(event) => patch({ text: event.currentTarget.value })}
    />
  );
}

/* ----------------------------- validation ----------------------------- */

const VALIDATION_STRIP_ID = 'card-validation-header';

type Chapter = 'identity' | 'frame' | 'artwork' | 'rules';

type DraftWarning = { source: string; missing: string; chapter: Chapter };

function draftWarnings(draft: TreacheryDraft): DraftWarning[] {
  const warnings: DraftWarning[] = [];
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

/* --------------------------------- page --------------------------------- */

const panel = (children: ReactNode) => (
  <Stack gap="md" p="lg">
    {children}
  </Stack>
);

function CreateTreacheryCardPage() {
  const navigate = useNavigate();
  const profile = useCurrentProfile();
  const createAsset = useCreateAsset();
  const [draft, setDraft] = useState<TreacheryDraft>(INITIAL_DRAFT);
  const [chapter, setChapter] = useState<Chapter>('identity');
  const [settleTick, setSettleTick] = useState(0);
  const patch: Patch = (update) => setDraft((prev) => ({ ...prev, ...update }));
  const warnings = draftWarnings(draft);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(INITIAL_DRAFT);
  const isNameBlank = !draft.name.trim();
  const saveState: AuthoringSaveState = createAsset.isPending
    ? 'saving'
    : createAsset.error
      ? 'error'
      : createAsset.data !== undefined
        ? 'saved'
        : 'idle';
  const validationHeaderOpen = useValidationHeaderOpen(warnings.length, settleTick);
  const settle = () => setSettleTick((tick) => tick + 1);

  if (profile.data === null) {
    return (
      <PageLayout>
        <PageLayout.Header size="compact">
          <Stack gap={2} align="center">
            <Eyebrow tone="inverse">New treachery card</Eyebrow>
          </Stack>
        </PageLayout.Header>
        <PageLayout.Content>
          <Surface padding="xl">
            <Text>
              <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>Log in</Anchor> to create
              cards.
            </Text>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  const save = () => {
    createAsset.mutate(
      { type: 'card-treachery', data: draft },
      {
        onSuccess: () => void navigate({ to: '/assets/$category', params: { category: 'cards' } }),
      }
    );
  };

  return (
    <PageLayout>
      {validationHeaderOpen ? (
        <PageLayout.Header size="compact">
          <ValidationHeader
            id={VALIDATION_STRIP_ID}
            warnings={warnings}
            onFocusWarning={(warning) => setChapter(warning.chapter)}
          />
        </PageLayout.Header>
      ) : null}
      <PageLayout.Toolbar>
        <AuthoringToolbar
          status={{ isDirty, isNameBlank, warningCount: warnings.length, saveState }}
          copy={{
            saveLabel: 'Save card',
            nameBlankMessage: 'Add a card name before saving; it determines the card URL.',
            statusMessage:
              saveState === 'error'
                ? 'The card was not saved.'
                : 'New treachery card — publication follows once the image pipeline supports cards.',
          }}
          actions={{
            onSave: save,
            onReviewWarnings: () =>
              document.getElementById(VALIDATION_STRIP_ID)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
            onReset: () => setDraft(INITIAL_DRAFT),
            onBack: () => void navigate({ to: '/assets' }),
          }}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="sm" style={{ width: '100%', maxWidth: '78rem', margin: '0 auto' }}>
          {createAsset.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not save">
              {createAsset.error.message}
            </Alert>
          ) : null}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(17rem, 21rem)',
              alignItems: 'start',
            }}
            /* Field blur and chapter switches are the settle signals that let an emptied
               warning list close the header — never mid-keystroke. */
            onBlurCapture={settle}
          >
            <ConnectedTabs<Chapter>
              value={chapter}
              onValueChange={(next) => {
                setChapter(next);
                settle();
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
                  icon: <Layers size={21} aria-hidden />,
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
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
