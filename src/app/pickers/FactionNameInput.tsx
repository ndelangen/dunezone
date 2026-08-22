import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { useFactionSlugTaken } from '@db/factions';

import { UniqueNameInput } from './UniqueNameInput';
import type { NameConflict, NameHolder } from './UniqueNameInput';

/** The subscription half, mounted by `UniqueNameInput` only while a settled candidate exists. */
function FactionSlugProbe({
  slug,
  onAnswer,
}: {
  slug: string;
  onAnswer: (holder: NameHolder | null) => void;
}) {
  const holder = useFactionSlugTaken({ slug });
  useEffect(() => {
    onAnswer(holder ?? null);
  }, [holder, onAnswer]);
  return null;
}

/**
 * The faction editors' name field: `UniqueNameInput` bound to the factions table's own slug rule.
 * The save guard and this probe read one predicate, so the warning and the refusal can never disagree.
 */
export function FactionNameInput({
  id,
  value,
  onChange,
  onBlur,
  currentSlug,
  onConflictChange,
  error,
}: {
  id?: string;
  value: string;
  onChange: (name: string) => void;
  onBlur?: () => void;
  currentSlug?: string;
  onConflictChange: (conflict: NameConflict | null) => void;
  error?: ReactNode;
}) {
  return (
    <UniqueNameInput
      label="Faction name"
      id={id}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      currentSlug={currentSlug}
      onConflictChange={onConflictChange}
      error={error}
      probe={({ slug, onAnswer }) => <FactionSlugProbe key={slug} slug={slug} onAnswer={onAnswer} />}
    />
  );
}
