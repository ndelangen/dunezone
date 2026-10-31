import { UnstyledButton } from '@mantine/core';
import clsx from 'clsx';
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { SEATS } from './palette';
import styles from './SeatLens.module.css';

/*
 * The figure for how secrets stay secret: one table as the room keeps it, and the copy each seat gets of it.
 * The copies follow the room's own projection: your hand with its faces, other hands as a count only, a face-down card as its back and the word on it, a peek as a marker for everyone and the face for the peeker alone, and a battle plan private until the reveal.
 * The card names on the wire are scrambled per game and change with every shuffle, so the figure's ids come from a seed the Shuffle button replaces.
 */

type Seat = 'atreides' | 'harkonnen' | 'spectator';

const SEAT_ORDER: readonly Seat[] = ['atreides', 'harkonnen', 'spectator'];

const ATREIDES_HAND = ['Lasgun', 'Shield', 'Karama'] as const;
const HARKONNEN_HAND = ['Chaumas', 'Crysknife', 'Baliset', 'Truthtrance'] as const;
/** The top of the treachery deck, top card first. */
const DECK = ['Weirding Way', 'Stunner', 'Cheap Hero'] as const;
const PLANNED = 'Crysknife';

/** A short scrambled name for a card, standing in for the HMAC the room uses; stable for a seed, different for the next. */
function scrambled(name: string, seed: number): string {
  let hash = seed ^ 2_654_435_769;
  for (const character of name) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619) >>> 0;
  }
  return `card-${(hash >>> 0).toString(16).padStart(8, '0').slice(0, 4)}…`;
}

function Face({ name, tag, id, index = 0 }: { name: string; tag?: string; id?: string; index?: number }) {
  return (
    <span className={styles.slot} style={{ '--i': index } as CSSProperties}>
      <span className={clsx(styles.card, styles.face)}>
        <span className={styles.cardName}>{name}</span>
        {tag ? <span className={styles.tag}>{tag}</span> : null}
      </span>
      {id ? <span className={styles.id}>{id}</span> : <span className={styles.id} />}
    </span>
  );
}

function Back({ word = 'Treachery', id, index = 0 }: { word?: string; id?: string; index?: number }) {
  return (
    <span className={styles.slot} style={{ '--i': index } as CSSProperties}>
      <span className={clsx(styles.card, styles.back)}>
        <span className={styles.backWord}>{word}</span>
      </span>
      {id ? <span className={styles.id}>{id}</span> : <span className={styles.id} />}
    </span>
  );
}

/** Another seat's hand: a count and nothing more, drawn as a fan of blank backs with the number on them. */
function Count({ count, index = 0 }: { count: number; index?: number }) {
  return (
    <span className={styles.slot} style={{ '--i': index } as CSSProperties}>
      <span className={styles.fan}>
        {Array.from({ length: Math.min(count, 4) }, (_, fanIndex) => (
          <span
            key={fanIndex}
            className={clsx(styles.card, styles.back, styles.fanned)}
            style={{ '--f': fanIndex } as CSSProperties}
          />
        ))}
        <span className={styles.count}>{count} cards</span>
      </span>
      <span className={styles.id} />
    </span>
  );
}

function Peeked() {
  return <span className={styles.peeked}>peeked by Atreides</span>;
}

function Row({ title, children, shuffling }: { title: string; children: ReactNode; shuffling?: boolean }) {
  return (
    <div className={clsx(styles.row, shuffling && styles.shuffling)}>
      <span className={styles.rowTitle}>{title}</span>
      <span className={styles.cards}>{children}</span>
    </div>
  );
}

function Deck({ seed, faceUp, shuffling }: { seed: number; faceUp: boolean; shuffling: boolean }) {
  return (
    <Row title="Treachery deck" shuffling={shuffling}>
      {DECK.map((name, index) =>
        faceUp && index === 0 ? (
          <Face key={name} name={name} id={scrambled(name, seed)} index={index} />
        ) : (
          <Back key={name} id={scrambled(name, seed)} index={index} />
        )
      )}
      <Peeked />
    </Row>
  );
}

function SeatView({ seat, seed, shuffling }: { seat: Seat; seed: number; shuffling: boolean }) {
  const planned = `${PLANNED} (in plan)`;
  return (
    <>
      <Row title="Atreides hand">
        {seat === 'atreides' ? (
          ATREIDES_HAND.map((name, index) => <Face key={name} name={name} index={index} />)
        ) : (
          <Count count={ATREIDES_HAND.length} />
        )}
      </Row>
      <Row title="Harkonnen hand">
        {seat === 'harkonnen' ? (
          HARKONNEN_HAND.map((name, index) => (
            <Face key={name} name={name} tag={name === PLANNED ? 'in plan' : undefined} index={index} />
          ))
        ) : (
          <Count count={HARKONNEN_HAND.length} />
        )}
      </Row>
      <Deck seed={seed} faceUp={seat === 'atreides'} shuffling={shuffling} />
      <Row title="Harkonnen battle plan">
        {seat === 'harkonnen' ? <Face name={planned} /> : <Back word="until the reveal" />}
      </Row>
    </>
  );
}

export function SeatLens() {
  const [seat, setSeat] = useState<Seat>('atreides');
  const [seed, setSeed] = useState(7994);
  const [shuffling, setShuffling] = useState(false);

  const shuffle = () => {
    setSeed((value) => (Math.imul(value, 1_103_515_245) + 12_345) >>> 0);
    setShuffling(true);
    setTimeout(() => setShuffling(false), 700);
  };

  return (
    <div className={styles.root} role="group" aria-label="One table in the room and what each seat receives of it">
      <section className={clsx(styles.panel, styles.room)} aria-label="In the room">
        <h3 className={styles.panelTitle}>In the room</h3>
        <Row title="Atreides hand">
          {ATREIDES_HAND.map((name, index) => (
            <Face key={name} name={name} id={scrambled(name, 7)} index={index} />
          ))}
        </Row>
        <Row title="Harkonnen hand">
          {HARKONNEN_HAND.map((name, index) => (
            <Face
              key={name}
              name={name}
              id={scrambled(name, 7)}
              tag={name === PLANNED ? 'in plan' : undefined}
              index={index}
            />
          ))}
        </Row>
        <Deck seed={seed} faceUp shuffling={shuffling} />
        <Row title="Harkonnen battle plan">
          <Face name={PLANNED} id={scrambled(PLANNED, 7)} />
        </Row>
        <UnstyledButton className={styles.button} onClick={shuffle}>
          Shuffle the deck
        </UnstyledButton>
      </section>

      <section className={clsx(styles.panel, styles.sent)} aria-label={`Sent to ${SEATS[seat].name}`}>
        <div className={styles.tabs} role="group" aria-label="Seat">
          {SEAT_ORDER.map((option) => (
            <UnstyledButton
              key={option}
              className={clsx(styles.tab, option === seat && styles.tabOn)}
              style={{ '--seat': SEATS[option].color } as CSSProperties}
              aria-pressed={option === seat}
              onClick={() => setSeat(option)}
            >
              {SEATS[option].name}
            </UnstyledButton>
          ))}
        </div>
        <h3 className={styles.panelTitle}>Sent to {SEATS[seat].name}</h3>
        {/* The key remounts the view for a new seat, so its cards play their entrance again. */}
        <div key={seat} className={styles.view}>
          <SeatView seat={seat} seed={seed} shuffling={shuffling} />
        </div>
      </section>
    </div>
  );
}
