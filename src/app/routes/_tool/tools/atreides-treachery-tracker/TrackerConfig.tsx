import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Checkbox, Text, TextInput } from '@mantine/core';
import { Pending } from '@ui/content/Pending';
import { PublishedImage } from '@ui/content/PublishedImage';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { SortableItem } from '@ui/control/SortableItem';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';
import type { SortableHandleProps } from '@ui/control/SortableReorderHandle';
import { SheetPopover, useTouchActionSize, useTouchSurface } from '@ui/surface/TouchSheet';
import { Plus, Search as SearchIcon, X } from 'lucide-react';
import { useState } from 'react';
import type { ComponentType } from 'react';

import { FactionTokenFace } from '@app/widgets/faction-token/FactionTokenFace';
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

/** How the setup lays the decks out: every deck with a tick, or the picked ones with a sheet to add more. */
export type DeckLayout = 'checklist' | 'sheet';

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
  layout = 'checklist',
}: Readonly<{
  /** Every deck the tracker can copy; undefined while they load. */
  decks: readonly DeckOption[] | undefined;
  config: TrackerConfig;
  onChange: (config: TrackerConfig) => void;
  search: FactionSearch;
  layout?: DeckLayout;
}>) {
  const seats = config.seats;
  const Decks = layout === 'checklist' ? DeckChecklist : DeckSheet;
  return (
    <div className={styles.config}>
      <section aria-label="Decks">
        <Text size="xs" className={styles.caption}>
          Treachery decks
        </Text>
        {decks === undefined ? (
          <Pending>Loading the decks…</Pending>
        ) : (
          <Decks decks={decks} picked={config.decks} onPicked={(next) => onChange({ ...config, decks: next })} />
        )}
      </section>
      <section aria-label="Factions">
        <Text size="xs" className={styles.caption}>
          Factions, in seat order
        </Text>
        {seats === undefined ? (
          <Pending>Loading the factions…</Pending>
        ) : (
          <>
            <SeatList seats={seats} onSeats={(next) => onChange({ ...config, seats: next })} />
            <AddFaction
              search={Search}
              seated={seats.map((seat) => seat.id)}
              onPick={(faction) => onChange({ ...config, seats: [...seats, faction] })}
            />
          </>
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

/* A list longer than a phone screen gets a search above it. */
const SEARCH_FROM = 7;

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

/* Every deck, each ticked on or off by a tap anywhere on its row: the whole row is the tick's label. */
function DeckChecklist({ decks, picked, onPicked }: DeckPickerProps) {
  const touch = useTouchSurface();
  const [words, setWords] = useState('');
  const shown = matching(decks, words);
  return (
    <div className={styles.decks}>
      {decks.length >= SEARCH_FROM ? <DeckSearch value={words} onChange={setWords} /> : null}
      <ul className={styles.list}>
        {shown.map((deck) => {
          const on = picked.includes(deck.id);
          return (
            <li key={deck.id}>
              <Checkbox
                size="md"
                labelPosition="left"
                label={<DeckFace deck={deck} />}
                aria-label={deck.name}
                data-touch={touch ? 'true' : 'false'}
                classNames={{ body: styles.tick, labelWrapper: styles.tickLabel, label: styles.tickText }}
                checked={on}
                onChange={() => onPicked(on ? picked.filter((id) => id !== deck.id) : [...picked, deck.id])}
              />
            </li>
          );
        })}
      </ul>
      {shown.length === 0 ? (
        <Text size="sm" className={styles.dim}>
          No deck matches.
        </Text>
      ) : null}
    </div>
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

/* The factions at the table, in seat order: dragged to reorder, each with a button that removes it. */
function SeatList({
  seats,
  onSeats,
}: Readonly<{ seats: readonly FactionToken[]; onSeats: (seats: readonly FactionToken[]) => void }>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const indexOf = (id: string) => seats.findIndex((seat) => seat.id === id);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }: DragEndEvent) => {
        const from = indexOf(String(active.id));
        const to = over ? indexOf(String(over.id)) : -1;
        if (movesASeat(from, to)) {
          onSeats(arrayMove([...seats], from, to));
        }
      }}
    >
      <SortableContext items={seats.map((seat) => seat.id)} strategy={verticalListSortingStrategy}>
        <ul className={styles.list}>
          {seats.map((faction) => (
            <SortableItem key={faction.id} as="li" id={faction.id}>
              {(handle) => (
                <SeatRow
                  faction={faction}
                  handle={handle}
                  onRemove={() => onSeats(seats.filter((seat) => seat.id !== faction.id))}
                />
              )}
            </SortableItem>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

/* A drop moves a seat when both ends are seats and they differ. */
function movesASeat(from: number, to: number) {
  return Math.min(from, to) >= 0 && from !== to;
}

/* One faction at the table: its drag handle, its token and name, and its Remove button. */
function SeatRow({
  faction,
  handle,
  onRemove,
}: Readonly<{
  faction: FactionToken;
  handle: SortableHandleProps;
  onRemove: () => void;
}>) {
  const touch = useTouchSurface();
  const actionSize = useTouchActionSize();
  return (
    <div className={styles.row} data-touch={touch ? 'true' : 'false'}>
      <SortableReorderHandle label={`Move ${faction.name}`} emphasis="silent" {...handle} />
      <span className={styles.who}>
        <FactionTokenFace token={faction} size={touch ? 36 : 28} />
        <Text size="sm" component="span" className={styles.name}>
          {faction.name}
        </Text>
      </span>
      <IconAction
        label={`Remove ${faction.name}`}
        icon={<X size={17} />}
        size={actionSize}
        emphasis="quiet"
        onClick={onRemove}
      />
    </div>
  );
}

/* Adds a faction to the table: a search over every faction on Dune Zone, in a sheet on a phone. */
function AddFaction({
  search: Search,
  seated,
  onPick,
}: Readonly<{ search: FactionSearch; seated: readonly string[]; onPick: (faction: FactionToken) => void }>) {
  const [open, setOpen] = useState(false);
  const touch = useTouchSurface();
  return (
    <SheetPopover opened={open} onChange={setOpen} position="bottom-start" withinPortal shadow="md" width={320}>
      <SheetPopover.Target>
        <LabeledAction
          className={styles.add}
          size={touch ? 'lg' : 'compact-sm'}
          icon={<Plus size={17} />}
          onClick={() => setOpen((was) => !was)}
        >
          Add a faction
        </LabeledAction>
      </SheetPopover.Target>
      <SheetPopover.Dropdown label="Add a faction">
        {/* The search mounts only while it is open, so it reads the catalogue only then. */}
        {open ? (
          <Search
            seated={seated}
            onPick={(faction) => {
              onPick(faction);
              setOpen(false);
            }}
          />
        ) : null}
      </SheetPopover.Dropdown>
    </SheetPopover>
  );
}
