import { useFactionAccess, useFactionSharedFieldsAccess } from '@db/factions';
import type { Faction, FactionDetailPageData } from '@db/factions';
import type { FactionEditRights } from '@app/widgets/faction-editor/FactionFormFields';

import { draftWithinRights } from './factionEditRights';

/**
 * What the viewer may change on a variant's editor: the shared fields follow the Faction's owner and Group, everything else the variant's (#2926).
 * The editor opens for either, `resolved` waits for both answers, and `withinRights` keeps a draft to the sides the viewer may change.
 */
export function useFactionEditRights(page: FactionDetailPageData) {
  const variant = useFactionAccess(page);
  const shared = useFactionSharedFieldsAccess(page);
  const rights: FactionEditRights = { shared: shared.canEdit, variant: variant.viewerAccess.capabilities.edit };
  return {
    resolved: variant.resolved && shared.resolved,
    viewerAccess: variant.viewerAccess,
    rights,
    canOpenEditor: rights.shared || rights.variant,
    withinRights: (draft: Faction) => draftWithinRights(draft, page.faction.data, rights),
  };
}
