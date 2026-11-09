import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Select, Text } from '@mantine/core';
import { Pending } from '@ui/content/Pending';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { SortableItem } from '@ui/control/SortableItem';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';
import type { SortableHandleProps } from '@ui/control/SortableReorderHandle';
import { SheetPopover, useTouchActionSize, useTouchSurface } from '@ui/surface/TouchSheet';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { ComponentType } from 'react';

import { FactionTokenFace } from '@app/widgets/faction-token/FactionTokenFace';
import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';

import styles from './TrackerConfig.module.css';

/** The Ruleset whose Treachery deck the tracker copies, and the factions at the table in seat order. */
export type TrackerConfig = Readonly<{
  ruleset: string;
  /** The factions playing, in seat order; undefined while the starting ones load. */
  seats: readonly FactionToken[] | undefined;
}>;

/**
 * A search over every faction on Dune Zone, handed in by the page, which reads the server.
 * It leaves out the factions already seated and reports the one picked.
 */
export type FactionSearch = ComponentType<
  Readonly<{ seated: readonly string[]; onPick: (faction: FactionToken) => void }>
>;

/**
 * The tracker's setup: the Ruleset whose deck it copies, and the factions at the table in seat order.
 * Any faction on Dune Zone can sit at the table, any number of them: the player adds, removes and reorders them here.
 */
export function TrackerConfigPanel({
  rulesets,
  config,
  onChange,
  onRulesetSearch,
  search: Search,
}: Readonly<{
  /** The Rulesets to offer: the first ones, or those matching what the player types, always with the picked one. */
  rulesets: readonly { id: string; name: string }[];
  config: TrackerConfig;
  onChange: (config: TrackerConfig) => void;
  /** Asks for the Rulesets matching a name; empty asks for the first ones again. */
  onRulesetSearch: (query: string) => void;
  search: FactionSearch;
}>) {
  const seats = config.seats;
  return (
    <div className={styles.config}>
      <section>
        <RulesetField
          rulesets={rulesets}
          ruleset={config.ruleset}
          onPick={(ruleset) => onChange({ ...config, ruleset })}
          onRulesetSearch={onRulesetSearch}
        />
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

/* The Ruleset picker: the list holds the first ones, and typing searches them all on the server. */
function RulesetField({
  rulesets,
  ruleset,
  onPick,
  onRulesetSearch,
}: Readonly<{
  rulesets: readonly { id: string; name: string }[];
  ruleset: string;
  onPick: (ruleset: string) => void;
  onRulesetSearch: (query: string) => void;
}>) {
  const touch = useTouchSurface();
  /* What the player types while the list is open; null while it is closed, when the field shows the picked Ruleset. */
  const [search, setSearch] = useState<string | null>(null);
  const picked = rulesets.find((entry) => entry.id === ruleset)?.name ?? '';
  const searchFor = (value: string) => {
    setSearch(value);
    onRulesetSearch(value);
  };
  return (
    <ControlBlock
      title="Ruleset"
      description="The tracker starts with a copy of its Treachery deck."
      inputId="tracker-ruleset"
      input={(fieldProps) => (
        <Select
          {...fieldProps}
          size={touch ? 'lg' : 'sm'}
          data={rulesets.map((entry) => ({ value: entry.id, label: entry.name }))}
          value={ruleset}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          onChange={(next) => next && onPick(next)}
          searchable
          searchValue={search ?? picked}
          filter={({ options }) => options}
          nothingFoundMessage="No Ruleset matches"
          onDropdownOpen={() => searchFor('')}
          onDropdownClose={() => {
            setSearch(null);
            onRulesetSearch('');
          }}
          onSearchChange={(value) => search !== null && searchFor(value)}
        />
      )}
    />
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
