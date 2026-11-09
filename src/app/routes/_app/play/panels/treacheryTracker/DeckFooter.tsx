import { Popover, Stack, Text, UnstyledButton } from '@mantine/core';
import { LabeledAction } from '@ui/control/LabeledAction';
import { ChevronLeft, Layers, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';

import styles from './DeckFooter.module.css';
import { CARD_GROUPS, copyOf, drawPile, groupOf } from './tracker';
import type { CardCopy } from './tracker';
import { FactionPicker, GroupList, KindBar, MenuLine, kindSummary } from './TrackerParts';
import type { TrackerViewProps } from './TrackerParts';

/** The deck and discard pile under a view: what is left to draw by kind, and the reshuffle. */
export function DeckFooter({ factions, state, onAction }: TrackerViewProps) {
  const { copies: deck, count } = drawPile(state);
  return (
    <div className={styles.footer}>
      <div className={styles.footerDeck}>
        <Text size="xs" className={styles.caption}>
          Deck {count}
        </Text>
        <KindBar copies={deck} />
        <Text size="xs" className={styles.dim}>
          An unknown card could be one of {kindSummary(deck)}
        </Text>
      </div>
      <DiscardPile factions={factions} state={state} onAction={onAction} />
    </div>
  );
}

/**
 * The discard pile as one icon and its count;
 * clicking it lists the pile by group, as the deck bar does, with the reshuffle.
 * Clicking a card in the list puts it back into the deck, or into a faction's hand.
 */
function DiscardPile({ factions, state, onAction }: TrackerViewProps) {
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState<CardCopy | null>(null);
  const pile = state.discard.map((card) => copyOf(state, card));
  const close = () => {
    setOpen(false);
    setMoving(null);
  };
  return (
    <Popover
      opened={open}
      onChange={(next) => (next ? setOpen(true) : close())}
      position="top-end"
      withinPortal
      shadow="md"
      width={320}
    >
      <Popover.Target>
        <UnstyledButton
          className={styles.discardButton}
          aria-label={`Discard pile: ${pile.length} ${pile.length === 1 ? 'card' : 'cards'}`}
          onClick={() => (open ? close() : setOpen(true))}
        >
          <Trash2 size={16} aria-hidden />
          <span>{pile.length}</span>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown className={styles.dropdown}>
        {moving ? (
          <Stack gap={10}>
            <Text size="xs" className={styles.caption}>
              Where does {moving.def.name} go?
            </Text>
            <Stack gap={2}>
              <MenuLine
                icon={<Layers size={14} />}
                onClick={() => {
                  onAction({ kind: 'place', card: moving.id, at: 'deck' });
                  close();
                }}
              >
                Back into the deck
              </MenuLine>
            </Stack>
            <Stack gap={6}>
              <Text size="xs" className={styles.caption}>
                Into a hand
              </Text>
              <FactionPicker
                factions={factions}
                size={28}
                label={(faction) => `${moving.def.name} into ${faction.name}'s hand`}
                onPick={(faction) => {
                  onAction({ kind: 'add', faction, card: moving.id });
                  close();
                }}
              />
            </Stack>
            <MenuLine icon={<ChevronLeft size={14} />} onClick={() => setMoving(null)}>
              Back to the discard pile
            </MenuLine>
          </Stack>
        ) : (
          <Stack gap={10}>
            {pile.length === 0 ? (
              <Text size="sm" className={styles.dim}>
                The discard pile is empty.
              </Text>
            ) : (
              CARD_GROUPS.filter((group) => pile.some((copy) => groupOf(copy.def) === group)).map((group) => (
                <GroupList key={group} group={group} copies={pile} suffix="discarded" onPick={setMoving} />
              ))
            )}
            {pile.length > 0 && (
              <LabeledAction
                size="xs"
                icon={<RotateCcw size={14} />}
                onClick={() => {
                  onAction({ kind: 'reshuffle' });
                  close();
                }}
              >
                Shuffle back into the deck
              </LabeledAction>
            )}
          </Stack>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
