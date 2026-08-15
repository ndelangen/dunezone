/**
 * PROTOTYPE — THROWAWAY. Wayfinder ticket #404: how does the author set and read complexity in
 * the faction editor? Complexity is its own editor chapter (tab); a live indicator sits in the
 * authoring toolbar with a popover, reusing the same tier-glyph indicator as the catalogue. The
 * tab holds three variants of the auto ↔ manual model, switchable via the floating pill
 * (localStorage `prototype-404-variant`). Delete this file, the chapter entry in
 * `factionAuthoringContract.ts`, and the mounts once a variant wins. Calculation is the ticket-403
 * placeholder, shared for consistency.
 */
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Popover,
  Progress,
  Slider,
  Stack,
  Switch,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { TopicIcon } from '@ui/content/TopicIcon';
import { useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';

import type { FactionData } from '@db/factions';

import { FactionCard } from '@ui/block/FactionCard';

import type { FactionCatalogueEntry } from '@db/factions';

import {
  TIER_COPY,
  TierIconBadge,
  outOfTen,
  prototypeComplexity,
  prototypeTier,
} from '../../routes/_app/factions/-complexity-prototype';
import type { ComplexityTier } from '../../routes/_app/factions/-complexity-prototype';
import type { FactionFormApi } from './factionFormTypes';

/* Deviation advisory fires when |manual − calculated| reaches this many points (of 10). */
const DEVIATION_THRESHOLD = 3;

/* ------------------------------------------------------------------------------------------------
 * Variant plumbing — same pattern as ticket 403, separate storage key.
 * --------------------------------------------------------------------------------------------- */

const VARIANTS = ['A', 'B', 'C'] as const;
type EditorVariant = (typeof VARIANTS)[number];
const VARIANT_NAMES: Record<EditorVariant, string> = {
  A: 'Override switch',
  B: 'Ghost-marked slider',
  C: 'Side-by-side',
};
const STORAGE_KEY = 'prototype-404-variant';

function readVariant(): EditorVariant {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return (VARIANTS as readonly string[]).includes(raw ?? '') ? (raw as EditorVariant) : 'A';
}

const variantListeners = new Set<() => void>();
function setVariant(variant: EditorVariant) {
  window.localStorage.setItem(STORAGE_KEY, variant);
  for (const listener of variantListeners) {
    listener();
  }
}
function subscribeVariant(listener: () => void) {
  variantListeners.add(listener);
  return () => variantListeners.delete(listener);
}
function useEditorVariant(): EditorVariant {
  return useSyncExternalStore<EditorVariant>(subscribeVariant, readVariant, () => 'A');
}

/* ------------------------------------------------------------------------------------------------
 * Manual value store — shared between the Complexity tab and the toolbar indicator. The real
 * field would live on the form; the prototype fakes it module-locally, in points (0–10).
 * --------------------------------------------------------------------------------------------- */

let manualValue: number | null = null;
const manualListeners = new Set<() => void>();
function setManual(value: number | null) {
  manualValue = value;
  for (const listener of manualListeners) {
    listener();
  }
}
function subscribeManual(listener: () => void) {
  manualListeners.add(listener);
  return () => manualListeners.delete(listener);
}
function useManualComplexity(): number | null {
  return useSyncExternalStore(subscribeManual, () => manualValue, () => null);
}

/* ------------------------------------------------------------------------------------------------
 * Shared pieces
 * --------------------------------------------------------------------------------------------- */

function calc10Of(rules: FactionData['rules']): number {
  return outOfTen(prototypeComplexity({ rules } as FactionData));
}

function TierLabel({ score10 }: { score10: number }) {
  const tier = prototypeTier(score10 / 10);
  return (
    <Group gap={6} wrap="nowrap">
      <TopicIcon topic={TIER_COPY[tier].icon} size={16} />
      <Text size="sm" fw={700}>
        {TIER_COPY[tier].label}
      </Text>
      <Text size="sm" c="dimmed">
        {score10}/10
      </Text>
    </Group>
  );
}

/** Matches the editor's existing advisory tone: yellow, explicit about not blocking the save. */
function DeviationAdvisory({ manual10, calc10 }: { manual10: number; calc10: number }) {
  if (Math.abs(manual10 - calc10) < DEVIATION_THRESHOLD) {
    return null;
  }
  return (
    <Text c="yellow.9" size="xs" role="status">
      Your rating ({manual10}/10) sits far from the rules-text estimate ({calc10}/10). That can be
      right — word count is only a rough signal, and you know your table best — but a large gap is
      worth a second look. This is advisory and does not prevent saving.
    </Text>
  );
}

function CapacityHint({ calc10 }: { calc10: number }) {
  if (calc10 < 9) {
    return null;
  }
  return (
    <Text c="yellow.9" size="xs" role="status">
      The rules text is approaching the printed sheet&rsquo;s capacity — consider trimming so it
      stays readable at the table. This is advisory and does not prevent saving.
    </Text>
  );
}

const SLIDER_MARKS = [
  { value: 1, label: <TopicIcon topic={TIER_COPY.novice.icon} size={12} /> },
  { value: 4, label: <TopicIcon topic={TIER_COPY.intermediate.icon} size={12} /> },
  { value: 6, label: <TopicIcon topic={TIER_COPY.expert.icon} size={12} /> },
  { value: 9, label: <TopicIcon topic={TIER_COPY.master.icon} size={12} /> },
];

/* ------------------------------------------------------------------------------------------------
 * Toolbar indicator — the catalogue's tier-glyph indicator, live, with a summary popover.
 * --------------------------------------------------------------------------------------------- */

/** Animated donut ring around the tier glyph: empty at 0, a full circle at 1. */
function DonutTierIcon({ tier, score }: { tier: ComplexityTier; score: number }) {
  const size = 34;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.18}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-accent-strong, #c47f17)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, score)))}
          style={{ transition: 'stroke-dashoffset 400ms ease' }}
        />
      </svg>
      <TopicIcon topic={TIER_COPY[tier].icon} size={16} />
    </span>
  );
}

/** Always shows the rules-text estimate — never the author's manual rating. */
export function PrototypeComplexityToolbarIndicator({ form }: { form: FactionFormApi }) {
  const manual = useManualComplexity();
  return (
    <form.Subscribe selector={(state: { values: FactionData }) => state.values.rules}>
      {(rules) => {
        const calc10 = calc10Of(rules);
        const tier = prototypeTier(calc10 / 10);
        return (
          <Popover position="bottom-end" shadow="md" width={300}>
            <Popover.Target>
              <Tooltip label={`Complexity ${calc10}/10 · ${TIER_COPY[tier].label}`}>
                <UnstyledButton
                  aria-label={`Faction complexity: ${calc10} out of 10`}
                  style={{ display: 'inline-flex', alignItems: 'center' }}
                >
                  <DonutTierIcon tier={tier} score={calc10 / 10} />
                </UnstyledButton>
              </Tooltip>
            </Popover.Target>
            <Popover.Dropdown
              style={{
                background:
                  'linear-gradient(var(--panel-bg), var(--panel-bg)), var(--mantine-color-body, #f4ead8)',
                border: '2px solid var(--panel-border)',
                borderRadius: 'var(--panel-radius)',
                boxShadow: 'var(--panel-shadow)',
              }}
            >
              <Stack gap="sm">
                <TierLabel score10={calc10} />
                <Progress value={calc10 * 10} size="sm" aria-hidden />
                <Text size="xs" c="dimmed">
                  {TIER_COPY[tier].blurb}
                </Text>
                <Text size="xs" c="dimmed">
                  Estimated live from the rules text. Set your own rating in the Complexity tab.
                </Text>
                {manual !== null ? <DeviationAdvisory manual10={manual} calc10={calc10} /> : null}
                <CapacityHint calc10={calc10} />
              </Stack>
            </Popover.Dropdown>
          </Popover>
        );
      }}
    </form.Subscribe>
  );
}

/**
 * Artifact-workbench proof for the Complexity chapter: the catalogue's faction card, carrying the
 * effective rating (author's manual value when set, else the estimate) exactly as the catalogue
 * shows it. Inert — the proof is for looking at, not navigating.
 */
export function PrototypeComplexityCardProof({ faction }: { faction: FactionData }) {
  const manual = useManualComplexity();
  const shown10 = manual ?? calc10Of(faction.rules);
  const tier = prototypeTier(shown10 / 10);
  const entry = {
    _id: 'complexity-proof',
    slug: 'complexity-proof',
    rulesets: [],
    data: faction,
  } as unknown as FactionCatalogueEntry;

  return (
    <div style={{ position: 'relative', pointerEvents: 'none' }}>
      <FactionCard faction={entry} />
      <div style={{ position: 'absolute', bottom: '4.5%', right: '5%', zIndex: 5 }}>
        <TierIconBadge tier={tier} detail={`${shown10}/10`} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * The Complexity chapter — three auto ↔ manual models
 * --------------------------------------------------------------------------------------------- */

export function PrototypeComplexityChapter({ form }: { form: FactionFormApi }) {
  return (
    <form.Subscribe selector={(state: { values: FactionData }) => state.values.rules}>
      {(rules) => <ChapterBody rules={rules} />}
    </form.Subscribe>
  );
}

function ChapterBody({ rules }: { rules: FactionData['rules'] }) {
  const variant = useEditorVariant();
  const manual = useManualComplexity();
  const calc10 = calc10Of(rules);

  return (
    <Stack gap="sm" aria-label="Faction complexity (prototype)">
      <Group gap="xs" justify="space-between" wrap="nowrap">
        <Text c="dimmed" size="sm">
          How hard this faction is to play, shown in the catalogue and on the faction page. Leave it
          on auto to follow your rules text, or set it yourself — you know your table best.
        </Text>
        {manual === null ? (
          <Badge variant="light" color="gray" size="sm">
            Auto
          </Badge>
        ) : (
          <Badge variant="light" color="dune" size="sm">
            Manual
          </Badge>
        )}
      </Group>

      {variant === 'A' ? (
        <Stack gap="sm">
          {manual === null ? (
            <Group gap="md" wrap="nowrap" align="center">
              <TierLabel score10={calc10} />
              <Progress value={calc10 * 10} size="sm" style={{ flex: '1 1 auto' }} aria-hidden />
            </Group>
          ) : (
            <Slider
              min={0}
              max={10}
              step={1}
              value={manual}
              onChange={setManual}
              label={(value) => `${value}/10`}
              marks={SLIDER_MARKS}
              mb="md"
              aria-label="Manual complexity rating"
            />
          )}
          <Switch
            size="sm"
            label="Set the rating manually"
            checked={manual !== null}
            onChange={(event) => setManual(event.currentTarget.checked ? calc10 : null)}
          />
          <Text size="xs" c="dimmed">
            {manual === null
              ? 'Estimated live from your rules text.'
              : `Rules-text estimate: ${calc10}/10.`}
          </Text>
          {manual !== null ? <DeviationAdvisory manual10={manual} calc10={calc10} /> : null}
          <CapacityHint calc10={calc10} />
        </Stack>
      ) : null}

      {variant === 'B' ? (
        <Stack gap="sm">
          <Slider
            min={0}
            max={10}
            step={1}
            value={manual ?? calc10}
            onChange={setManual}
            label={(value) => `${value}/10`}
            marks={[
              ...SLIDER_MARKS,
              {
                value: calc10,
                label: (
                  <Text size="xs" fw={700} c="dune.8">
                    auto·{calc10}
                  </Text>
                ),
              },
            ]}
            mb="lg"
            aria-label="Complexity rating"
          />
          <Group gap="xs" justify="space-between">
            <TierLabel score10={manual ?? calc10} />
            {manual !== null ? (
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                onClick={() => setManual(null)}
              >
                Revert to auto
              </Button>
            ) : (
              <Text size="xs" c="dimmed">
                Following your rules text — drag to take over.
              </Text>
            )}
          </Group>
          {manual !== null ? <DeviationAdvisory manual10={manual} calc10={calc10} /> : null}
          <CapacityHint calc10={calc10} />
        </Stack>
      ) : null}

      {variant === 'C' ? (
        <Stack gap="sm">
          <Group gap="md" wrap="nowrap" align="center">
            <Text size="xs" c="dimmed" w="7rem">
              From rules text
            </Text>
            <Progress value={calc10 * 10} size="sm" style={{ flex: '1 1 auto' }} aria-hidden />
            <TierLabel score10={calc10} />
          </Group>
          <Checkbox
            size="sm"
            label="Publish my own rating instead"
            checked={manual !== null}
            onChange={(event) => setManual(event.currentTarget.checked ? calc10 : null)}
          />
          {manual !== null ? (
            <Group gap="md" wrap="nowrap" align="center">
              <Text size="xs" c="dimmed" w="7rem">
                Your rating
              </Text>
              <Slider
                min={0}
                max={10}
                step={1}
                value={manual}
                onChange={setManual}
                label={(value) => `${value}/10`}
                style={{ flex: '1 1 auto' }}
                aria-label="Manual complexity rating"
              />
              <TierLabel score10={manual} />
            </Group>
          ) : null}
          {manual !== null ? <DeviationAdvisory manual10={manual} calc10={calc10} /> : null}
          <CapacityHint calc10={calc10} />
        </Stack>
      ) : null}

      <PrototypeEditorSwitcher />
    </Stack>
  );
}

/** Floating variant pill — rendered by the Complexity chapter, where flipping matters. */
export function PrototypeEditorSwitcher() {
  const variant = useEditorVariant();
  if (import.meta.env.PROD) {
    return null;
  }
  const cycle = (delta: number) => {
    const index = (VARIANTS.indexOf(variant) + delta + VARIANTS.length) % VARIANTS.length;
    setVariant(VARIANTS[index] as EditorVariant);
  };
  return (
    <div style={PILL_STYLE}>
      <button
        type="button"
        onClick={() => cycle(-1)}
        style={PILL_BUTTON_STYLE}
        aria-label="Previous variant"
      >
        ←
      </button>
      <span>
        {variant} — {VARIANT_NAMES[variant]}
      </span>
      <button
        type="button"
        onClick={() => cycle(1)}
        style={PILL_BUTTON_STYLE}
        aria-label="Next variant"
      >
        →
      </button>
    </div>
  );
}

const PILL_STYLE: CSSProperties = {
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
};

const PILL_BUTTON_STYLE: CSSProperties = {
  background: 'transparent',
  color: 'inherit',
  border: '1px solid #555',
  borderRadius: 999,
  width: 26,
  height: 26,
  cursor: 'pointer',
};
