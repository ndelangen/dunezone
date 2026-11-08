import { Popover, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';

import { FactionTokenFace } from '../../routes/_app/play/multiplayer/FactionTokenFace';
import { CardGlyph, CardPreview } from './CardArt';
import { CARD_KINDS, KIND_LABEL, placeOf, unknownCount, unplaced } from './tracker';
import type { CardCopy } from './tracker';
import { FactionPicker, KindBar, kindSummary } from './TrackerParts';
import type { TrackerViewProps } from './TrackerParts';
import styles from './TreacheryTracker.module.css';

/**
 * Option E, Deck sheet: the tracker is the deck itself.
 * Every physical card is one glyph, laid out by kind;
 * a card in a hand wears its holder's token, a discarded one fades, and a card you saw but nobody holds yet is ringed.
 * Unknown cards are only a count per faction along the top.
 * The whole deck fits in about 200 px of height.
 */
export function DeckSheetTracker({ factions, state, onAction }: TrackerViewProps) {
  const seen = new Set(state.seen.map((sighting) => sighting.card));
  const deck = unplaced(state);
  return (
    <div className={styles.view}>
      <div className={styles.unknownRow}>
        {factions.map((faction) => {
          const count = unknownCount(state, faction.id);
          const lastUnknown = [...(state.hands[faction.id] ?? [])].reverse().find((slot) => slot.card === null);
          return (
            <div key={faction.id} className={styles.unknownTally}>
              <FactionTokenFace token={faction} size={26} />
              <span className={styles.tallyCount} title={`${count} unknown cards`}>
                ?{count}
              </span>
              <span className={styles.tallyActions}>
                <IconAction
                  label={`${faction.name} gains an unknown card`}
                  icon={<Plus size={10} />}
                  size="xs"
                  emphasis="quiet"
                  onClick={() => onAction({ kind: 'add', faction: faction.id, card: null })}
                />
                <IconAction
                  label={`${faction.name} loses an unknown card`}
                  icon={<Minus size={10} />}
                  size="xs"
                  emphasis="quiet"
                  disabledReason={lastUnknown ? undefined : 'No unknown cards to remove.'}
                  onClick={() =>
                    lastUnknown && onAction({ kind: 'discard', faction: faction.id, slot: lastUnknown.id })
                  }
                />
              </span>
            </div>
          );
        })}
      </div>
      {CARD_KINDS.map((kind) => (
        <div key={kind}>
          <Text size="xs" className={styles.caption}>
            {KIND_LABEL[kind]}
          </Text>
          <div className={styles.sheet}>
            {state.copies
              .filter((copy) => copy.def.kind === kind)
              .map((copy) => (
                <SheetCard
                  key={copy.id}
                  copy={copy}
                  seen={seen.has(copy.id)}
                  factions={factions}
                  state={state}
                  onAction={onAction}
                />
              ))}
          </div>
        </div>
      ))}
      <div className={styles.footerDeck}>
        <KindBar copies={deck} />
        <Text size="xs" className={styles.dim}>
          Not placed: {kindSummary(deck)}
        </Text>
      </div>
    </div>
  );
}

function SheetCard({
  copy,
  seen,
  factions,
  state,
  onAction,
}: TrackerViewProps & Readonly<{ copy: CardCopy; seen: boolean }>) {
  const [open, setOpen] = useState(false);
  const place = placeOf(state, copy.id);
  const holder = place.at === 'hand' ? factions.find((faction) => faction.id === place.faction) : undefined;
  const withUnknown = factions.filter((faction) => unknownCount(state, faction.id) > 0);
  return (
    <Popover opened={open} onChange={setOpen} position="bottom" withinPortal shadow="md">
      <Popover.Target>
        <span>
          <CardPreview card={copy}>
            <UnstyledButton
              className={styles.sheetCard}
              data-place={place.at}
              data-seen={seen && place.at === 'deck' ? 'true' : 'false'}
              aria-label={`${copy.def.name}${holder ? `, held by ${holder.name}` : place.at === 'discard' ? ', discarded' : ''}`}
              onClick={() => setOpen((was) => !was)}
            >
              <CardGlyph card={copy} size={26} />
              {holder && (
                <span className={styles.holder}>
                  <FactionTokenFace token={holder} size={14} />
                </span>
              )}
            </UnstyledButton>
          </CardPreview>
        </span>
      </Popover.Target>
      <Popover.Dropdown className={styles.dropdown}>
        <Stack gap={6}>
          <Text size="xs" className={styles.caption}>
            {copy.def.name}: who has it?
          </Text>
          <FactionPicker
            factions={factions}
            size={26}
            label={(faction) => `${faction.name} took ${copy.def.name}`}
            onPick={(faction) => {
              onAction({ kind: 'add', faction, card: copy.id });
              setOpen(false);
            }}
          />
          {withUnknown.length > 0 && (
            <>
              <Text size="xs" className={styles.caption}>
                It was one of their unknown cards
              </Text>
              <FactionPicker
                factions={withUnknown}
                size={22}
                label={(faction) => `One of ${faction.name}'s unknown cards was ${copy.def.name}`}
                onPick={(faction) => {
                  const slot = state.hands[faction]!.find((entry) => entry.card === null)!;
                  onAction({ kind: 'identify', faction, slot: slot.id, card: copy.id });
                  setOpen(false);
                }}
              />
            </>
          )}
          <div className={styles.picker}>
            <UnstyledButton
              className={styles.textButton}
              onClick={() => {
                onAction({ kind: 'place', card: copy.id, at: 'discard' });
                setOpen(false);
              }}
            >
              Discarded
            </UnstyledButton>
            <UnstyledButton
              className={styles.textButton}
              onClick={() => {
                onAction({ kind: 'place', card: copy.id, at: 'deck' });
                setOpen(false);
              }}
            >
              Back in the deck
            </UnstyledButton>
          </div>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
