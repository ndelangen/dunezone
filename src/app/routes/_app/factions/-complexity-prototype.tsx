/**
 * PROTOTYPE — THROWAWAY. Wayfinder ticket #403: how should the faction complexity rating look on
 * the browsing surfaces? Three variants of the complexity treatment, switchable via `?variant=`
 * (A/B/C) and arrow keys, mounted on the existing /factions catalogue and /factions/$factionId
 * detail routes. Delete this file (and its mounts) once a variant wins; nothing here is production
 * code — the real calculation ships from the shared module decided on the map.
 */
import { Badge, Button, Checkbox, Group, Popover, Select, Stack, Text, Title } from '@mantine/core';
import { FactionCard } from '@ui/block/FactionCard';
import { TopicIcon } from '@ui/content/TopicIcon';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import factionListStyles from '@ui/list/FactionList.module.css';
import { SlidersHorizontal } from 'lucide-react';
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

const TIER_COPY: Record<
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
function TierIconBadge({ tier, detail }: { tier: ComplexityTier; detail?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        color: 'var(--mantine-color-white)',
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

const outOfTen = (score: number) => Math.round(score * 10);

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
    if (target && (target.closest('input, textarea, select, [contenteditable]') || target.isContentEditable)) {
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
  const [tierFilter, setTierFilter] = useState<ComplexityTier[]>([]);
  const [sort, setSort] = useState<'none' | 'asc' | 'desc'>('none');

  const scored = factions.map((faction) => {
    const score = scoreOf(faction.data);
    return { faction, score, tier: prototypeTier(score) };
  });

  let visible = scored;
  if (tierFilter.length > 0) {
    visible = scored.filter((entry) => tierFilter.includes(entry.tier));
  }
  if (sort !== 'none') {
    visible = [...visible].sort((a, b) => (sort === 'asc' ? a.score - b.score : b.score - a.score));
  }

  return { variant, tierFilter, setTierFilter, sort, setSort, scored, visible };
}

export type PrototypeRulesetFilter = {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
};

/**
 * The single refine control: one popover combining the ruleset filter, complexity-tier checkboxes,
 * and complexity sort. Lives inside the toolbar's joined filter band; selecting a ruleset AND/OR
 * tiers narrows the grid immediately.
 */
export function PrototypeCatalogueControls({
  catalogue,
  rulesetFilter,
}: {
  catalogue: ReturnType<typeof usePrototypeCatalogue>;
  rulesetFilter: PrototypeRulesetFilter;
}) {
  const { tierFilter, setTierFilter, sort, setSort, scored, visible } = catalogue;

  const toggleTier = (tier: ComplexityTier) => {
    setTierFilter((current) =>
      current.includes(tier) ? current.filter((entry) => entry !== tier) : [...current, tier]
    );
  };

  const rulesetActive = rulesetFilter.value !== 'all';
  const activeCount = tierFilter.length + (rulesetActive ? 1 : 0);
  const activeRulesetLabel = rulesetFilter.options.find(
    (option) => option.value === rulesetFilter.value
  )?.label;

  return (
    <Group gap="xs" align="center" wrap="nowrap">
      <Popover position="bottom-start" shadow="md" width={300}>
        <Popover.Target>
          <Button
            size="compact-sm"
            variant="subtle"
            color="dune"
            leftSection={<SlidersHorizontal size={14} aria-hidden />}
          >
            Refine{activeCount > 0 ? ` (${activeCount})` : ''}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="md">
            {activeCount > 0 || sort !== 'none' ? (
              <Group gap="xs">
                {rulesetActive && activeRulesetLabel ? (
                  <Badge
                    variant="light"
                    color="gray"
                    style={{ cursor: 'pointer' }}
                    rightSection="×"
                    onClick={() => rulesetFilter.onChange('all')}
                  >
                    {activeRulesetLabel}
                  </Badge>
                ) : null}
                {tierFilter.map((tier) => (
                  <Badge
                    key={tier}
                    variant="light"
                    color={TIER_COPY[tier].color}
                    style={{ cursor: 'pointer' }}
                    rightSection="×"
                    onClick={() => toggleTier(tier)}
                  >
                    {TIER_COPY[tier].label}
                  </Badge>
                ))}
                <Text size="xs" c="dimmed">
                  {visible.length} of {scored.length} factions
                </Text>
              </Group>
            ) : null}
            <Stack gap="xs">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                Ruleset
              </Text>
              <Select
                size="xs"
                value={rulesetFilter.value}
                data={rulesetFilter.options}
                onChange={(value) => rulesetFilter.onChange(value ?? 'all')}
                aria-label="Filter factions by ruleset"
                allowDeselect={false}
              />
            </Stack>
            <Stack gap="xs">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                Complexity tier
              </Text>
              {TIER_ORDER.map((tier) => (
                <Checkbox
                  key={tier}
                  size="sm"
                  checked={tierFilter.includes(tier)}
                  onChange={() => toggleTier(tier)}
                  label={
                    <Group gap={6} wrap="nowrap">
                      <TopicIcon topic={TIER_COPY[tier].icon} size={14} />
                      <span>{TIER_COPY[tier].label}</span>
                      <Text size="xs" c="dimmed" span>
                        {scored.filter((entry) => entry.tier === tier).length}
                      </Text>
                    </Group>
                  }
                />
              ))}
            </Stack>
            <Stack gap="xs">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                Sort
              </Text>
              <Select
                size="xs"
                value={sort}
                onChange={(value) => setSort((value as 'none' | 'asc' | 'desc') ?? 'none')}
                data={[
                  { value: 'none', label: 'Default order' },
                  { value: 'asc', label: 'Complexity: low → high' },
                  { value: 'desc', label: 'Complexity: high → low' },
                ]}
                aria-label="Sort by complexity"
                allowDeselect={false}
              />
            </Stack>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Group>
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
