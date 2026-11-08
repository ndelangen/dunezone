import { Popover, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import { ChevronLeft, ChevronRight, CircleHelp, Layers, NotebookPen } from 'lucide-react';
import { useState } from 'react';

import { FactionTokenFace } from '../../routes/_app/play/multiplayer/FactionTokenFace';
import type { FactionToken } from '../../routes/_app/play/multiplayer/FactionTokenFace';
import styles from './AuctionTracker.module.css';
import { CardGlyph, CardPreview, UnknownGlyph } from './CardArt';
import { DeckFooter } from './DeckFooter';
import { awaitingWinner, copyOf, currentTurn, sightingCard, unplaced } from './tracker';
import type { Sighting } from './tracker';
import { AddCard, CHOOSER_WIDTH, CardChooser, FactionPicker, SlotChip, holderOf } from './TrackerParts';
import type { TrackerViewProps } from './TrackerParts';

/* One size for every card and token in the hands, so the rows line up on a single grid. */
const GLYPH = 36;

/**
 * Option C, Auction first: the card on bid, whole, beside the tokens that record who won it.
 * Below it the cards of one turn's auction, then a row per faction: its token, the cards Atreides knows it holds, and a note.
 * Sections are split by rules, not boxed, so the window is the only panel.
 */
export function AuctionTracker({ factions, state, onAction }: TrackerViewProps) {
  return (
    <div className={styles.tracker}>
      <OnBid factions={factions} state={state} onAction={onAction} />
      <Auctions factions={factions} state={state} onAction={onAction} />
      <section className={styles.hands} aria-label="Hands">
        {factions.map((faction) => (
          <HandRow key={faction.id} faction={faction} factions={factions} state={state} onAction={onAction} />
        ))}
      </section>
      <DeckFooter factions={factions} state={state} onAction={onAction} deckSize={unplaced(state).length} />
    </div>
  );
}

function OnBid({ factions, state, onAction }: TrackerViewProps) {
  const onBid = state.seen.find((sighting) => awaitingWinner(state, sighting));
  const card = onBid?.card ? copyOf(state, onBid.card) : null;
  const name = card ? card.def.name : 'the unknown card';
  return (
    <section className={styles.onBid} aria-label="On bid">
      <div className={styles.bidCard}>
        {card ? (
          <CardPreview card={card}>
            <img src={card.def.face} alt={card.def.name} />
          </CardPreview>
        ) : onBid ? (
          <span className={styles.bidUnknown} data-empty="false">
            ?
          </span>
        ) : (
          <EmptyBid state={state} onAction={onAction} />
        )}
      </div>
      <div className={styles.bidSide}>
        <Text size="xs" className={styles.caption}>
          {onBid ? 'On bid · who won it?' : 'Nothing on bid'}
        </Text>
        {onBid ? (
          <FactionPicker
            factions={factions}
            size={GLYPH}
            label={(faction) => `${faction.name} won ${name}`}
            onPick={(faction) => onAction({ kind: 'win', sighting: onBid.id, faction })}
          />
        ) : (
          <Text size="sm" className={styles.dim}>
            Click the empty card to put the next one up for bid.
          </Text>
        )}
        <NextUp state={state} onAction={onAction} />
      </div>
    </section>
  );
}

/** The empty place of the card on bid: clicking it picks the card that comes up next, or an unknown one. */
function EmptyBid({ state, onAction }: Pick<TrackerViewProps, 'state' | 'onAction'>) {
  const [open, setOpen] = useState(false);
  const turn = currentTurn(state);
  return (
    <Popover opened={open} onChange={setOpen} position="bottom-start" withinPortal shadow="md" width={CHOOSER_WIDTH}>
      <Popover.Target>
        <UnstyledButton
          className={styles.bidUnknown}
          data-empty="true"
          aria-label="Pick the card up next"
          onClick={() => setOpen((was) => !was)}
        />
      </Popover.Target>
      <Popover.Dropdown className={styles.dropdown}>
        <CardChooser
          state={state}
          allowUnknown
          onPick={(card) => {
            onAction({ kind: 'bid', card, turn });
            setOpen(false);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

/** Putting the next card up for bid by hand: an unknown one, or one from the deck. In Play, peeking does this. */
function NextUp({ state, onAction }: Pick<TrackerViewProps, 'state' | 'onAction'>) {
  const [open, setOpen] = useState(false);
  const turn = currentTurn(state);
  return (
    <div className={styles.nextUp}>
      <IconAction
        label="Unknown card up next"
        icon={<CircleHelp size={15} />}
        size="sm"
        emphasis="quiet"
        onClick={() => onAction({ kind: 'bid', card: null, turn })}
      />
      <Popover opened={open} onChange={setOpen} position="bottom" withinPortal shadow="md" width={CHOOSER_WIDTH}>
        <Popover.Target>
          <span>
            <IconAction
              label="Card up next…"
              icon={<Layers size={15} />}
              size="sm"
              emphasis="quiet"
              pressed={open}
              onClick={() => setOpen((was) => !was)}
            />
          </span>
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

/** One turn's auction at a time, newest first; the arrows step to the turns before. */
function Auctions({ factions, state, onAction }: TrackerViewProps) {
  const turns = [...new Set(state.seen.map((sighting) => sighting.turn))].sort((a, b) => b - a);
  const [picked, setPicked] = useState<number | null>(null);
  const turn = picked !== null && turns.includes(picked) ? picked : turns[0];
  if (turn === undefined) {
    return null;
  }
  const index = turns.indexOf(turn);
  const cards = state.seen.filter((sighting) => sighting.turn === turn);
  return (
    <section className={styles.section} aria-label={`Auction of turn ${turn}`}>
      <div className={styles.sectionHead}>
        <Text size="xs" className={styles.caption}>
          Auction
        </Text>
        <div className={styles.turnStep}>
          <IconAction
            label="Earlier turn"
            icon={<ChevronLeft size={14} />}
            size="sm"
            emphasis="quiet"
            disabledReason={index < turns.length - 1 ? undefined : 'This is the first auction.'}
            onClick={() => setPicked(turns[index + 1]!)}
          />
          <Text size="sm" className={styles.turnLabel}>
            Turn {turn}
          </Text>
          <IconAction
            label="Later turn"
            icon={<ChevronRight size={14} />}
            size="sm"
            emphasis="quiet"
            disabledReason={index > 0 ? undefined : 'This is the latest auction.'}
            onClick={() => setPicked(turns[index - 1]!)}
          />
        </div>
      </div>
      <div className={styles.cardRow}>
        {[...cards].reverse().map((sighting) => (
          <AuctionCard key={sighting.id} sighting={sighting} factions={factions} state={state} onAction={onAction} />
        ))}
      </div>
    </section>
  );
}

function AuctionCard({ sighting, factions, state, onAction }: TrackerViewProps & Readonly<{ sighting: Sighting }>) {
  const [open, setOpen] = useState(false);
  const card = sightingCard(state, sighting);
  const copy = card ? copyOf(state, card) : null;
  const holder = holderOf(state, factions, sighting);
  const waiting = awaitingWinner(state, sighting);
  const name = copy ? copy.def.name : 'Unknown card';
  return (
    <Popover opened={open} onChange={setOpen} position="bottom" withinPortal shadow="md">
      <Popover.Target>
        <span className={styles.auctionCard} data-waiting={waiting ? 'true' : 'false'}>
          <CardPreview card={copy}>
            <button
              type="button"
              className={styles.cardButton}
              aria-label={waiting ? `${name}: who won it?` : name}
              onClick={() => waiting && setOpen((was) => !was)}
            >
              {copy ? <CardGlyph card={copy} size={GLYPH} /> : <UnknownGlyph size={GLYPH} />}
            </button>
          </CardPreview>
          {holder && holder !== 'discard' && (
            <span className={styles.holder}>
              <FactionTokenFace token={holder} size={18} />
            </span>
          )}
          {holder === 'discard' && <span className={styles.discardedMark} aria-hidden />}
        </span>
      </Popover.Target>
      <Popover.Dropdown className={styles.dropdown}>
        <Text size="xs" className={styles.caption} mb={8}>
          {name}: who won it?
        </Text>
        <FactionPicker
          factions={factions}
          size={32}
          label={(faction) => `${faction.name} won ${copy ? copy.def.name : 'the unknown card'}`}
          onPick={(faction) => {
            onAction({ kind: 'win', sighting: sighting.id, faction });
            setOpen(false);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

function HandRow({ faction, factions, state, onAction }: TrackerViewProps & Readonly<{ faction: FactionToken }>) {
  const slots = state.hands[faction.id] ?? [];
  const note = state.notes[faction.id] ?? '';
  const [editing, setEditing] = useState(false);
  return (
    <div className={styles.handRow}>
      <FactionTokenFace token={faction} size={GLYPH} />
      <div className={styles.handCards}>
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
      </div>
      <IconAction
        label={note ? `Edit your note on ${faction.name}` : `Add a note on ${faction.name}`}
        tooltip={note ? undefined : 'Add a note, such as which cards they cannot have'}
        icon={<NotebookPen size={15} />}
        size="sm"
        emphasis="quiet"
        pressed={editing}
        onClick={() => setEditing((was) => !was)}
      />
      {editing ? (
        <TextInput
          className={styles.note}
          size="xs"
          ref={(input) => input?.focus()}
          defaultValue={note}
          maxLength={120}
          placeholder="Which cards they cannot have…"
          aria-label={`Your note on ${faction.name}`}
          onBlur={(event) => {
            onAction({
              kind: 'note',
              faction: faction.id,
              text: event.currentTarget.value.trim(),
            });
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
          <Text size="xs" className={styles.note} data-text>
            {note}
          </Text>
        )
      )}
    </div>
  );
}
