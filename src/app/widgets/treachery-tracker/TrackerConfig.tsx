import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Select, Switch, Text } from '@mantine/core';
import { ControlBlock } from '@ui/control/ControlBlock';
import { SortableItem } from '@ui/control/SortableItem';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';

import { FactionTokenFace } from '@app/widgets/faction-token/FactionTokenFace';
import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';

import styles from './TrackerConfig.module.css';
import { useTrackerTouch } from './TrackerSurface';

/** The Ruleset whose Treachery deck the tracker copies, and which of its factions sit at the table in seat order. */
export type TrackerConfig = Readonly<{
  ruleset: string;
  /** Every faction the tracker can show, in seat order. */
  order: readonly string[];
  /** The factions playing; the others stay in the order, switched off. */
  playing: readonly string[];
}>;

/**
 * The tracker's setup: pick the Ruleset, which of its factions play, and their seat order.
 * In Play the game supplies all three;
 * standalone, at a physical table, the player sets them here.
 */
export function TrackerConfigPanel({
  rulesets,
  factions,
  config,
  onChange,
}: Readonly<{
  rulesets: readonly { id: string; name: string }[];
  factions: readonly FactionToken[];
  config: TrackerConfig;
  onChange: (config: TrackerConfig) => void;
}>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const byId = new Map(factions.map((faction) => [faction.id, faction]));
  const touch = useTrackerTouch();
  return (
    <div className={styles.config}>
      <section>
        <ControlBlock
          title="Ruleset"
          description="The tracker starts with a copy of its Treachery deck."
          inputId="tracker-ruleset"
          input={(fieldProps) => (
            <Select
              {...fieldProps}
              size={touch ? 'md' : 'sm'}
              data={rulesets.map((ruleset) => ({ value: ruleset.id, label: ruleset.name }))}
              value={config.ruleset}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
              onChange={(ruleset) => ruleset && onChange({ ...config, ruleset })}
            />
          )}
        />
      </section>
      <section aria-label="Factions">
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
              onChange({
                ...config,
                order: arrayMove([...config.order], from, to),
              });
            }
          }}
        >
          <SortableContext items={[...config.order]} strategy={verticalListSortingStrategy}>
            <ul className={styles.list}>
              {config.order.map((id) => {
                const faction = byId.get(id)!;
                const playing = config.playing.includes(id);
                return (
                  <SortableItem key={id} as="li" id={id}>
                    {(handle) => (
                      <div
                        className={styles.row}
                        data-playing={playing ? 'true' : 'false'}
                        data-touch={touch ? 'true' : 'false'}
                      >
                        <SortableReorderHandle label={`Move ${faction.name}`} emphasis="silent" {...handle} />
                        <FactionTokenFace token={faction} size={touch ? 36 : 28} />
                        <Text size="sm" className={styles.name}>
                          {faction.name}
                        </Text>
                        <Switch
                          size={touch ? 'md' : 'sm'}
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
