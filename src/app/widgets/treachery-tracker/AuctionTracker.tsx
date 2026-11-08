import { Text } from '@mantine/core';

import { FactionTokenFace } from '../../routes/_app/play/multiplayer/FactionTokenFace';
import { CardBanner, CardGlyph, UnknownGlyph } from './CardArt';
import { DeckFooter } from './ColumnsTracker';
import { SeenStrip } from './SeenStrip';
import { copyOf, placeOf, unplaced } from './tracker';
import { AddCard, FactionPicker, SlotChip } from './TrackerParts';
import type { TrackerViewProps } from './TrackerParts';
import styles from './TreacheryTracker.module.css';

/**
 * Option C, Auction first: the card on bid fills the top, readable as its own name banner, and one click on a token records the winner.
 * The hands below are one row per faction, so the whole table fits in a pinned slot without scrolling.
 */
export function AuctionTracker({ factions, state, onAction }: TrackerViewProps) {
  const onBid = state.seen.find((sighting) => placeOf(state, sighting.card).at === 'deck');
  const card = onBid ? copyOf(state, onBid.card) : null;
  return (
    <div className={styles.view}>
      {card ? (
        <div className={styles.onBid}>
          <Text size="xs" className={styles.caption}>
            On bid · who won it?
          </Text>
          <CardBanner card={card} width="100%" />
          <FactionPicker
            factions={factions}
            size={30}
            label={(faction) => `${faction.name} won ${card.def.name}`}
            onPick={(faction) => onAction({ kind: 'add', faction, card: card.id })}
          />
        </div>
      ) : (
        <div className={styles.onBid}>
          <Text size="xs" className={styles.dim}>
            Nothing on bid. The next card you look at appears here.
          </Text>
        </div>
      )}
      <SeenStrip factions={factions} state={state} onAction={onAction} size={22} />
      <div className={styles.rows}>
        {factions.map((faction) => {
          const slots = state.hands[faction.id] ?? [];
          return (
            <div key={faction.id} className={styles.row}>
              <FactionTokenFace token={faction} size={26} />
              <div className={styles.rowCards}>
                {slots.map((slot) => {
                  const copy = slot.card ? copyOf(state, slot.card) : null;
                  return (
                    <SlotChip
                      key={slot.id}
                      faction={faction.id}
                      slot={slot}
                      factions={factions}
                      state={state}
                      onAction={onAction}
                    >
                      {copy ? <CardGlyph card={copy} size={24} /> : <UnknownGlyph size={24} />}
                    </SlotChip>
                  );
                })}
                <AddCard faction={faction} state={state} onAction={onAction} />
              </div>
            </div>
          );
        })}
      </div>
      <DeckFooter state={state} onAction={onAction} deckSize={unplaced(state).length} />
    </div>
  );
}
