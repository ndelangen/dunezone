import { renewFactionComponentIds } from '@shared/factions/componentIdentity';

import type { Faction } from '@db/factions';
import { FactionPicker } from '@app/pickers/FactionPicker';
import type { LoadSource } from '@app/widgets/authoring/LoadExisting';

/** The faction an edit page has open: left out of the choices, and its saved name kept. */
type EditedFaction = Readonly<{ slug: string; name: string }>;

/**
 * The faction editors' load source for `LoadExisting`: the faction picker, reporting each selection so the frame can confirm it.
 * Factions are not Assets, so this is the one load source that does not go through `assetLoadSource`.
 *
 * The editor wants a draft, not a row, so this is where the picked faction's identifiers are dropped: loading one into a draft only needs its data, with fresh component ids so the copy shares none with its source.
 * On an edit page the loaded draft keeps the edited faction's name, as every asset editor's does, so loading never renames it or moves its address.
 */
export function factionLoadSource(editing?: EditedFaction): LoadSource<Faction> {
  return (report) => (
    <FactionPicker
      commitOnSelect
      excludeSlugs={editing ? [editing.slug] : []}
      copy={{
        errorTitle: 'Faction could not be loaded',
        emptyMessage: 'No different faction is available to load right now.',
      }}
      onUnusable={() => report({ kind: 'error', message: 'This faction could not be loaded. Choose another.' })}
      onPick={(picked) =>
        report({
          kind: 'chosen',
          name: picked.data.name,
          draft: renewFactionComponentIds(editing ? { ...picked.data, name: editing.name } : picked.data),
        })
      }
    />
  );
}
