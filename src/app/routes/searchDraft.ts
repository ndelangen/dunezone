import { useEffect, useState } from 'react';

/** How long a search box waits after the last keystroke before the search becomes the page's address. */
const QUERY_COMMIT_DELAY_MS = 300;

/**
 * A catalogue search box: the box holds uncommitted keystrokes, the address holds the search.
 * Typing settles into the address after a pause, as Enter and leaving the field do at once.
 * When the address changes under the box (a history step, an arriving link, a reset) the box follows it, so the two never disagree.
 * `commit` writes the search into the address;
 * it must be stable across renders or the pause restarts on every one.
 */
export function useSearchDraft(committed: string, commit: (query: string) => void) {
  const [draft, setDraft] = useState(committed);
  const [seeded, setSeeded] = useState(committed);
  /* Reset during render, so a back button that restores an older search never paints the newer one first. */
  if (committed !== seeded) {
    setSeeded(committed);
    setDraft(committed);
  }

  useEffect(() => {
    if (draft.trim() === committed) {
      return;
    }
    const timer = setTimeout(() => commit(draft), QUERY_COMMIT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [committed, draft, commit]);

  return {
    value: draft,
    change: setDraft,
    commit: () => {
      if (draft.trim() !== committed) {
        commit(draft);
      }
    },
  };
}
