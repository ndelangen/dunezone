import { Popover, Stack, Text, UnstyledButton } from '@mantine/core';
import { LabeledAction } from '@ui/control/LabeledAction';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { FactionTokenFace } from '../../routes/_app/play/multiplayer/FactionTokenFace';
import { CardGlyph, UnknownGlyph } from './CardArt';
import { SeenStrip } from './SeenStrip';
import { CARD_GROUPS, copyOf, groupOf, unplaced } from './tracker';
import { AddCard, GroupList, KindBar, SlotChip, kindSummary } from './TrackerParts';
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
      <DiscardPile state={state} onAction={onAction} />
    </div>
  );
}

/** The discard pile as one icon and its count; clicking it lists the pile by group, as the deck bar does, with the reshuffle. */
function DiscardPile({ state, onAction }: Pick<TrackerViewProps, 'state' | 'onAction'>) {
  const [open, setOpen] = useState(false);
  const pile = state.discard.map((card) => copyOf(state, card));
  return (
    <Popover opened={open} onChange={setOpen} position="top-end" withinPortal shadow="md" width={320}>
      <Popover.Target>
        <UnstyledButton
          className={styles.discardButton}
          aria-label={`Discard pile: ${pile.length} cards`}
          onClick={() => setOpen((was) => !was)}
        >
          <Trash2 size={16} aria-hidden />
          <span>{pile.length}</span>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown className={styles.dropdown}>
        <Stack gap={10}>
          {pile.length === 0 ? (
            <Text size="sm" className={styles.dim}>
              The discard pile is empty.
            </Text>
          ) : (
            CARD_GROUPS.filter((group) => pile.some((copy) => groupOf(copy.def) === group)).map((group) => (
              <GroupList key={group} group={group} copies={pile} suffix="discarded" />
            ))
          )}
          {pile.length > 0 && (
            <LabeledAction
              size="xs"
              icon={<RotateCcw size={14} />}
              onClick={() => {
                onAction({ kind: 'reshuffle' });
                setOpen(false);
              }}
            >
              Shuffle back into the deck
            </LabeledAction>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
