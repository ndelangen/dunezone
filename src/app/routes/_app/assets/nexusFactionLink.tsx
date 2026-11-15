import type { ReactNode } from 'react';

import { useNexusLinkedFaction } from '@db/factions';
import type { NexusDraft, NexusLinkedFaction } from '@app/widgets/card-editor/NexusCardEditor';

type LinkRead = NexusLinkedFaction | null | undefined;

function LinkedFactionRead({ id, render }: { id: string; render: (read: LinkRead) => ReactNode }) {
  return render(useNexusLinkedFaction(id));
}

/** Reads the Faction the draft's link leads to only while it links one; a card without a link holds no read. */
export function NexusFactionRead({ draft, render }: { draft: NexusDraft; render: (read: LinkRead) => ReactNode }) {
  return draft.factionLink ? <LinkedFactionRead id={draft.factionLink.id} render={render} /> : render(undefined);
}
