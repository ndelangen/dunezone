/**
 * PROTOTYPE — THROWAWAY. Wayfinder ticket #404: how does the author set and read complexity in
 * the faction editor? Decided model, prototyped here for final review:
 *
 * - Complexity is its own editor chapter (tab); the tab icon is the tier icon of the current
 *   effective rating.
 * - The toolbar carries a donut-ringed tier glyph that ALWAYS shows the rules-text estimate.
 * - The chapter is an override-switch model: the slider is always visible, disabled while the
 *   rating is automatic; toggling manual off keeps the slider's value but stores nothing (absent
 *   field = auto in the db).
 * - The artifact workbench shows the catalogue's faction card with the effective rating.
 *
 * Delete this file, the chapter entry in `factionAuthoringContract.ts`, and the mounts once the
 * real field ships. Calculation is the ticket-403 placeholder, shared for consistency.
 */
import {
  Badge,
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
import { FactionCard } from '@ui/block/FactionCard';
import { TopicIcon } from '@ui/content/TopicIcon';
import { useSyncExternalStore } from 'react';

import type { FactionCatalogueEntry, FactionData } from '@db/factions';

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
 * Manual rating store — shared between the chapter, the tab icon, and the card proof. The real
 * field would live on the form; the prototype fakes it module-locally, in points (0–10). The value
 * survives toggling manual off; only `active` decides whether it would be stored in the db.
 * --------------------------------------------------------------------------------------------- */

type ManualRating = { value: number | null; active: boolean };

let manualRating: ManualRating = { value: null, active: false };
const manualListeners = new Set<() => void>();
function patchManual(patch: Partial<ManualRating>) {
  manualRating = { ...manualRating, ...patch };
  for (const listener of manualListeners) {
    listener();
  }
}
function subscribeManual(listener: () => void) {
  manualListeners.add(listener);
  return () => manualListeners.delete(listener);
}
const SERVER_MANUAL: ManualRating = { value: null, active: false };
function useManualRating(): ManualRating {
  return useSyncExternalStore(
    subscribeManual,
    () => manualRating,
    () => SERVER_MANUAL
  );
}

/* ------------------------------------------------------------------------------------------------
 * Shared pieces
 * --------------------------------------------------------------------------------------------- */

function calc10Of(rules: FactionData['rules']): number {
  return outOfTen(prototypeComplexity({ rules } as FactionData));
}

function effective10(manual: ManualRating, calc10: number): number {
  return manual.active && manual.value !== null ? manual.value : calc10;
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
 * Toolbar indicator — always the rules-text estimate, never the author's manual rating.
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
  const manual = useManualRating();
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
                  {TIER_COPY[prototypeTier(calc10 / 10)].blurb}
                </Text>
                <Text size="xs" c="dimmed">
                  Estimated live from the rules text. Set your own rating in the Complexity tab.
                </Text>
                {manual.active && manual.value !== null ? (
                  <DeviationAdvisory manual10={manual.value} calc10={calc10} />
                ) : null}
                <CapacityHint calc10={calc10} />
              </Stack>
            </Popover.Dropdown>
          </Popover>
        );
      }}
    </form.Subscribe>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Chapter tab icon — the tier icon of the current effective rating.
 * --------------------------------------------------------------------------------------------- */

export function PrototypeComplexityChapterIcon({ form }: { form: FactionFormApi }) {
  const manual = useManualRating();
  return (
    <form.Subscribe selector={(state: { values: FactionData }) => state.values.rules}>
      {(rules) => {
        const shown10 = effective10(manual, calc10Of(rules));
        return <TopicIcon topic={TIER_COPY[prototypeTier(shown10 / 10)].icon} size={21} />;
      }}
    </form.Subscribe>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Artifact-workbench proof — the catalogue's faction card with the effective rating.
 * --------------------------------------------------------------------------------------------- */

/** Inert — the proof is for looking at, not navigating. */
export function PrototypeComplexityCardProof({ faction }: { faction: FactionData }) {
  const manual = useManualRating();
  const shown10 = effective10(manual, calc10Of(faction.rules));
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
 * The Complexity chapter — override-switch model.
 * --------------------------------------------------------------------------------------------- */

export function PrototypeComplexityChapter({ form }: { form: FactionFormApi }) {
  return (
    <form.Subscribe selector={(state: { values: FactionData }) => state.values.rules}>
      {(rules) => <ChapterBody rules={rules} />}
    </form.Subscribe>
  );
}

function ChapterBody({ rules }: { rules: FactionData['rules'] }) {
  const manual = useManualRating();
  const calc10 = calc10Of(rules);
  /* Disabled slider keeps a previously chosen value; before any choice it tracks the estimate. */
  const slider10 = manual.value ?? calc10;

  return (
    <Stack gap="sm" aria-label="Faction complexity (prototype)">
      <Group gap="xs" justify="space-between" wrap="nowrap">
        <Text c="dimmed" size="sm">
          How hard this faction is to play, shown in the catalogue and on the faction page. Leave it
          on auto to follow your rules text, or set it yourself — you know your table best.
        </Text>
        <Badge variant="light" color={manual.active ? 'dune' : 'gray'} size="sm">
          {manual.active ? 'Manual' : 'Auto'}
        </Badge>
      </Group>

      <Slider
        min={0}
        max={10}
        step={1}
        value={slider10}
        onChange={(value) => patchManual({ value })}
        disabled={!manual.active}
        label={(value) => `${value}/10`}
        marks={SLIDER_MARKS}
        mb="md"
        aria-label="Manual complexity rating"
      />

      <Switch
        size="sm"
        label="Set the rating manually"
        checked={manual.active}
        onChange={(event) =>
          patchManual(
            event.currentTarget.checked
              ? { active: true, value: manual.value ?? calc10 }
              : { active: false }
          )
        }
      />

      <Text size="xs" c="dimmed">
        {manual.active
          ? `Rules-text estimate: ${calc10}/10. Your rating is saved with the faction.`
          : 'Automatic — following your rules text. Nothing is stored; the rating tracks your edits.'}
      </Text>

      {manual.active && manual.value !== null ? (
        <DeviationAdvisory manual10={manual.value} calc10={calc10} />
      ) : null}
      <CapacityHint calc10={calc10} />
    </Stack>
  );
}
