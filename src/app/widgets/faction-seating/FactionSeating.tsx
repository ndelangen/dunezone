import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Text } from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { SortableItem } from '@ui/control/SortableItem';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';
import { useTouchActionSize, useTouchSurface } from '@ui/surface/TouchSheet';
import { Plus, X } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { FactionTokenFace } from '@app/widgets/faction-token/FactionTokenFace';
import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';

import styles from './FactionSeating.module.css';

/** Callers own the seated factions and add chooser; this owns their reorder, remove and add controls. */
export function FactionSeating({
  seats,
  onReorder,
  onRemove,
  onAdd,
  removeDisabledReason,
  addDisabledReason,
  renderAddTarget,
}: Readonly<{
  seats: readonly FactionToken[];
  onReorder: (ids: readonly string[]) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  removeDisabledReason?: string;
  addDisabledReason?: string;
  /** A caller can anchor its chooser to the shared add control. */
  renderAddTarget?: (action: ReactElement) => ReactNode;
}>) {
  const touch = useTouchSurface();
  const actionSize = useTouchActionSize();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const ids = seats.map((seat) => seat.id);
  const add = (
    <LabeledAction
      className={touch ? styles.touchAdd : undefined}
      size={touch ? 'lg' : 'compact-sm'}
      icon={<Plus size={17} />}
      disabledReason={addDisabledReason}
      onClick={onAdd}
    >
      Add a faction
    </LabeledAction>
  );
  return (
    <div className={styles.seating}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          const from = ids.indexOf(String(active.id));
          const to = over ? ids.indexOf(String(over.id)) : -1;
          if (from >= 0 && to >= 0 && from !== to) {
            onReorder(arrayMove(ids, from, to));
          }
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className={styles.list} aria-label="Factions in seat order">
            {seats.map((faction) => (
              <SortableItem key={faction.id} as="li" id={faction.id}>
                {(handle) => (
                  <div className={styles.row} data-touch={touch ? 'true' : 'false'}>
                    <SortableReorderHandle label={`Move ${faction.name}`} emphasis="silent" {...handle} />
                    <span className={styles.who}>
                      <FactionTokenFace token={faction} size={touch ? 36 : 28} aria-hidden />
                      <Text size="sm" component="span" className={styles.name}>
                        {faction.name}
                      </Text>
                    </span>
                    <IconAction
                      label={`Remove ${faction.name}`}
                      icon={<X size={17} />}
                      size={actionSize}
                      emphasis="quiet"
                      disabledReason={removeDisabledReason}
                      onClick={() => onRemove(faction.id)}
                    />
                  </div>
                )}
              </SortableItem>
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <div>{renderAddTarget ? renderAddTarget(add) : add}</div>
    </div>
  );
}
