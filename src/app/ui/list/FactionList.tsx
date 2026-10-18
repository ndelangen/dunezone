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
 * A List.
 * Callers hand it the entries;
 * this owns only the rhythm between them: the column count, which follows the list's own width, and the gap.
 * A card fills its column, so callers size the list by where they put it and never size the cards.
 * The tiles are self-framed, so this must sit in a `Section`, never on a `Card`'s pane.
 * Callers own the empty case.
 */
export function FactionList({ factions, selectedRulesetSlug, className }: FactionListProps) {
  return (
    <div className={[styles.list, className].filter(Boolean).join(' ')}>
      <div className={styles.grid}>
        {factions.map((faction) => (
          <FactionCard key={faction._id} faction={faction} selectedRulesetSlug={selectedRulesetSlug} />
        ))}
      </div>
    </div>
  );
}
