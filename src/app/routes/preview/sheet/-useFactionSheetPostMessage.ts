import { FactionInputSchema } from '@shared/factions/schema';
import { useLayoutEffect, useState } from 'react';

import type { Faction } from '@db/factions';

/** V1 postMessage from sheet iframe → parent: listener is ready, send current faction. */
type FactionSheetRequestMessageV1 = {
  v: 1;
  type: 'faction:sheet:request';
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

/**
 * Live preview: apply faction JSON from parent via postMessage. Only accepts same-origin messages
 * (adjust if you embed cross-origin later).
 */
export function useFactionSheetPostMessage(enabled: boolean) {
  const [faction, setFaction] = useState<Faction | null>(null);

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      const data = event.data;
      if (!isRecord(data)) {
        return;
      }
      if (data.v !== 1 || data.type !== 'faction:sheet:set') {
        return;
      }
      const parsed = FactionInputSchema.safeParse(data.payload);
      if (parsed.success) {
        setFaction(parsed.data);
      }
    };

    window.addEventListener('message', onMessage);

    if (window.parent !== window) {
      const request: FactionSheetRequestMessageV1 = { v: 1, type: 'faction:sheet:request' };
      window.parent.postMessage(request, window.location.origin);
    }

    return () => window.removeEventListener('message', onMessage);
  }, [enabled]);

  return faction;
}
