import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
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
  renderStatus,
}: Readonly<{
  seats: readonly FactionToken[];
  onReorder: (ids: readonly string[]) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  removeDisabledReason?: string;
  addDisabledReason?: string;
  /** A caller can anchor its chooser to the shared add control. */
  renderAddTarget?: (action: ReactElement) => ReactNode;
  /** A caller supplies each faction's current status beside its name. */
  renderStatus?: (seat: FactionToken) => ReactNode;
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
        onDragEnd={(event) => {
          const reordered = seatOrderAfterDrop(ids, event);
          if (reordered) {
            onReorder(reordered);
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
                      <span className={styles.identity}>
                        <Text size="sm" component="span" className={styles.name}>
                          {faction.name}
                        </Text>
                        {renderStatus?.(faction)}
                      </span>
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

function seatOrderAfterDrop(ids: readonly string[], { active, over }: DragEndEvent): string[] | null {
  if (!over) {
    return null;
  }
  const from = ids.indexOf(String(active.id));
  if (from < 0) {
    return null;
  }
  const to = ids.indexOf(String(over.id));
  if (to < 0) {
    return null;
  }
  if (from === to) {
    return null;
  }
  return arrayMove([...ids], from, to);
}
