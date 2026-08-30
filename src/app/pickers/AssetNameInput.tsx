import { useEffect } from 'react';

import { useAssetSlugTaken } from '@app/db/assets';

import { UniqueNameInput } from './UniqueNameInput';
import type { NameConflict, NameHolder } from './UniqueNameInput';

/** The subscription half, mounted by `UniqueNameInput` only while a settled candidate exists. */
function AssetSlugProbe({
  type,
  slug,
  onAnswer,
}: {
  type: string;
  slug: string;
  onAnswer: (holder: NameHolder | null) => void;
}) {
  const holder = useAssetSlugTaken({ type, slug });
  useEffect(() => {
    onAnswer(holder ?? null);
  }, [holder, onAnswer]);
  return null;
}

/**
 * The asset editors' name field: `UniqueNameInput` bound to the assets table's own slug rule.
 * The save guard and this probe read one predicate, so the warning and the refusal can never disagree.
 * Another entity gets the same behavior by binding its own probe to `UniqueNameInput`, the way this does.
 */
export function AssetNameInput({
  type,
  value,
  onChange,
  currentSlug,
  onConflictChange,
  canRename,
  noun,
}: {
  type: string;
  value: string;
  onChange: (name: string) => void;
  currentSlug?: string;
  onConflictChange: (conflict: NameConflict | null) => void;
  canRename: boolean;
  /** What this asset is called in the locked field's explanation, as in "Only the token owner can rename it." */
  noun?: string;
}) {
  return (
    <UniqueNameInput
      value={value}
      onChange={onChange}
      currentSlug={currentSlug}
      onConflictChange={onConflictChange}
      canRename={canRename}
      noun={noun}
      probe={({ slug, onAnswer }) => <AssetSlugProbe key={slug} type={type} slug={slug} onAnswer={onAnswer} />}
    />
  );
}
