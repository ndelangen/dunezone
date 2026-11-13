import { useFactionAccess, useFactionSharedFieldsAccess } from '@db/factions';
import type { FactionDetailPageData } from '@db/factions';
import type { FactionEditRights } from '@app/widgets/faction-editor/FactionFormFields';

/**
 * What the viewer may change on a variant's editor: the shared fields follow the Faction's owner and Group, everything else the variant's (#2926).
 * The editor opens for either, and `resolved` waits for both answers.
 */
export function useFactionEditRights(page: FactionDetailPageData) {
  const variant = useFactionAccess(page);
  const shared = useFactionSharedFieldsAccess(page);
  const rights: FactionEditRights = { shared: shared.canEdit, variant: variant.viewerAccess.capabilities.edit };
  return { resolved: variant.resolved && shared.resolved, rights, canOpenEditor: rights.shared || rights.variant };
}
