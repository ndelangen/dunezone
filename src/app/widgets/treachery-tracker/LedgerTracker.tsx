import { Text, UnstyledButton } from '@mantine/core';
import { Fragment } from 'react';

import { FactionTokenFace } from '../../routes/_app/play/multiplayer/FactionTokenFace';
import { CardGlyph, CardPreview, UnknownGlyph } from './CardArt';
import { CARD_KINDS, KIND_LABEL, placeOf, unknownCount } from './tracker';
import type { CardCopy, TrackerState } from './tracker';
import type { TrackerViewProps } from './TrackerParts';
import styles from './TreacheryTracker.module.css';

/**
 * Option B, Ledger: the paper Atreides sheet, alive.
 * A row per card, a column per faction plus the deck and the discard pile, and a dot per copy where it is.
 * Clicking a cell moves a copy there;
 * every row always adds up to the deck's count.
 */
export function LedgerTracker({ factions, state, onAction }: TrackerViewProps) {
  const defs = uniqueDefs(state);
  const columns = [
    { id: 'deck' as const },
    ...factions.map((faction) => ({ id: faction.id, faction })),
    { id: 'discard' as const },
  ];
  const template = `minmax(0, 1fr) repeat(${columns.length}, 26px)`;
  return (
    <div className={styles.view}>
      <div className={styles.ledger} style={{ gridTemplateColumns: template }}>
        <span />
        {columns.map((column) =>
          'faction' in column && column.faction ? (
            <span key={column.id} className={styles.ledgerHead}>
              <FactionTokenFace token={column.faction} size={22} />
            </span>
          ) : (
            <span key={column.id} className={styles.ledgerHeadText}>
              {column.id === 'deck' ? 'Deck' : 'Disc.'}
            </span>
          )
        )}
        <span className={styles.ledgerName}>
          <UnknownGlyph size={16} />
          <span>Unknown</span>
        </span>
        {columns.map((column) =>
          'faction' in column && column.faction ? (
            <UnstyledButton
              key={column.id}
              className={styles.ledgerCell}
              aria-label={`${column.faction.name} gains an unknown card`}
              onClick={() => onAction({ kind: 'add', faction: column.id, card: null })}
            >
              <Dots count={unknownCount(state, column.id)} unknown />
            </UnstyledButton>
          ) : (
            <span key={column.id} />
          )
        )}
        {CARD_KINDS.map((kind) => (
          <Fragment key={kind}>
            <Text size="xs" className={styles.ledgerKind} style={{ gridColumn: `1 / span ${columns.length + 1}` }}>
              {KIND_LABEL[kind]}
            </Text>
            {defs
              .filter((def) => def.def.kind === kind)
              .map(({ def, copies }) => (
                <Fragment key={def.key}>
                  <CardPreview card={copies[0]!}>
                    <span className={styles.ledgerName}>
                      <CardGlyph card={copies[0]!} size={16} />
                      <span>{def.name}</span>
                    </span>
                  </CardPreview>
                  {columns.map((column) => {
                    const here = copies.filter((copy) => where(state, copy) === column.id);
                    return (
                      <UnstyledButton
                        key={column.id}
                        className={styles.ledgerCell}
                        data-column={column.id}
                        aria-label={`Move a ${def.name} to ${'faction' in column && column.faction ? column.faction.name : column.id}`}
                        onClick={() => move(state, copies, column.id, onAction)}
                      >
                        <Dots count={here.length} />
                      </UnstyledButton>
                    );
                  })}
                </Fragment>
              ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function Dots({ count, unknown = false }: Readonly<{ count: number; unknown?: boolean }>) {
  if (count === 0) {
    return <span className={styles.dotEmpty} />;
  }
  return (
    <span className={styles.dots} data-unknown={unknown ? 'true' : 'false'}>
      {count > 3 ? count : Array.from({ length: count }, (_, index) => <span key={index} className={styles.dot} />)}
    </span>
  );
}

function uniqueDefs(state: TrackerState) {
  const map = new Map<string, { def: CardCopy['def']; copies: CardCopy[] }>();
  for (const copy of state.copies) {
    const entry = map.get(copy.def.key);
    if (entry) {
      entry.copies.push(copy);
    } else {
      map.set(copy.def.key, { def: copy.def, copies: [copy] });
    }
  }
  return [...map.values()];
}

function where(state: TrackerState, copy: CardCopy): string {
  const place = placeOf(state, copy.id);
  return place.at === 'hand' ? place.faction : place.at;
}

/** Moves one copy into a column: preferably one still in the deck, otherwise the one placed longest ago. */
function move(state: TrackerState, copies: readonly CardCopy[], to: string, onAction: TrackerViewProps['onAction']) {
  const candidates = copies.filter((copy) => where(state, copy) !== to);
  const pick = candidates.find((copy) => where(state, copy) === 'deck') ?? candidates[0];
  if (!pick) {
    return;
  }
  if (to === 'deck' || to === 'discard') {
    onAction({ kind: 'place', card: pick.id, at: to });
  } else {
    onAction({ kind: 'add', faction: to, card: pick.id });
  }
}
