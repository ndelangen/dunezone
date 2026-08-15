/**
 * PROTOTYPE — THROWAWAY. Wayfinder ticket #403: how should the faction complexity rating look on
 * the browsing surfaces? Three variants of the complexity treatment, switchable via `?variant=`
 * (A/B/C) and arrow keys, mounted on the existing /factions catalogue and /factions/$factionId
 * detail routes. Delete this file (and its mounts) once a variant wins; nothing here is production
 * code — the real calculation ships from the shared module decided on the map.
 */
import {
  Badge,
  Button,
  Group,
  InputBase,
  Popover,
  RangeSlider,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { FactionCard } from '@ui/block/FactionCard';
import { TopicIcon } from '@ui/content/TopicIcon';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import factionListStyles from '@ui/list/FactionList.module.css';
import { ArrowDownAZ, ChevronsUpDown, Filter } from 'lucide-react';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';

import type { FactionCatalogueEntry, FactionData } from '@db/factions';

/* ------------------------------------------------------------------------------------------------
 * Placeholder calculation — stands in for the shared module (calibration is ticket #405).
 * Word count over sheet-rendered rules text; grace floor 40 words, 1.0 anchor at 400 words.
 * --------------------------------------------------------------------------------------------- */

const FLOOR_WORDS = 60;
const CAPACITY_WORDS = 900;

function words(text: string | undefined): number {
  if (!text) {return 0;}
  return text
    .replace(/[*_~`#>[\]()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

export function prototypeComplexity(data: FactionData): number {
  const rules = data.rules;
  const total =
    words(rules.startText) +
    words(rules.revivalText) +
    words(rules.alliance.text) +
    words(rules.fate.title) +
    words(rules.fate.text) +
    rules.advantages.reduce(
      (sum, rule) => sum + words(rule.title) + words(rule.text) + words(rule.karama),
      0
    );
  if (total <= FLOOR_WORDS) {return 0;}
  return Math.min(1, (total - FLOOR_WORDS) / (CAPACITY_WORDS - FLOOR_WORDS));
}

export type ComplexityTier = 'novice' | 'intermediate' | 'expert' | 'master';

export const TIER_COPY: Record<
  ComplexityTier,
  { label: string; blurb: string; color: string; icon: TopicIconTopic }
> = {
  novice: { label: 'Novice', blurb: 'Light rules — a fine first faction.', color: 'teal', icon: 'spice' },
  intermediate: {
    label: 'Intermediate',
    blurb: 'A comfortable read with a few twists.',
    color: 'yellow',
    icon: 'rules',
  },
  expert: {
    label: 'Expert',
    blurb: 'Dense rules that reward table experience.',
    color: 'orange',
    icon: 'advantages',
  },
  master: { label: 'Master', blurb: 'A heavy read — for veterans of the sand.', color: 'red', icon: 'fate' },
};

/**
 * Bare tier glyph — no disc — sitting on the caption's dark gradient, as bright as the name.
 * z-index outbids the card's caption layer (z 4) so the gradient never dims it.
 */
export function TierIconBadge({
  tier,
  detail,
  color = 'var(--mantine-color-white)',
}: {
  tier: ComplexityTier;
  detail?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        color,
      }}
      aria-label={`${TIER_COPY[tier].label} complexity`}
    >
      <TopicIcon topic={TIER_COPY[tier].icon} size={22} />
      {detail ? <span style={{ fontSize: 12, fontWeight: 700 }}>{detail}</span> : null}
    </div>
  );
}

const TIER_BADGE_OVERLAY_STYLE: CSSProperties = {
  position: 'absolute',
  bottom: '4.5%',
  right: '5%',
  zIndex: 5,
  pointerEvents: 'none',
};

export function prototypeTier(score: number): ComplexityTier {
  if (score < 0.25) {return 'novice';}
  if (score < 0.5) {return 'intermediate';}
  if (score < 0.75) {return 'expert';}
  return 'master';
}

export const outOfTen = (score: number) => Math.round(score * 10);

/** The manual `complexity` field doesn't exist on the schema yet — the prototype fakes the read. */
function scoreOf(data: FactionData): number {
  const manual = (data as { complexity?: number }).complexity;
  return manual ?? prototypeComplexity(data);
}

/* ------------------------------------------------------------------------------------------------
 * Variant plumbing: tiny external store persisted in localStorage. (The router's validateSearch
 * strips unknown URL params on navigation, so a `?variant=` param would not survive.)
 * --------------------------------------------------------------------------------------------- */

const VARIANTS = ['A', 'B', 'C'] as const;
export type PrototypeVariant = (typeof VARIANTS)[number];
const VARIANT_NAMES: Record<PrototypeVariant, string> = {
  A: 'Spice gauge',
  B: 'Tier-first',
  C: 'Understated numeric',
};

const VARIANT_STORAGE_KEY = 'prototype-403-variant';

function readVariant(): PrototypeVariant {
  const raw = window.localStorage.getItem(VARIANT_STORAGE_KEY);
  return (VARIANTS as readonly string[]).includes(raw ?? '') ? (raw as PrototypeVariant) : 'A';
}

const listeners = new Set<() => void>();
function setVariant(variant: PrototypeVariant) {
  window.localStorage.setItem(VARIANT_STORAGE_KEY, variant);
  for (const listener of listeners) {listener();}
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePrototypeVariant(): PrototypeVariant {
  return useSyncExternalStore(subscribe, readVariant, () => 'A');
}

/** Floating bottom-centre switcher. Obviously not part of the design under evaluation. */
export function PrototypeSwitcher() {
  const variant = usePrototypeVariant();
  if (import.meta.env.PROD) {return null;}

  const cycle = (delta: number) => {
    const index = (VARIANTS.indexOf(variant) + delta + VARIANTS.length) % VARIANTS.length;
    setVariant(VARIANTS[index] as PrototypeVariant);
  };

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
        gap: 12,
        padding: '8px 14px',
        borderRadius: 999,
        background: '#111',
        color: '#fff',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        fontSize: 13,
        fontFamily: 'monospace',
      }}
      onKeyDownCapture={(event) => event.stopPropagation()}
    >
      <button type="button" onClick={() => cycle(-1)} style={switcherButtonStyle} aria-label="Previous variant">
        ←
      </button>
      <span>
        {variant} — {VARIANT_NAMES[variant]}
      </span>
      <button type="button" onClick={() => cycle(1)} style={switcherButtonStyle} aria-label="Next variant">
        →
      </button>
    </div>
  );
}

const switcherButtonStyle: CSSProperties = {
  background: 'transparent',
  color: 'inherit',
  border: '1px solid #555',
  borderRadius: 999,
  width: 26,
  height: 26,
  cursor: 'pointer',
};

if (typeof window !== 'undefined' && !import.meta.env.PROD) {
  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.closest('input, textarea, select, [contenteditable], [role="slider"]') ||
        target.isContentEditable)
    ) {
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const delta = event.key === 'ArrowLeft' ? -1 : 1;
      const index = (VARIANTS.indexOf(readVariant()) + delta + VARIANTS.length) % VARIANTS.length;
      setVariant(VARIANTS[index] as PrototypeVariant);
    }
  });
}

/* ------------------------------------------------------------------------------------------------
 * Shared visual bits
 * --------------------------------------------------------------------------------------------- */

/** Row of ten spice glyphs; filled glyphs carry the accent colour, the rest sit at low opacity. */
function SpiceGauge({ score, size = 16 }: { score: number; size?: number }) {
  const filled = outOfTen(score);
  return (
    <Group gap={3} wrap="nowrap" aria-label={`Complexity ${filled} out of 10`}>
      {Array.from({ length: 10 }, (_, index) => (
        <span
          key={index}
          style={{
            color: index < filled ? 'var(--color-accent-strong, #c47f17)' : 'currentColor',
            opacity: index < filled ? 1 : 0.22,
          }}
        >
          <TopicIcon topic="spice" size={size} />
        </span>
      ))}
    </Group>
  );
}

function MeterBar({ score }: { score: number }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.15)', overflow: 'hidden' }}>
      <div
        style={{
          width: `${Math.round(score * 100)}%`,
          height: '100%',
          borderRadius: 3,
          background: 'var(--color-accent-strong, #c47f17)',
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Detail page mounts
 * --------------------------------------------------------------------------------------------- */

/** Mounts in the detail-page header, under the title block. */
export function PrototypeComplexityHeader({ data }: { data: FactionData }) {
  const variant = usePrototypeVariant();
  const score = scoreOf(data);
  const tier = prototypeTier(score);

  if (variant === 'A') {
    return (
      <Group gap="sm" wrap="nowrap">
        <SpiceGauge score={score} />
        <Text size="sm" c="dimmed">
          {TIER_COPY[tier].label} · {outOfTen(score)}/10
        </Text>
      </Group>
    );
  }
  if (variant === 'B') {
    return (
      <Group gap="xs">
        <Badge variant="light" color={TIER_COPY[tier].color}>
          {TIER_COPY[tier].label}
        </Badge>
      </Group>
    );
  }
  return null; // C keeps the header clean; the rating lives among the Setup stats.
}

/** Mounts at the top of the detail-page sidebar. */
export function PrototypeComplexitySidebar({ data }: { data: FactionData }) {
  const variant = usePrototypeVariant();
  const score = scoreOf(data);
  const tier = prototypeTier(score);

  if (variant === 'B') {
    return (
      <Card icon={<TopicIcon topic="spice" size={20} />} title="Complexity">
        <Stack gap="xs">
          <Group justify="space-between" align="baseline">
            <Text fw={700}>{TIER_COPY[tier].label}</Text>
            <Text size="xs" c="dimmed">
              {outOfTen(score)}/10
            </Text>
          </Group>
          <MeterBar score={score} />
          <Text size="xs" c="dimmed">
            {TIER_COPY[tier].blurb}
          </Text>
        </Stack>
      </Card>
    );
  }
  if (variant === 'C') {
    return (
      <Surface padding="md">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <TopicIcon topic="spice" size={17} />
            <Text size="sm" fw={600}>
              Complexity
            </Text>
          </Group>
          <Text size="sm" c="dimmed">
            {outOfTen(score)}/10 · {TIER_COPY[tier].label}
          </Text>
        </Group>
      </Surface>
    );
  }
  return null; // A carries the rating in the header gauge alone.
}

/* ------------------------------------------------------------------------------------------------
 * Catalogue mounts
 * --------------------------------------------------------------------------------------------- */

const TIER_ORDER: ComplexityTier[] = ['novice', 'intermediate', 'expert', 'master'];

/** Mounts above the catalogue content; owns its own filter/sort state (prototype-local). */
export function usePrototypeCatalogue(factions: FactionCatalogueEntry[]) {
  const variant = usePrototypeVariant();
  /* The complexity filter is a score range (0–10) driven by the pane's slider. */
  const [range, setRange] = useState<[number, number]>([0, 10]);
  const [sort, setSort] = useState<'none' | 'asc' | 'desc'>('none');

  const scored = factions.map((faction) => {
    const score = scoreOf(faction.data);
    return { faction, score, tier: prototypeTier(score) };
  });

  const rangeActive = range[0] > 0 || range[1] < 10;
  let visible = scored;
  if (rangeActive) {
    visible = visible.filter(
      (entry) => outOfTen(entry.score) >= range[0] && outOfTen(entry.score) <= range[1]
    );
  }
  if (sort !== 'none') {
    visible = [...visible].sort((a, b) => (sort === 'asc' ? a.score - b.score : b.score - a.score));
  }

  return { variant, range, setRange, rangeActive, sort, setSort, scored, visible };
}

export type PrototypeRulesetFilter = {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
};

/**
 * The popover pane, drawn with the app's panel tokens so it reads as part of the design. A warm
 * opaque base sits under the glass tint: floating panes can't borrow blur from busy card artwork
 * without going illegible.
 */
const PANEL_DROPDOWN_STYLE: CSSProperties = {
  background:
    'linear-gradient(var(--panel-bg), var(--panel-bg)), var(--mantine-color-body, #f4ead8)',
  border: '2px solid var(--panel-border)',
  borderRadius: 'var(--panel-radius)',
  boxShadow: 'var(--panel-shadow)',
  backdropFilter: 'blur(var(--glass-blur-md, 10px))',
};

/**
 * The single filter control: one popover combining the ruleset filter and the complexity range
 * (sorting stays outside, in the band). The trigger reads as a field of the joined band — funnel
 * icon, label, chevron, divider — exactly like the selects beside it; expanding it shows the pane.
 */
export function PrototypeCatalogueControls({
  catalogue,
  rulesetFilter,
  className,
}: {
  catalogue: ReturnType<typeof usePrototypeCatalogue>;
  rulesetFilter: PrototypeRulesetFilter;
  className?: string;
}) {
  const { range, setRange, rangeActive, scored, visible } = catalogue;

  const rulesetActive = rulesetFilter.value !== 'all';
  const activeCount = (rulesetActive ? 1 : 0) + (rangeActive ? 1 : 0);
  const filtered = activeCount > 0;

  return (
    <Popover position="bottom-start" shadow="md" width={320}>
      <Popover.Target>
        <InputBase
          component="button"
          type="button"
          pointer
          variant="unstyled"
          className={className}
          leftSection={<Filter size={15} aria-hidden />}
          rightSection={<ChevronsUpDown size={15} aria-hidden opacity={0.6} />}
          aria-label="Refine factions by ruleset and complexity"
        >
          Refine{filtered ? ` (${activeCount})` : ''}
        </InputBase>
      </Popover.Target>
      <Popover.Dropdown style={PANEL_DROPDOWN_STYLE}>
        <Stack gap="md">
          {/* Inline single-select chips — no dropdown nested inside the pane. */}
          <Stack gap="xs">
            <Text size="xs" fw={700} tt="uppercase" c="dimmed">
              Ruleset
            </Text>
            <Group gap={6} role="radiogroup" aria-label="Filter factions by ruleset">
              {rulesetFilter.options.map((option) => {
                const selected = rulesetFilter.value === option.value;
                const count =
                  option.value === 'all'
                    ? scored.length
                    : scored.filter((entry) =>
                        entry.faction.rulesets.some((ruleset) => ruleset.slug === option.value)
                      ).length;
                return (
                  <Badge
                    key={option.value}
                    component="button"
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    variant={selected ? 'filled' : 'light'}
                    color={selected ? 'dune' : 'gray'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => rulesetFilter.onChange(option.value)}
                    rightSection={
                      <Text size="xs" span opacity={0.75}>
                        {count}
                      </Text>
                    }
                  >
                    {option.label}
                  </Badge>
                );
              })}
            </Group>
          </Stack>

          <Stack gap="xs">
            <Text size="xs" fw={700} tt="uppercase" c="dimmed">
              Complexity range
            </Text>
            <RangeSlider
              min={0}
              max={10}
              step={1}
              minRange={0}
              value={range}
              onChange={setRange}
              label={(value) => `${value}/10`}
              marks={[
                { value: 1, label: <TopicIcon topic={TIER_COPY.novice.icon} size={12} /> },
                { value: 4, label: <TopicIcon topic={TIER_COPY.intermediate.icon} size={12} /> },
                { value: 6, label: <TopicIcon topic={TIER_COPY.expert.icon} size={12} /> },
                { value: 9, label: <TopicIcon topic={TIER_COPY.master.icon} size={12} /> },
              ]}
              mb="md"
              aria-label="Filter by complexity range"
            />
          </Stack>

          <Group gap="xs" justify="space-between">
            <Text size="xs" c="dimmed">
              {filtered
                ? `${visible.length} of ${scored.length} factions`
                : `${scored.length} factions`}
            </Text>
            {filtered ? (
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                onClick={() => {
                  setRange([0, 10]);
                  rulesetFilter.onChange('all');
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

/** The band's sort select, complexity options included — sorting stays separate from filtering. */
export function PrototypeCatalogueSort({
  catalogue,
  sessionSort,
  className,
}: {
  catalogue: ReturnType<typeof usePrototypeCatalogue>;
  sessionSort: { value: string; onChange: (value: string) => void };
  className?: string;
}) {
  const { sort, setSort } = catalogue;
  const value = sort === 'none' ? sessionSort.value : sort === 'asc' ? 'cx-asc' : 'cx-desc';

  return (
    <Select
      className={className}
      variant="unstyled"
      value={value}
      data={[
        { value: 'name', label: 'Alphabetical (A–Z)' },
        { value: 'created', label: 'Chronological (created)' },
        { value: 'updated', label: 'Chronological (updated)' },
        { value: 'cx-asc', label: 'Complexity (low → high)' },
        { value: 'cx-desc', label: 'Complexity (high → low)' },
      ]}
      allowDeselect={false}
      onChange={(next) => {
        if (next === 'cx-asc' || next === 'cx-desc') {
          setSort(next === 'cx-asc' ? 'asc' : 'desc');
          return;
        }
        setSort('none');
        sessionSort.onChange(next ?? 'name');
      }}
      aria-label="Sort factions"
      leftSection={<ArrowDownAZ size={15} aria-hidden />}
    />
  );
}

export function PrototypeCatalogueList({
  catalogue,
  selectedRulesetSlug,
}: {
  catalogue: ReturnType<typeof usePrototypeCatalogue>;
  selectedRulesetSlug?: string;
}) {
  const { variant, visible } = catalogue;

  if (variant === 'B') {
    return (
      <Stack gap="xl">
        {TIER_ORDER.map((tier) => {
          const entries = visible.filter((entry) => entry.tier === tier);
          if (entries.length === 0) {
            return null;
          }
          return (
            <Stack key={tier} gap="sm">
              <Group gap="xs" align="center">
                <TopicIcon topic={TIER_COPY[tier].icon} size={20} />
                <Title order={2} size="h3">
                  {TIER_COPY[tier].label}
                </Title>
                <Text size="sm" c="dimmed">
                  {TIER_COPY[tier].blurb}
                </Text>
              </Group>
              <div className={factionListStyles['grid']}>
                {entries.map(({ faction }) => (
                  <div key={faction._id} style={{ position: 'relative' }}>
                    <FactionCard faction={faction} selectedRulesetSlug={selectedRulesetSlug} />
                    <div
                      style={TIER_BADGE_OVERLAY_STYLE}
                    >
                      <TierIconBadge tier={tier} />
                    </div>
                  </div>
                ))}
              </div>
            </Stack>
          );
        })}
      </Stack>
    );
  }

  /* A and C: the normal grid (same column rhythm as FactionList); every tile carries its tier icon
     bottom-right, and C adds the numeric detail beside it. */
  return (
    <div className={factionListStyles['grid']}>
      {visible.map(({ faction, score, tier }) => (
        <div key={faction._id} style={{ position: 'relative' }}>
          <FactionCard faction={faction} selectedRulesetSlug={selectedRulesetSlug} />
          <div style={TIER_BADGE_OVERLAY_STYLE}>
            <TierIconBadge tier={tier} detail={variant === 'C' ? `${outOfTen(score)}/10` : undefined} />
          </div>
        </div>
      ))}
    </div>
  );
}
