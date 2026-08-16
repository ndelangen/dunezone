import type { FactionCatalogueEntry } from '@db/factions';

import { FactionCard } from '../block/FactionCard';
import styles from './FactionList.module.css';

export type FactionListProps = {
  factions: FactionCatalogueEntry[];
  selectedRulesetSlug?: string;
  className?: string;
};

/**
 * Factions, as a grid of `FactionCard` tiles.
 *
 * A List — callers hand it the entries and this owns only the rhythm between them: the column count per breakpoint and the gap.
 * The tiles are self-framed, so this must sit in a `Section`, never on a `Card`'s pane.
 * Callers own the empty case.
 */
export function FactionList({ factions, selectedRulesetSlug, className }: FactionListProps) {
  return (
    <div className={[styles.grid, className].filter(Boolean).join(' ')}>
      {factions.map((faction) => (
        <FactionCard key={faction._id} faction={faction} selectedRulesetSlug={selectedRulesetSlug} />
      ))}
    </div>
  );
}
