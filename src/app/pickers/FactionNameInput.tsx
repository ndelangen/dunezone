import { useEffect } from 'react';

import { useFactionSlugTaken } from '@app/db/factions';

import { UniqueNameInput } from './UniqueNameInput';
import type { NameConflict, NameHolder } from './UniqueNameInput';

/** The subscription half, mounted by `UniqueNameInput` only while a settled candidate exists. */
function FactionSlugProbe({ slug, onAnswer }: { slug: string; onAnswer: (holder: NameHolder | null) => void }) {
  const holder = useFactionSlugTaken({ slug });
  useEffect(() => {
    onAnswer(holder ?? null);
  }, [holder, onAnswer]);
  return null;
}

/**
 * The faction editor's name field: `UniqueNameInput` bound to the factions table's own slug rule.
 * The save guard and this probe read one predicate, so the warning and the refusal can never disagree.
 *
 * Unlike an asset's, a faction's slug is unique across the whole table rather than per type, so the probe carries no scope.
 */
export function FactionNameInput({
  value,
  onChange,
  onBlur,
  currentSlug,
  error,
  onConflictChange,
  canRename,
}: {
  value: string;
  onChange: (name: string) => void;
  onBlur?: () => void;
  currentSlug?: string;
  error?: string;
  onConflictChange: (conflict: NameConflict | null) => void;
  canRename?: boolean;
}) {
  return (
    <UniqueNameInput
      /* The id the validation header's chip focuses, kept from the field this replaces. */
      id="faction-name"
      label="Faction name"
      error={error}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      currentSlug={currentSlug}
      onConflictChange={onConflictChange}
      canRename={canRename}
      noun="faction"
      probe={({ slug, onAnswer }) => <FactionSlugProbe key={slug} slug={slug} onAnswer={onAnswer} />}
    />
  );
}
