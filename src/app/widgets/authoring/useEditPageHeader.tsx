import { PageLayout } from '@ui/layout/PageLayout';
import type { ReactNode } from 'react';

import { useValidationHeader } from './useValidationHeader';
import type { ValidationHeaderState } from './useValidationHeader';
import { ValidationHeader } from './ValidationHeader';
import type { ValidationHeaderWarning } from './ValidationHeader';

export type EditPageHeader = Omit<ValidationHeaderState, 'open'> & {
  /**
   * The page's header band, ready to drop into `PageLayout` as a child, and `null` while the band is closed.
   * Render it as `{header.slot}` rather than wrapping it in anything.
   */
  slot: ReactNode;
};

/**
 * The edit-page header, as one call: a page that gates its band keeps it collapsed until there are warnings (#897).
 * Eleven of the twelve routes that render `ValidationHeader` do that today.
 * The twelfth, faction create, mounts its band unconditionally and carries other content in it, so it cannot use this hook as written;
 * conforming it is #921's step 2.
 *
 * Takes the page's warnings and where each one focuses, and answers with the band itself plus the two signals the editor owes the latch.
 * Hand `settle` to the editor's blur capture and chapter switch, and put every action that replaces the draft wholesale through `releasing`.
 *
 * This is a hook returning an element rather than a component wrapping one, and that is forced rather than chosen.
 * `PageLayout` finds its slots by walking its direct children and matching on component identity, so it recognises a `PageLayout.Header` element and nothing else.
 * A wrapper component that renders one is itself the child, and the layout sees a stranger: measured, a page whose header came from a wrapper rendered `data-page-layout-compact="true"` with no band at all, which is worse than an empty band because that attribute is how a page declares itself deliberately headerless and the shell sizes the artwork from it.
 * Nothing in the toolchain catches that, which is the whole of #444.
 * Returning the element from a hook keeps the real `PageLayout.Header` in the caller's own children, where the walk can find it.
 */
export function useEditPageHeader<W extends ValidationHeaderWarning>({
  warnings,
  onFocusWarning,
}: {
  warnings: W[];
  onFocusWarning: (warning: W) => void;
}): EditPageHeader {
  const { open, settle, releasing } = useValidationHeader(warnings.length);

  return {
    settle,
    releasing,
    slot: open ? (
      <PageLayout.Header size="compact">
        <ValidationHeader warnings={warnings} onFocusWarning={onFocusWarning} />
      </PageLayout.Header>
    ) : null,
  };
}
