/**
 * PROTOTYPE — wayfinder ticket #501 "Treachery card editor and renderer".
 * Three variants of the card editor on the existing /assets/create route, switchable via
 * ?variant= (A|B|C). One shared in-memory draft (the real `Treachery` schema shape) feeds
 * the real TreacheryCard renderer live; edits survive variant switches.
 * A: studio split — sticky preview beside a sectioned form (faction-editor pattern).
 * B: canvas — the card IS the editor; click a region, edit in a floating popover.
 * C: contexts — form beside the card at three real-world sizes (full/catalogue/table).
 * Throwaway: the winner gets rewritten properly against the authoring/persistence stack.
 */
import {
  Badge,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Popover,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Eyebrow } from '@ui/content/Eyebrow';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Toolbar } from '@ui/surface/Toolbar';
import { IconAction } from '@ui/control/IconAction';
import {
  ArrowLeft,
  Brush,
  ChevronLeft,
  ChevronRight,
  Layers,
  Plus,
  RotateCcw,
  Save,
  ScrollText,
  Trash2,
  TriangleAlert,
  Type,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { z } from 'zod';

import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { backgroundPresets } from '@game/data/backgrounds';
import type { Treachery } from '@game/data/objects';
import { card as CARD_SIZE } from '@game/data/sizes';

const VARIANTS = ['A', 'B', 'C'] as const;
type Variant = (typeof VARIANTS)[number];
const VARIANT_NAMES: Record<Variant, string> = {
  A: 'Workbench',
  B: 'Canvas',
  C: 'Contexts',
};

type CreateSearch = { variant?: Variant };

export const Route = createFileRoute('/_app/assets/cards/create')({
  validateSearch: (search: Record<string, unknown>): CreateSearch => ({
    variant: VARIANTS.includes(search.variant as Variant) ? (search.variant as Variant) : undefined,
  }),
  component: CardEditorPrototypePage,
});

/* ------------------------------ draft model ------------------------------ */

type TreacheryDraft = z.infer<typeof Treachery>;

/** the four card kinds — each pairs a head preset with its striped icon background */
const CARD_KINDS = [
  { key: 'weapon', label: 'Weapon', head: backgroundPresets.weapon, striped: backgroundPresets.stripedWeapon },
  { key: 'defense', label: 'Defense', head: backgroundPresets.defense, striped: backgroundPresets.stripedDefense },
  { key: 'special', label: 'Special', head: backgroundPresets.special, striped: backgroundPresets.stripedSpecial },
  { key: 'worthless', label: 'Worthless', head: backgroundPresets.worthless, striped: backgroundPresets.stripedWorthless },
] as const;
type CardKindKey = (typeof CARD_KINDS)[number]['key'];

const ICON_OPTIONS = ['projectile', 'poison', 'ambassador', 'karama', 'eye', 'combat', 'hand', 'key', 'heighliners'].map(
  (name) => ({ value: `/vector/icon/${name}.svg`, label: name })
);

const DECAL_OPTIONS = ['assassination', 'blade', 'baliset', 'artillery-strike', 'brain', 'body-guard', 'bible', 'barge'].map(
  (name) => ({ value: `/vector/decal/${name}.svg`, label: name })
);

const INITIAL_DRAFT: TreacheryDraft = {
  name: 'Maula Pistol',
  subName: 'Weapon - Projectile',
  head: backgroundPresets.weapon,
  icon: [backgroundPresets.stripedWeapon, '/vector/icon/projectile.svg'],
  decals: [{ id: '/vector/decal/blade.svg', muted: false, outline: true, scale: 1.2, offset: [0, 0] }],
  text: "Play as part of your Battle Plan.\nKills opponent's leader before battle is resolved.\nYou may keep this card if you win this battle.",
};

function kindOf(draft: TreacheryDraft): CardKindKey {
  const match = CARD_KINDS.find((k) => k.head === draft.head);
  return match?.key ?? 'weapon';
}

/* ------------------------------ preview scaling ------------------------------ */

function ScaledCard({ draft, width, style }: { draft: TreacheryDraft; width: number; style?: CSSProperties }) {
  const scale = width / CARD_SIZE.width;
  return (
    <div
      style={{
        width,
        height: width * (CARD_SIZE.height / CARD_SIZE.width),
        position: 'relative',
        borderRadius: width / 18,
        overflow: 'hidden',
        boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
        ...style,
      }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: CARD_SIZE.width, height: CARD_SIZE.height, pointerEvents: 'none' }}>
        <TreacheryCard {...draft} />
      </div>
    </div>
  );
}

/** the rail proof at full rail width — measures its column, like the faction cardProof */
function FillCard({ draft }: { draft: TreacheryDraft }) {
  const [width, setWidth] = useState(0);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return (
    <div ref={setNode} style={{ width: '100%' }}>
      {width > 0 && <ScaledCard draft={draft} width={width} />}
    </div>
  );
}

/* ------------------------------ field editors ------------------------------ */

type Patch = (update: Partial<TreacheryDraft>) => void;

function IdentityFields({ draft, patch }: { draft: TreacheryDraft; patch: Patch }) {
  return (
    <Stack gap="sm">
      <TextInput label="Name" value={draft.name} onChange={(e) => patch({ name: e.currentTarget.value })} />
      <TextInput
        label="Type line"
        description="Shown under the name, e.g. “Weapon - Projectile”"
        value={draft.subName}
        onChange={(e) => patch({ subName: e.currentTarget.value })}
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
            const kind = CARD_KINDS.find((k) => k.key === value);
            if (kind) patch({ head: kind.head, icon: [kind.striped, draft.icon[1]] });
          }}
          data={CARD_KINDS.map((k) => ({ value: k.key, label: k.label }))}
        />
      </div>
      <Select
        label="Corner icon"
        data={ICON_OPTIONS}
        value={draft.icon[1]}
        onChange={(value) => value && patch({ icon: [draft.icon[0], value] })}
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
          label={(v) => v.toFixed(2)}
        />
      </div>
    </Stack>
  );
}

function ArtworkFields({ draft, patch }: { draft: TreacheryDraft; patch: Patch }) {
  const setDecal = (index: number, update: Partial<TreacheryDraft['decals'][number]>) => {
    patch({ decals: draft.decals.map((d, i) => (i === index ? { ...d, ...update } : d)) });
  };
  return (
    <Stack gap="md">
      {draft.decals.map((decal, i) => (
        <Stack key={i} gap={6} style={{ borderLeft: '2px solid var(--mantine-color-default-border)', paddingLeft: 10 }}>
          <Group justify="space-between">
            <Text size="sm" fw={600}>
              Decal {i + 1}
            </Text>
            <Button
              size="compact-xs"
              variant="subtle"
              color="red"
              leftSection={<Trash2 size={13} aria-hidden />}
              onClick={() => patch({ decals: draft.decals.filter((_, j) => j !== i) })}
            >
              Remove
            </Button>
          </Group>
          <Select data={DECAL_OPTIONS} value={decal.id} onChange={(value) => value && setDecal(i, { id: value })} />
          <Slider min={0.4} max={2.2} step={0.05} value={decal.scale} onChange={(value) => setDecal(i, { scale: value })} label={(v) => `scale ${v.toFixed(2)}`} />
          <Group gap="md">
            <Checkbox label="Outline" checked={decal.outline} onChange={(e) => setDecal(i, { outline: e.currentTarget.checked })} />
            <Checkbox label="Muted" checked={decal.muted} onChange={(e) => setDecal(i, { muted: e.currentTarget.checked })} />
            <NumberInput size="xs" w={70} label="X" value={decal.offset[0]} onChange={(v) => setDecal(i, { offset: [Number(v) || 0, decal.offset[1]] })} />
            <NumberInput size="xs" w={70} label="Y" value={decal.offset[1]} onChange={(v) => setDecal(i, { offset: [decal.offset[0], Number(v) || 0] })} />
          </Group>
        </Stack>
      ))}
      <Button
        variant="light"
        size="xs"
        leftSection={<Plus size={14} aria-hidden />}
        onClick={() =>
          patch({ decals: [...draft.decals, { id: DECAL_OPTIONS[0].value, muted: false, outline: true, scale: 1, offset: [0, 0] }] })
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
      onChange={(e) => patch({ text: e.currentTarget.value })}
    />
  );
}

/* ------------------------------- variant A ------------------------------- */
/** Workbench: the faction editor's skeleton — ConnectedTabs chapters on the left,
 * the sticky artifact rail on the right holding the live card proof. */

type Chapter = 'identity' | 'frame' | 'artwork' | 'rules';

function VariantA({
  draft,
  patch,
  chapter,
  onChapterChange,
}: {
  draft: TreacheryDraft;
  patch: Patch;
  chapter: Chapter;
  onChapterChange: (chapter: Chapter) => void;
}) {
  const panel = (children: ReactNode) => (
    <Stack gap="md" p="lg">
      {children}
    </Stack>
  );
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(17rem, 21rem)',
        alignItems: 'start',
        width: '100%',
        maxWidth: '78rem',
        margin: '0 auto',
      }}
    >
      <ConnectedTabs<Chapter>
        value={chapter}
        onValueChange={onChapterChange}
        ariaLabel="Card chapters"
        items={[
          { value: 'identity', label: 'Identity', icon: <Type size={21} aria-hidden />, panel: panel(<IdentityFields draft={draft} patch={patch} />) },
          { value: 'frame', label: 'Frame', icon: <Layers size={21} aria-hidden />, panel: panel(<FrameFields draft={draft} patch={patch} />) },
          { value: 'artwork', label: 'Artwork', icon: <Brush size={21} aria-hidden />, panel: panel(<ArtworkFields draft={draft} patch={patch} />) },
          { value: 'rules', label: 'Rules', icon: <ScrollText size={21} aria-hidden />, panel: panel(<RulesTextField draft={draft} patch={patch} />) },
        ]}
      />
      {/* the artifact desk: the one proof a card has, following you down the form */}
      <div style={{ minWidth: 0, paddingLeft: 'var(--mantine-spacing-md)' }}>
        <div style={{ position: 'sticky', top: 96 }}>
          <FillCard draft={draft} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- variant B ------------------------------- */
/** Canvas: the card IS the editor. Hover shows region outlines; click opens the editor
 * for that region in a floating popover — one layer, faction-rework style. */

type Region = 'identity' | 'frame' | 'artwork' | 'rules';

const REGION_EDITORS: Record<Region, { label: string; Editor: (props: { draft: TreacheryDraft; patch: Patch }) => ReactNode }> = {
  identity: { label: 'Name & type line', Editor: IdentityFields },
  frame: { label: 'Kind & icon', Editor: FrameFields },
  artwork: { label: 'Artwork decals', Editor: ArtworkFields },
  rules: { label: 'Rules text', Editor: RulesTextField },
};

/** hotspot geometry in fractions of the card, mapped from the renderer's layout */
const HOTSPOTS: Record<Region, { top: string; left: string; width: string; height: string }> = {
  identity: { top: '2%', left: '4%', width: '76%', height: '14%' },
  frame: { top: '2%', left: '80%', width: '16%', height: '14%' },
  artwork: { top: '17%', left: '6%', width: '88%', height: '38%' },
  rules: { top: '57%', left: '6%', width: '88%', height: '39%' },
};

function VariantB({ draft, patch }: { draft: TreacheryDraft; patch: Patch }) {
  const [open, setOpen] = useState<Region | null>(null);
  const width = 420;
  return (
    <Surface padding="xl">
      <Stack align="center" gap="md">
        <Text size="sm" c="dimmed">
          Click a part of the card to edit it.
        </Text>
        <div style={{ position: 'relative' }}>
          <ScaledCard draft={draft} width={width} />
          {(Object.keys(HOTSPOTS) as Region[]).map((region) => {
            const spot = HOTSPOTS[region];
            const { label, Editor } = REGION_EDITORS[region];
            return (
              <Popover
                key={region}
                opened={open === region}
                onDismiss={() => setOpen(null)}
                position="right"
                withArrow
                shadow="lg"
                width={340}
                trapFocus
              >
                <Popover.Target>
                  <UnstyledButton
                    aria-label={`Edit ${label}`}
                    onClick={() => setOpen(open === region ? null : region)}
                    style={{
                      position: 'absolute',
                      ...spot,
                      borderRadius: 8,
                      border: open === region ? '2px solid var(--color-link)' : '2px solid transparent',
                      transition: 'border-color 80ms, background 80ms',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(120,160,255,0.12)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  />
                </Popover.Target>
                <Popover.Dropdown>
                  <Stack gap="sm">
                    <Eyebrow>{label}</Eyebrow>
                    <Editor draft={draft} patch={patch} />
                  </Stack>
                </Popover.Dropdown>
              </Popover>
            );
          })}
        </div>
      </Stack>
    </Surface>
  );
}

/* ------------------------------- variant C ------------------------------- */
/** Contexts: the form beside the card at the three sizes it will actually live at —
 * full authoring size, catalogue thumbnail, and TTS table distance. */
function VariantC({ draft, patch }: { draft: TreacheryDraft; patch: Patch }) {
  return (
    <Surface padding="xl">
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 40, alignItems: 'start' }}>
        <Stack gap="lg">
          <IdentityFields draft={draft} patch={patch} />
          <FrameFields draft={draft} patch={patch} />
          <ArtworkFields draft={draft} patch={patch} />
          <RulesTextField draft={draft} patch={patch} />
        </Stack>
        <Group gap={40} align="flex-end" style={{ position: 'sticky', top: 90 }}>
          <Stack gap={6} align="center">
            <ScaledCard draft={draft} width={330} />
            <Text size="xs" c="dimmed">
              authoring
            </Text>
          </Stack>
          <Stack gap={6} align="center">
            <ScaledCard draft={draft} width={150} />
            <Text size="xs" c="dimmed">
              catalogue
            </Text>
          </Stack>
          <Stack gap={6} align="center">
            <ScaledCard draft={draft} width={86} />
            <Text size="xs" c="dimmed">
              on the table
            </Text>
          </Stack>
        </Group>
      </div>
    </Surface>
  );
}

/* ------------------------------- switcher ------------------------------- */

function PrototypeSwitcher({ current }: { current: Variant }) {
  const navigate = useNavigate();
  const cycle = (dir: 1 | -1) => {
    const next = VARIANTS[(VARIANTS.indexOf(current) + dir + VARIANTS.length) % VARIANTS.length];
    void navigate({ to: '/assets/cards/create', search: { variant: next }, replace: true });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === 'ArrowLeft') cycle(-1);
      if (event.key === 'ArrowRight') cycle(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!import.meta.env.DEV) return null;
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 999,
        background: '#111',
        color: 'white',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        fontSize: 13,
      }}
    >
      <UnstyledButton c="white" onClick={() => cycle(-1)} aria-label="Previous variant">
        <ChevronLeft size={16} />
      </UnstyledButton>
      <span>
        {current} — {VARIANT_NAMES[current]}
      </span>
      <UnstyledButton c="white" onClick={() => cycle(1)} aria-label="Next variant">
        <ChevronRight size={16} />
      </UnstyledButton>
    </div>
  );
}

/* ----------------------------- draft validation ----------------------------- */

const VALIDATION_STRIP_ID = 'card-validation-header';

type DraftWarning = { source: string; missing: string; chapter: Chapter };

function draftWarnings(draft: TreacheryDraft): DraftWarning[] {
  const warnings: DraftWarning[] = [];
  if (!draft.name.trim()) warnings.push({ source: 'Identity', missing: 'a name', chapter: 'identity' });
  if (!draft.subName.trim()) warnings.push({ source: 'Identity', missing: 'a type line', chapter: 'identity' });
  if (draft.decals.length === 0) warnings.push({ source: 'Artwork', missing: 'artwork', chapter: 'artwork' });
  if (!draft.text.trim()) warnings.push({ source: 'Rules', missing: 'rules text', chapter: 'rules' });
  return warnings;
}

/* The faction edit-page pattern: no masthead at all while the draft is whole; the header
 * slot exists only as the validation lower-third when warnings do. Chips jump to the
 * offending chapter. (The real build lifts the asymmetric-settle hook from faction edit.) */
function ValidationStrip({ warnings, onFocus }: { warnings: DraftWarning[]; onFocus: (w: DraftWarning) => void }) {
  return (
    <Group gap="sm" justify="center">
      <Group gap={6}>
        <TriangleAlert size={15} aria-hidden />
        <Text size="sm" fw={700}>
          Incomplete fields
        </Text>
      </Group>
      {warnings.map((warning) => (
        <UnstyledButton
          key={`${warning.source}-${warning.missing}`}
          onClick={() => onFocus(warning)}
          style={{ borderRadius: 999, padding: '2px 10px', background: 'rgba(255,255,255,0.12)', fontSize: 13 }}
        >
          <strong>{warning.source}</strong>: missing {warning.missing}
        </UnstyledButton>
      ))}
    </Group>
  );
}

/* --------------------------------- page --------------------------------- */

function CardEditorPrototypePage() {
  const { variant = 'A' } = Route.useSearch();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<TreacheryDraft>(INITIAL_DRAFT);
  const [chapter, setChapter] = useState<Chapter>('identity');
  const patch: Patch = (update) => setDraft((prev) => ({ ...prev, ...update }));
  const warnings = draftWarnings(draft);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(INITIAL_DRAFT);
  const isNameBlank = !draft.name.trim();

  return (
    <>
      <PageLayout>
        {warnings.length > 0 ? (
          <PageLayout.Header size="compact">
            <div id={VALIDATION_STRIP_ID}>
              <ValidationStrip warnings={warnings} onFocus={(warning) => setChapter(warning.chapter)} />
            </div>
          </PageLayout.Header>
        ) : null}
        <PageLayout.Toolbar>
          {/* This page creates exactly one Asset type — no switching here; you arrive
              having already chosen. Structure mirrors FactionAuthoringToolbar. */}
          <Toolbar>
            <Toolbar.Left>
              <Group gap="sm" wrap="nowrap">
                <IconAction
                  label="Back"
                  variant="light"
                  color="gray"
                  size="lg"
                  onClick={() => void navigate({ to: '/assets' })}
                  icon={<ArrowLeft size={17} aria-hidden />}
                />
                <Stack gap={2}>
                  <Group gap="xs" wrap="nowrap">
                    <Badge color={isDirty ? 'orange' : 'gray'} variant="light">
                      {isDirty ? 'Unsaved changes' : 'No unsaved changes'}
                    </Badge>
                    {warnings.length > 0 ? (
                      <Button
                        type="button"
                        variant="subtle"
                        color="yellow"
                        size="compact-xs"
                        onClick={() =>
                          document.getElementById(VALIDATION_STRIP_ID)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        }
                      >
                        {warnings.length} {warnings.length === 1 ? 'field may' : 'fields may'} be incomplete
                      </Button>
                    ) : null}
                  </Group>
                  <Text size="xs" c="dimmed" role="status">
                    {isNameBlank
                      ? 'Add a card name before saving; it determines the card URL.'
                      : 'New treachery card — saving it schedules its public face image.'}
                  </Text>
                </Stack>
              </Group>
            </Toolbar.Left>
            <Toolbar.Right>
              <Group gap="xs" wrap="nowrap">
                <IconAction
                  label="Reset unsaved edits"
                  variant="light"
                  color="gray"
                  size="lg"
                  disabled={!isDirty}
                  onClick={() => setDraft(INITIAL_DRAFT)}
                  icon={<RotateCcw size={17} aria-hidden />}
                />
                <Button
                  type="button"
                  color="confirm"
                  leftSection={<Save size={17} aria-hidden />}
                  disabled={isNameBlank}
                >
                  Save card
                </Button>
              </Group>
            </Toolbar.Right>
          </Toolbar>
        </PageLayout.Toolbar>
        <PageLayout.Content>
          {variant === 'A' ? (
            <VariantA draft={draft} patch={patch} chapter={chapter} onChapterChange={setChapter} />
          ) : variant === 'B' ? (
            <VariantB draft={draft} patch={patch} />
          ) : (
            <VariantC draft={draft} patch={patch} />
          )}
        </PageLayout.Content>
      </PageLayout>
      <PrototypeSwitcher current={variant} />
    </>
  );
}
