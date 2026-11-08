import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Select, Switch, Text } from '@mantine/core';
import { SortableItem } from '@ui/control/SortableItem';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';

import { FactionTokenFace } from '../../routes/_app/play/multiplayer/FactionTokenFace';
import type { FactionToken } from '../../routes/_app/play/multiplayer/FactionTokenFace';
import styles from './AuctionTracker.module.css';

/** Which deck the tracker copies, and which factions sit at the table in seat order. */
export type TrackerConfig = Readonly<{
  deck: string;
  /** Every faction the tracker can show, in seat order. */
  order: readonly string[];
  /** The factions playing; the others stay in the order, switched off. */
  playing: readonly string[];
}>;

/**
 * The tracker's config mode, behind the gear in its title bar: pick the Treachery deck, which factions play, and their seat order.
 * In Play the game supplies all three;
 * standalone, at a physical table, the player sets them here.
 */
export function TrackerConfigPanel({
  decks,
  factions,
  config,
  onChange,
}: Readonly<{
  decks: readonly { id: string; name: string }[];
  factions: readonly FactionToken[];
  config: TrackerConfig;
  onChange: (config: TrackerConfig) => void;
}>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const byId = new Map(factions.map((faction) => [faction.id, faction]));
  return (
    <div className={styles.tracker}>
      <section className={styles.configSection}>
        <Select
          label="Treachery deck"
          description="The tracker starts with a copy of this deck."
          size="sm"
          data={decks.map((deck) => ({ value: deck.id, label: deck.name }))}
          value={config.deck}
          allowDeselect={false}
          onChange={(deck) => deck && onChange({ ...config, deck })}
        />
      </section>
      <section className={styles.section} aria-label="Factions">
        <Text size="xs" className={styles.caption}>
          Factions, in seat order
        </Text>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={({ active, over }: DragEndEvent) => {
            const from = config.order.indexOf(String(active.id));
            const to = over ? config.order.indexOf(String(over.id)) : -1;
            if (from >= 0 && to >= 0 && from !== to) {
              onChange({ ...config, order: arrayMove([...config.order], from, to) });
            }
          }}
        >
          <SortableContext items={[...config.order]} strategy={verticalListSortingStrategy}>
            <ul className={styles.configList}>
              {config.order.map((id) => {
                const faction = byId.get(id)!;
                const playing = config.playing.includes(id);
                return (
                  <SortableItem key={id} as="li" id={id}>
                    {(handle) => (
                      <div className={styles.configRow} data-playing={playing ? 'true' : 'false'}>
                        <SortableReorderHandle label={`Move ${faction.name}`} emphasis="silent" {...handle} />
                        <FactionTokenFace token={faction} size={28} />
                        <Text size="sm" className={styles.configName}>
                          {faction.name}
                        </Text>
                        <Switch
                          size="sm"
                          checked={playing}
                          aria-label={`${faction.name} plays`}
                          onChange={(event) =>
                            onChange({
                              ...config,
                              playing: event.currentTarget.checked
                                ? [...config.playing, id]
                                : config.playing.filter((entry) => entry !== id),
                            })
                          }
                        />
                      </div>
                    )}
                  </SortableItem>
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      </section>
    </div>
  );
}
