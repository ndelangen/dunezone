import { prepareRawFaction } from '@db/authoring';
import type { Faction } from '@db/factions';
import type { RawLoadSource } from '@app/widgets/authoring/LoadExisting';

/** Raw corrections keep the supplied persistent component identities. */
export function rawFactionLoad(currentName?: string, canRename = false): RawLoadSource<Faction> {
  return {
    validate: async (text) => {
      const draft = await prepareRawFaction(text);
      return { name: draft.name, draft };
    },
    ...(currentName === undefined
      ? {}
      : { rename: { currentName, allowed: canRename, apply: (draft: Faction, name: string) => ({ ...draft, name }) } }),
  };
}
