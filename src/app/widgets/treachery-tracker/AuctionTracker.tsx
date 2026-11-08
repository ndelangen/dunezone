import { Popover, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import { NotebookPen } from 'lucide-react';
import { useState } from 'react';

import { FactionTokenFace } from '../../routes/_app/play/multiplayer/FactionTokenFace';
import type { FactionToken } from '../../routes/_app/play/multiplayer/FactionTokenFace';
import { CardBanner, CardGlyph, UnknownGlyph } from './CardArt';
import { DeckFooter } from './ColumnsTracker';
import { SeenStrip } from './SeenStrip';
import { awaitingWinner, copyOf, currentTurn, unplaced } from './tracker';
import { AddCard, CardChooser, FactionPicker, SlotChip } from './TrackerParts';
import type { TrackerViewProps } from './TrackerParts';
import styles from './TreacheryTracker.module.css';

/* Card glyphs in the hands, and the faction tokens beside them. */
const GLYPH = 34;
const TOKEN = 34;

/**
 * Option C, Auction first: the card on bid fills the top, readable as its own name banner, and one click on a token records the winner.
 * A card can also come up unknown: its winner gets an unknown card, which Atreides names later from that hand.
 * The hands below are one row per faction, each with a line of Atreides's own notes, such as what that faction cannot have.
 */
export function AuctionTracker({ factions, state, onAction }: TrackerViewProps) {
  const onBid = state.seen.find((sighting) => awaitingWinner(state, sighting));
  const card = onBid?.card ? copyOf(state, onBid.card) : null;
  const name = card ? card.def.name : 'the unknown card';
  return (
    <div className={styles.view}>
      <div className={styles.onBid}>
        {onBid ? (
          <>
            <Text size="xs" className={styles.caption}>
              On bid · who won it?
            </Text>
            {card ? <CardBanner card={card} width="100%" /> : <UnknownBanner />}
            <FactionPicker
              factions={factions}
              size={TOKEN}
              label={(faction) => `${faction.name} won ${name}`}
              onPick={(faction) => onAction({ kind: 'win', sighting: onBid.id, faction })}
            />
          </>
        ) : (
          <Text size="xs" className={styles.dim}>
            Nothing on bid. In Play, the next card you look at appears here.
          </Text>
        )}
        <NextUp state={state} onAction={onAction} />
      </div>
      <SeenStrip factions={factions} state={state} onAction={onAction} size={28} />
      <div className={styles.rows}>
        {factions.map((faction) => (
          <HandRow key={faction.id} faction={faction} factions={factions} state={state} onAction={onAction} />
        ))}
      </div>
      <DeckFooter state={state} onAction={onAction} deckSize={unplaced(state).length} />
    </div>
  );
}

/** An unknown card on bid, in the shape of a name banner. */
function UnknownBanner() {
  return (
    <span className={styles.unknownBanner}>
      <UnknownGlyph size={26} />
      Unknown card
    </span>
  );
}

/** Putting the next card up for bid by hand: an unknown one, or one picked from the deck. In Play, peeking does this. */
function NextUp({ state, onAction }: Pick<TrackerViewProps, 'state' | 'onAction'>) {
  const [open, setOpen] = useState(false);
  const turn = currentTurn(state);
  return (
    <div className={styles.nextUp}>
      <Text size="xs" className={styles.dim}>
        Next up for bid:
      </Text>
      <UnstyledButton className={styles.textButton} onClick={() => onAction({ kind: 'bid', card: null, turn })}>
        An unknown card
      </UnstyledButton>
      <Popover opened={open} onChange={setOpen} position="bottom" withinPortal shadow="md" width={280}>
        <Popover.Target>
          <UnstyledButton className={styles.textButton} onClick={() => setOpen((was) => !was)}>
            A card from the deck…
          </UnstyledButton>
        </Popover.Target>
        <Popover.Dropdown className={styles.dropdown}>
          <CardChooser
            state={state}
            allowUnknown={false}
            onPick={(card) => {
              onAction({ kind: 'bid', card, turn });
              setOpen(false);
            }}
          />
        </Popover.Dropdown>
      </Popover>
    </div>
  );
}

function HandRow({ faction, factions, state, onAction }: TrackerViewProps & Readonly<{ faction: FactionToken }>) {
  const slots = state.hands[faction.id] ?? [];
  const note = state.notes[faction.id] ?? '';
  const [editing, setEditing] = useState(false);
  return (
    <div className={styles.row}>
      <FactionTokenFace token={faction} size={TOKEN} />
      <div className={styles.rowBody}>
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
                {copy ? <CardGlyph card={copy} size={GLYPH} /> : <UnknownGlyph size={GLYPH} />}
              </SlotChip>
            );
          })}
          <AddCard faction={faction} state={state} onAction={onAction} />
          {!editing && (
            <IconAction
              label={note ? `Edit your note on ${faction.name}` : `Add a note on ${faction.name}`}
              tooltip={note ? undefined : 'Add a note, such as which cards they cannot have'}
              icon={<NotebookPen size={13} />}
              size="sm"
              emphasis="silent"
              onClick={() => setEditing(true)}
            />
          )}
        </div>
        {editing ? (
          <TextInput
            size="xs"
            autoFocus
            defaultValue={note}
            maxLength={120}
            placeholder="No poison defense, kept the Lasgun…"
            aria-label={`Your note on ${faction.name}`}
            onBlur={(event) => {
              onAction({ kind: 'note', faction: faction.id, text: event.currentTarget.value.trim() });
              setEditing(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
              if (event.key === 'Escape') {
                setEditing(false);
              }
            }}
          />
        ) : (
          note && (
            <UnstyledButton className={styles.note} onClick={() => setEditing(true)}>
              {note}
            </UnstyledButton>
          )
        )}
      </div>
    </div>
  );
}
