import { Text } from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import { RotateCcw } from 'lucide-react';

import { FactionTokenFace } from '../../routes/_app/play/multiplayer/FactionTokenFace';
import { CardGlyph, CardPreview, UnknownGlyph } from './CardArt';
import { SeenStrip } from './SeenStrip';
import { copyOf, unplaced } from './tracker';
import { AddCard, KindBar, SlotChip, kindSummary } from './TrackerParts';
import type { TrackerViewProps } from './TrackerParts';
import styles from './TreacheryTracker.module.css';

/**
 * Option A, Columns: a column per faction under its token, one line per card it holds, and a plus at the foot.
 * The cards Atreides saw run along the top, newest first, each wearing the token of whoever took it.
 */
export function ColumnsTracker({ factions, state, onAction }: TrackerViewProps) {
  const deck = unplaced(state);
  return (
    <div className={styles.view}>
      <SeenStrip factions={factions} state={state} onAction={onAction} />
      <div className={styles.columns} style={{ gridTemplateColumns: `repeat(${factions.length}, minmax(0, 1fr))` }}>
        {factions.map((faction) => {
          const slots = state.hands[faction.id] ?? [];
          return (
            <div key={faction.id} className={styles.column}>
              <div className={styles.columnHead}>
                <FactionTokenFace token={faction} size={30} />
                <span className={styles.count}>{slots.length}</span>
              </div>
              <div className={styles.columnSlots}>
                {slots.map((slot) => {
                  const card = slot.card ? copyOf(state, slot.card) : null;
                  return (
                    <SlotChip
                      key={slot.id}
                      faction={faction.id}
                      slot={slot}
                      factions={factions}
                      state={state}
                      onAction={onAction}
                    >
                      {card ? <CardGlyph card={card} size={26} /> : <UnknownGlyph size={26} />}
                    </SlotChip>
                  );
                })}
                <AddCard faction={faction} state={state} onAction={onAction} />
              </div>
            </div>
          );
        })}
      </div>
      <DeckFooter state={state} onAction={onAction} deckSize={deck.length} />
    </div>
  );
}

/** The deck and discard pile under a view: what is left to draw by kind, and the reshuffle. */
export function DeckFooter({
  state,
  onAction,
  deckSize,
}: Readonly<{ state: TrackerViewProps['state']; onAction: TrackerViewProps['onAction']; deckSize: number }>) {
  const deck = unplaced(state);
  const unknownInHands = Object.values(state.hands)
    .flat()
    .filter((slot) => slot.card === null).length;
  return (
    <div className={styles.footer}>
      <div className={styles.footerDeck}>
        <Text size="xs" className={styles.caption}>
          Deck {deckSize - unknownInHands}
        </Text>
        <KindBar copies={deck} />
        <Text size="xs" className={styles.dim}>
          An unknown card could be one of {kindSummary(deck)}
        </Text>
      </div>
      <div className={styles.footerDiscard}>
        <Text size="xs" className={styles.caption}>
          Discard {state.discard.length}
        </Text>
        <div className={styles.glyphRow}>
          {state.discard.slice(-6).map((card) => {
            const copy = copyOf(state, card);
            return (
              <CardPreview key={card} card={copy}>
                <span className={styles.discarded}>
                  <CardGlyph card={copy} size={18} />
                </span>
              </CardPreview>
            );
          })}
          {state.discard.length > 0 && (
            <IconAction
              label="Shuffle the discard pile back into the deck"
              icon={<RotateCcw size={12} />}
              size="xs"
              emphasis="quiet"
              onClick={() => onAction({ kind: 'reshuffle' })}
            />
          )}
        </div>
      </div>
    </div>
  );
}
