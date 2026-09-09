import type { LiveQueryResult } from '@db/core/live';
import type { RulebookEditorPageData } from '@db/rulebooks';

type RulebookEditorQueryState = {
  locator: string;
  data: RulebookEditorPageData | null | undefined;
};

type RulebookEditorQueryUpdate = LiveQueryResult<RulebookEditorPageData | null> & { locator: string };

/* A replacement reference query must not unmount the editing session while it loads.
 * Settled access and deletion results always replace the retained bundle.
 */
export function receiveRulebookEditorQuery(
  current: RulebookEditorQueryState,
  next: RulebookEditorQueryUpdate
): RulebookEditorQueryState {
  if (current.locator === next.locator && (next.isPending || current.data === next.data)) {
    return current;
  }
  return { locator: next.locator, data: next.data };
}
