import { TextInput } from '@mantine/core';
import { slugify } from '@shared/slugify';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

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
 */
export function nameConflictComplaint({ holder, slug }: NameConflict): string {
  return holder === 'deleted'
    ? `its name is already taken ("${slug}" stays reserved by a deleted asset)`
    : `its name is already taken (another one lives at "${slug}")`;
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
  const [answer, setAnswer] = useState<NameHolder | null>(null);
  const slug = slugify(value);
  const candidate = slug.length > 0 && slug !== currentSlug ? slug : null;
  const [settled, setSettled] = useState<string | null>(candidate);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(candidate), 400);
    return () => clearTimeout(timer);
  }, [candidate]);
  const holder = candidate && settled === candidate ? answer : null;
  const conflict = holder && candidate ? { holder, slug: candidate } : null;

  /* Reported from an effect, not render: the parent stores it in state for the header. */
  const conflictKey = conflict ? `${conflict.holder}:${conflict.slug}` : null;
  useEffect(() => {
    onConflictChange(conflict);
    /* Keyed by content rather than identity, so a re-render with the same answer does not loop the parent's state. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflictKey]);

  return { settled, conflict, onAnswer: setAnswer };
}

/**
 * A name field that checks its address is free while the author types.
 *
 * A Picker in the taxonomy's sense: the one kind of control that may hold its own lazily-mounted subscription, so the page query never learns about candidate slugs.
 * Entity-blind by design — the `probe` prop carries the per-entity read, and a new entity joins by binding its own probe, not by touching this.
 * One assumption is baked in: names become addresses through the shared `slugify`.
 * The first entity that derives addresses differently, the way profiles carry their own validation, moves that mapping into the binding beside the probe.
 *
 * The candidate settles before the probe mounts: each distinct slug is a subscription swap, and a name typed letter by letter walks through every prefix.
 * The pause also keeps a colliding prefix from flashing a warning on the way to a free name.
 * Blank names and an edit page's unchanged name mount nothing at all.
 *
 * The conflict shows twice on purpose: inline under the field where the author is looking, and through `onConflictChange` so the route can raise it in the validation header, whose chip routes back to this chapter.
 */
export function UniqueNameInput({
  label = 'Name',
  value,
  onChange,
  currentSlug,
  probe,
  onConflictChange,
}: {
  label?: string;
  value: string;
  onChange: (name: string) => void;
  /** The entity's own slug on an edit page, so an unchanged name never warns about its own address. */
  currentSlug?: string;
  probe: NameAvailabilityProbe;
  onConflictChange: (conflict: NameConflict | null) => void;
}) {
  const { settled, conflict, onAnswer } = useSettledConflict({ value, currentSlug, onConflictChange });
  return (
    <>
      {settled ? probe({ slug: settled, onAnswer }) : null}
      <TextInput
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        error={conflict ? nameConflictComplaint(conflict) : undefined}
      />
    </>
  );
}
