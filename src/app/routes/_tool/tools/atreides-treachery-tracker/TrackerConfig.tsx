import { Text, TextInput } from '@mantine/core';
import { Pending } from '@ui/content/Pending';
import { PublishedImage } from '@ui/content/PublishedImage';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { SheetPopover, useTouchActionSize, useTouchSurface } from '@ui/surface/TouchSheet';
import { Plus, Search as SearchIcon, X } from 'lucide-react';
import { useState } from 'react';
import type { ComponentType } from 'react';

import { FactionSeating } from '@app/widgets/faction-seating/FactionSeating';
import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';

import styles from './TrackerConfig.module.css';

/** The Treachery decks the tracker copies, together, and the factions at the table in seat order. */
export type TrackerConfig = Readonly<{
  /** The picked decks' ids, in the order they were picked. */
  decks: readonly string[];
  /** The factions playing, in seat order; undefined while the starting ones load. */
  seats: readonly FactionToken[] | undefined;
}>;

/** A deck of Treachery cards the setup offers: its name, its copies, its back, and the Rulesets that play it. */
export type DeckOption = Readonly<{
  id: string;
  name: string;
  cards: number;
  back: string | null;
  rulesets: readonly Readonly<{ name: string }>[];
}>;

/**
 * A search over every faction on Dune Zone, handed in by the page, which reads the server.
 * It leaves out the factions already seated and reports the one picked.
 */
export type FactionSearch = ComponentType<
  Readonly<{ seated: readonly string[]; onPick: (faction: FactionToken) => void }>
>;

/**
 * The tracker's setup: the decks it copies, and the factions at the table in seat order.
 * Any deck of Treachery cards can be tracked, several at once, as a table that mixes a Ruleset's deck with homebrew cards plays them.
 * Any faction on Dune Zone can sit at the table, any number of them: the player adds, removes and reorders them here.
 */
export function TrackerConfigPanel({
  decks,
  config,
  onChange,
  search: Search,
}: Readonly<{
  /** Every deck the tracker can copy; undefined while they load. */
  decks: readonly DeckOption[] | undefined;
  config: TrackerConfig;
  onChange: (config: TrackerConfig) => void;
  search: FactionSearch;
}>) {
  const seats = config.seats;
  const [adding, setAdding] = useState(false);
  return (
    <div className={styles.config}>
      <section aria-label="Decks">
        <Text size="xs" className={styles.caption}>
          Treachery decks
        </Text>
        {decks === undefined ? (
          <Pending>Loading the decks…</Pending>
        ) : (
          <DeckSheet decks={decks} picked={config.decks} onPicked={(next) => onChange({ ...config, decks: next })} />
        )}
      </section>
      <section aria-label="Factions">
        <Text size="xs" className={styles.caption}>
          Factions, in seat order
        </Text>
        {seats === undefined ? (
          <Pending>Loading the factions…</Pending>
        ) : (
          <SheetPopover
            opened={adding}
            onChange={setAdding}
            position="bottom-start"
            withinPortal
            shadow="md"
            width={320}
          >
            <FactionSeating
              seats={seats}
              onReorder={(ids) => {
                const byId = new Map(seats.map((seat) => [seat.id, seat]));
                onChange({ ...config, seats: ids.flatMap((id) => byId.get(id) ?? []) });
              }}
              onRemove={(id) => onChange({ ...config, seats: seats.filter((seat) => seat.id !== id) })}
              onAdd={() => setAdding((was) => !was)}
              renderAddTarget={(action) => <SheetPopover.Target>{action}</SheetPopover.Target>}
            />
            <SheetPopover.Dropdown label="Add a faction">
              {/* The search reads the catalogue only while the chooser is open. */}
              {adding ? (
                <Search
                  seated={seats.map((seat) => seat.id)}
                  onPick={(faction) => {
                    onChange({ ...config, seats: [...seats, faction] });
                    setAdding(false);
                  }}
                />
              ) : null}
            </SheetPopover.Dropdown>
          </SheetPopover>
        )}
      </section>
    </div>
  );
}

type DeckPickerProps = Readonly<{
  decks: readonly DeckOption[];
  picked: readonly string[];
  onPicked: (picked: readonly string[]) => void;
}>;

/* The decks whose name, or a Ruleset's that plays them, holds the words. */
function matching(decks: readonly DeckOption[], words: string) {
  const query = words.trim().toLowerCase();
  return query
    ? decks.filter((deck) =>
        [deck.name, ...deck.rulesets.map((ruleset) => ruleset.name)].some((name) => name.toLowerCase().includes(query))
      )
    : decks;
}

/* A search over the decks, in the field style the rest of the setup uses. */
function DeckSearch({ value, onChange }: Readonly<{ value: string; onChange: (value: string) => void }>) {
  const touch = useTouchSurface();
  return (
    <TextInput
      aria-label="Find a deck"
      placeholder="Find a deck"
      size={touch ? 'lg' : 'sm'}
      leftSection={<SearchIcon size={16} aria-hidden />}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

/* The picked decks, each with a button that removes it, and a sheet that adds another. */
function DeckSheet({ decks, picked, onPicked }: DeckPickerProps) {
  const touch = useTouchSurface();
  const actionSize = useTouchActionSize();
  const [open, setOpen] = useState(false);
  const [words, setWords] = useState('');
  const chosen = picked.flatMap((id) => decks.filter((deck) => deck.id === id));
  const more = matching(
    decks.filter((deck) => !picked.includes(deck.id)),
    words
  );
  return (
    <div className={styles.decks}>
      <ul className={styles.list}>
        {chosen.map((deck) => (
          <li key={deck.id} className={styles.deckRow} data-touch={touch ? 'true' : 'false'}>
            <DeckFace deck={deck} />
            <IconAction
              label={`Remove ${deck.name}`}
              icon={<X size={17} />}
              size={actionSize}
              emphasis="quiet"
              onClick={() => onPicked(picked.filter((id) => id !== deck.id))}
            />
          </li>
        ))}
      </ul>
      <SheetPopover opened={open} onChange={setOpen} position="bottom-start" withinPortal shadow="md" width={320}>
        <SheetPopover.Target>
          <LabeledAction
            className={styles.add}
            size={touch ? 'lg' : 'compact-sm'}
            icon={<Plus size={17} />}
            disabledReason={decks.length === picked.length ? 'Every deck is picked.' : undefined}
            onClick={() => setOpen((was) => !was)}
          >
            Add a deck
          </LabeledAction>
        </SheetPopover.Target>
        <SheetPopover.Dropdown label="Add a deck">
          <div className={styles.decks}>
            <DeckSearch value={words} onChange={setWords} />
            <ul className={styles.list}>
              {more.map((deck) => (
                <li key={deck.id}>
                  <button
                    type="button"
                    className={styles.deckRow}
                    data-touch={touch ? 'true' : 'false'}
                    onClick={() => {
                      onPicked([...picked, deck.id]);
                      setOpen(false);
                    }}
                  >
                    <DeckFace deck={deck} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </SheetPopover.Dropdown>
      </SheetPopover>
    </div>
  );
}

/* A deck as a row shows it: its back, its name, and the Rulesets that play it with its size. */
function DeckFace({ deck }: Readonly<{ deck: DeckOption }>) {
  const plays = deck.rulesets.map((ruleset) => ruleset.name).join(', ');
  return (
    <span className={styles.deck}>
      <span className={styles.back}>
        <PublishedImage src={deck.back} name="" aspect={1.4} radius="3px" />
      </span>
      <span className={styles.deckText}>
        <Text size="sm" component="span" className={styles.name}>
          {deck.name}
        </Text>
        <Text size="xs" component="span" className={styles.dim}>
          {plays ? `${plays} · ${deck.cards} cards` : `${deck.cards} cards`}
        </Text>
      </span>
    </span>
  );
}
