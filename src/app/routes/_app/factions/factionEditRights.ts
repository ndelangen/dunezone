import { splitSharedFields } from '@shared/factions/sharedFields';

import type { Faction } from '@db/factions';
import type { FactionEditRights } from '@app/widgets/faction-editor/FactionFormFields';

/**
 * The draft with each side the viewer may not change put back to what is stored.
 * The server refuses a save that changes the other side, and a loaded draft or a Faction maintainer's newer save would otherwise carry such a change in.
 */
export function draftWithinRights(draft: Faction, stored: Faction, rights: FactionEditRights): Faction {
  const proposed = splitSharedFields(draft);
  const kept = splitSharedFields(stored);
  return {
    ...(rights.variant ? proposed.variant : kept.variant),
    ...(rights.shared ? proposed.shared : kept.shared),
  };
}
