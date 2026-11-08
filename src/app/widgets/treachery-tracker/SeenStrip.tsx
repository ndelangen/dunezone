import { Popover, Text, UnstyledButton } from '@mantine/core';
import { Fragment, useState } from 'react';

import { FactionTokenFace } from '../../routes/_app/play/multiplayer/FactionTokenFace';
import { CardGlyph, CardPreview, UnknownGlyph } from './CardArt';
import { awaitingWinner, copyOf, sightingCard } from './tracker';
import type { Sighting } from './tracker';
import { FactionPicker, holderOf } from './TrackerParts';
import type { TrackerViewProps } from './TrackerParts';
import styles from './TreacheryTracker.module.css';

/**
 * The cards that came up for bid, newest first, split by turn: in Play these come from Atreides's own peeks, in order.
 * A card nobody holds yet is lit and asks who took it;
 * one that found a hand wears that faction's token, and an unknown one shows its card once the winner's card is named.
 */
export function SeenStrip({ factions, state, onAction, size = 26 }: TrackerViewProps & Readonly<{ size?: number }>) {
  return (
    <div className={styles.seen} aria-label="Cards up for bid, newest first">
      <Text size="xs" className={styles.caption}>
        Up for bid
      </Text>
      <div className={styles.seenRow}>
        {state.seen.map((sighting, index) => (
          <Fragment key={sighting.id}>
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
  const card = sightingCard(state, sighting);
  const copy = card ? copyOf(state, card) : null;
  const holder = holderOf(state, factions, sighting);
  const waiting = awaitingWinner(state, sighting);
  const name = copy ? copy.def.name : 'Unknown card';
  return (
    <Popover opened={open} onChange={setOpen} position="bottom" withinPortal shadow="md">
      <Popover.Target>
        <span>
          <CardPreview card={copy}>
            <UnstyledButton
              className={styles.seenCard}
              data-open={waiting ? 'true' : 'false'}
              aria-label={waiting ? `${name}: who won it?` : name}
              onClick={() => waiting && setOpen((was) => !was)}
            >
              {copy ? <CardGlyph card={copy} size={size} /> : <UnknownGlyph size={size} />}
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
          {name}: who won it?
        </Text>
        <FactionPicker
          factions={factions}
          size={28}
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
