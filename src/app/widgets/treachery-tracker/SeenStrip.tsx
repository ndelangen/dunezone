import { Popover, Text, UnstyledButton } from '@mantine/core';
import { Fragment, useState } from 'react';

import { FactionTokenFace } from '../../routes/_app/play/multiplayer/FactionTokenFace';
import { CardGlyph, CardPreview } from './CardArt';
import { copyOf } from './tracker';
import type { Sighting } from './tracker';
import { FactionPicker, holderOf } from './TrackerParts';
import type { TrackerViewProps } from './TrackerParts';
import styles from './TreacheryTracker.module.css';

/**
 * The cards Atreides saw, newest first, split by turn: in Play these come from its own peeks, in order.
 * A card nobody holds yet is lit and asks who took it;
 * one that found a hand wears that faction's token.
 */
export function SeenStrip({ factions, state, onAction, size = 26 }: TrackerViewProps & Readonly<{ size?: number }>) {
  return (
    <div className={styles.seen} aria-label="Cards you saw, newest first">
      <Text size="xs" className={styles.caption}>
        Seen
      </Text>
      <div className={styles.seenRow}>
        {state.seen.map((sighting, index) => (
          <Fragment key={sighting.card}>
            {(index === 0 || state.seen[index - 1]!.turn !== sighting.turn) && (
              <span className={styles.turnMark}>Turn {sighting.turn}</span>
            )}
            <SeenCard sighting={sighting} factions={factions} state={state} onAction={onAction} size={size} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function SeenCard({
  sighting,
  factions,
  state,
  onAction,
  size,
}: TrackerViewProps & Readonly<{ sighting: Sighting; size: number }>) {
  const [open, setOpen] = useState(false);
  const copy = copyOf(state, sighting.card);
  const holder = holderOf(state, factions, sighting.card);
  return (
    <Popover opened={open} onChange={setOpen} position="bottom" withinPortal shadow="md">
      <Popover.Target>
        <span>
          <CardPreview card={copy}>
            <UnstyledButton
              className={styles.seenCard}
              data-open={holder === null ? 'true' : 'false'}
              aria-label={holder === null ? `${copy.def.name}: who took it?` : copy.def.name}
              onClick={() => setOpen((was) => !was)}
            >
              <CardGlyph card={copy} size={size} />
              {holder && holder !== 'discard' && (
                <span className={styles.holder}>
                  <FactionTokenFace token={holder} size={Math.round(size * 0.55)} />
                </span>
              )}
              {holder === 'discard' && <span className={styles.holderDiscard} aria-hidden />}
            </UnstyledButton>
          </CardPreview>
        </span>
      </Popover.Target>
      <Popover.Dropdown className={styles.dropdown}>
        <Text size="xs" className={styles.caption} mb={6}>
          {copy.def.name}: who took it?
        </Text>
        <FactionPicker
          factions={factions}
          size={26}
          label={(faction) => `${faction.name} took ${copy.def.name}`}
          onPick={(faction) => {
            onAction({ kind: 'add', faction, card: sighting.card });
            setOpen(false);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
