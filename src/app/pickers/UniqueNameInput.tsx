import { Group, Text, UnstyledButton } from '@mantine/core';
import { TextInput } from '@mantine/core';
import { slugify } from '@shared/slugify';
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import styles from './UniqueNameInput.module.css';

/** Who holds the candidate's address: a living entity, a deleted one whose slug stays reserved, or nobody. */
export type NameHolder = 'live' | 'deleted';

export type NameConflict = { holder: NameHolder; slug: string };

/**
 * One entity's availability read, as a component: mounted with the settled slug, it subscribes and reports who holds the address.
 * The per-entity pickers supply it, which is what keeps this input entity-blind while every entity can wear it.
 */
export type NameAvailabilityProbe = (props: {
  slug: string;
  onAnswer: (holder: NameHolder | null) => void;
}) => ReactNode;

/**
 * The one sentence a name conflict speaks on the client, shared by the field's inline error and the validation header's chip so the two cannot drift.
 * It mirrors the save guard's own distinction: a living holder and a deleted one reserving its address are different answers.
 * Noun-free on purpose, the way this input is entity-blind: the field sits in an editor that has already told the reader what they are naming, and a noun here would be one more place per entity to keep true.
 */
export function nameConflictComplaint({ holder, slug }: NameConflict): string {
  return holder === 'deleted'
    ? `its name is already taken ("${slug}" stays reserved by a deleted one)`
    : `its name is already taken (another one lives at "${slug}")`;
}

/**
 * The way out of a taken name (#624): candidate names derived from the one that collided.
 * A trailing number counts up so "Shield 2" offers "Shield 3" rather than "Shield 2 2";
 * anything else numbers from 2.
 * Derived client-side and unverified on purpose, per the ticket's own costing: the field's single settled probe checks whichever one the reader picks, so the offer never claims freeness it has not asked about, and no second subscription exists.
 */
export function nameWayOut(value: string): string[] {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const numbered = /^(.*?)[ -](\d+)$/.exec(trimmed);
  if (numbered) {
    const next = Number(numbered[2]) + 1;
    return [`${numbered[1]} ${next}`, `${numbered[1]} ${next + 1}`];
  }
  return [`${trimmed} 2`, `${trimmed} 3`];
}

/** The slug worth asking about: non-empty and not the entity's own address. */
function candidateSlug(value: string, currentSlug?: string): string | null {
  const slug = slugify(value);
  return slug.length > 0 && slug !== currentSlug ? slug : null;
}

/** The verdict that applies right now: only an answer about the settled candidate itself may speak. */
function activeConflict({
  candidate,
  settled,
  answer,
}: {
  candidate: string | null;
  settled: string | null;
  answer: { slug: string; holder: NameHolder | null } | null;
}): NameConflict | null {
  if (!candidate || settled !== candidate || answer?.slug !== candidate) {
    return null;
  }
  return answer.holder ? { holder: answer.holder, slug: candidate } : null;
}

/**
 * The settle-and-ask half of the field: the candidate slug, its debounce, the probe's answer, and the reported conflict.
 * Apart from the rendering so the component is a plain view of its result.
 */
function useSettledConflict({
  value,
  currentSlug,
  onConflictChange,
}: {
  value: string;
  currentSlug?: string;
  onConflictChange: (conflict: NameConflict | null) => void;
}) {
  const [answer, setAnswer] = useState<{ slug: string; holder: NameHolder | null } | null>(null);
  const candidate = candidateSlug(value, currentSlug);
  const [settled, setSettled] = useState<string | null>(candidate);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(candidate), 400);
    return () => clearTimeout(timer);
  }, [candidate]);
  /* The answer carries the slug it was asked about, so a swapped probe can never lend an old verdict to a new name. */
  const onAnswer = useCallback(
    (holder: NameHolder | null) => setAnswer(settled ? { slug: settled, holder } : null),
    [settled]
  );
  const conflict = activeConflict({ candidate, settled, answer });

  /* Reported from an effect, not render: the parent stores it in state for the header. */
  const conflictKey = conflict ? `${conflict.holder}:${conflict.slug}` : null;
  useEffect(() => {
    onConflictChange(conflict);
    /* Keyed by content rather than identity, so a re-render with the same answer does not loop the parent's state. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflictKey]);

  return { settled, conflict, onAnswer };
}

/**
 * A name field that checks its address is free while the author types.
 *
 * A Picker in the taxonomy's sense: the one kind of control that may hold its own lazily-mounted subscription, so the page query never learns about candidate slugs.
 * Entity-blind by design: the `probe` prop carries the per-entity read, and a new entity joins by binding its own probe, not by touching this.
 * One assumption is baked in: names become addresses through the shared `slugify`.
 * The first entity that derives addresses differently, the way profiles carry their own validation, moves that mapping into the binding beside the probe.
 *
 * The candidate settles before the probe mounts: each distinct slug is a subscription swap, and a name typed letter by letter walks through every prefix.
 * The pause also keeps a colliding prefix from flashing a warning on the way to a free name.
 * Blank names and an edit page's unchanged name mount nothing at all.
 *
 * The conflict shows twice on purpose: inline under the field where the author is looking, and through `onConflictChange` so the route can raise it in the validation header, whose chip routes back to this chapter.
 *
 * A viewer who may edit but not rename gets the field disabled with the reason beside it, rather than a control that accepts a name the server will refuse.
 */
export function UniqueNameInput({
  id,
  label = 'Name',
  value,
  onChange,
  onBlur,
  currentSlug,
  error,
  probe,
  onConflictChange,
  canRename,
  noun = 'entity',
}: {
  /** The field's DOM id, so a validation header chip can focus it by id the way the faction editor does. */
  id?: string;
  label?: string;
  value: string;
  onChange: (name: string) => void;
  /** For hosts whose form tracks blur, so the field this replaces loses none of its wiring. */
  onBlur?: () => void;
  /** The entity's own slug on an edit page, so an unchanged name never warns about its own address. */
  currentSlug?: string;
  /** The caller's own complaint about the name, a blank one for instance. A conflict outranks it, and the two cannot coincide: a blank name has no candidate to conflict with. */
  error?: string;
  probe: NameAvailabilityProbe;
  onConflictChange: (conflict: NameConflict | null) => void;
  /**
   * Whether this viewer may rename the entity, which only an owner may (#605).
   * A rename recalculates the slug and moves the public URL with no redirect left behind, so it is an identity change rather than an edit, and an active collaborator keeps every other control.
   * Required rather than defaulting to enabled: a caller that forgets it would render a field the server refuses, which is the state this exists to remove.
   */
  canRename: boolean;
  /** What the entity is called in the locked field's explanation, as in "Only the faction owner can rename it." */
  noun?: string;
}) {
  const { settled, conflict, onAnswer } = useSettledConflict({ value, currentSlug, onConflictChange });
  return (
    <>
      {settled ? probe({ slug: settled, onAnswer }) : null}
      <TextInput
        id={id}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onBlur={onBlur}
        error={conflict ? nameConflictComplaint(conflict) : error}
        disabled={!canRename}
        description={canRename ? undefined : `Only the ${noun} owner can rename it.`}
      />
      {conflict ? (
        <Group gap="xs" mt={4}>
          <Text size="sm" c="dimmed">
            Try instead:
          </Text>
          {nameWayOut(value).map((candidate) => (
            <UnstyledButton key={candidate} className={styles.wayOut} onClick={() => onChange(candidate)}>
              {candidate}
            </UnstyledButton>
          ))}
        </Group>
      ) : null}
    </>
  );
}
