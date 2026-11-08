import { HoverCard, Popover, Stack, Text, UnstyledButton } from '@mantine/core';
import { AddAction } from '@ui/control/ListLengthActions';
import { ArrowRightLeft, Trash2, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { FactionTokenFace } from '../../routes/_app/play/multiplayer/FactionTokenFace';
import type { FactionToken } from '../../routes/_app/play/multiplayer/FactionTokenFace';
import { CardGlyph, CardPreview, UnknownGlyph } from './CardArt';
import { CARD_KINDS, KIND_LABEL, copyOf, kindCounts, placeOf, slotOf, unplaced } from './tracker';
import type { CardCopy, CardKind, Sighting, Slot, TrackerAction, TrackerState } from './tracker';
import styles from './TreacheryTracker.module.css';

/** What every tracker view is handed: the factions in seat order, the tracker, and where its changes go. */
export type TrackerViewProps = Readonly<{
  factions: readonly FactionToken[];
  state: TrackerState;
  onAction: (action: TrackerAction) => void;
}>;

/** A row of faction tokens to pick one from, such as who won the card on bid. */
export function FactionPicker({
  factions,
  size = 28,
  label,
  onPick,
  except,
}: Readonly<{
  factions: readonly FactionToken[];
  size?: number;
  label: (faction: FactionToken) => string;
  onPick: (faction: string) => void;
  except?: string;
}>) {
  return (
    <div className={styles.picker}>
      {factions
        .filter((faction) => faction.id !== except)
        .map((faction) => (
          <UnstyledButton
            key={faction.id}
            className={styles.tokenButton}
            aria-label={label(faction)}
            title={label(faction)}
            onClick={() => onPick(faction.id)}
          >
            <FactionTokenFace token={faction} size={size} />
          </UnstyledButton>
        ))}
    </div>
  );
}

/** The cards one may still pick for a hand: the cards seen but not placed, newest first, then the rest of the deck by kind. */
export function CardChooser({
  state,
  onPick,
  allowUnknown,
}: Readonly<{ state: TrackerState; onPick: (card: string | null) => void; allowUnknown: boolean }>) {
  const free = unplaced(state);
  const freeIds = new Set(free.map((copy) => copy.id));
  const seen = state.seen.flatMap((sighting) =>
    sighting.card && freeIds.has(sighting.card) ? [copyOf(state, sighting.card)] : []
  );
  /* One glyph per card name: a second copy adds nothing to choose from. */
  const byName = new Map<string, { copy: CardCopy; left: number }>();
  for (const copy of free) {
    const entry = byName.get(copy.def.key);
    if (entry) {
      entry.left += 1;
    } else {
      byName.set(copy.def.key, { copy, left: 1 });
    }
  }
  return (
    <Stack gap={8} className={styles.chooser}>
      {allowUnknown && (
        <UnstyledButton className={styles.chooserUnknown} onClick={() => onPick(null)}>
          <UnknownGlyph size={22} />
          <Text size="sm">An unknown card</Text>
        </UnstyledButton>
      )}
      {seen.length > 0 && (
        <div>
          <Text size="xs" className={styles.caption}>
            Seen, not placed
          </Text>
          <div className={styles.glyphRow}>
            {seen.map((copy) => (
              <CardPreview key={copy.id} card={copy}>
                <UnstyledButton
                  className={styles.glyphButton}
                  aria-label={copy.def.name}
                  onClick={() => onPick(copy.id)}
                >
                  <CardGlyph card={copy} size={32} />
                </UnstyledButton>
              </CardPreview>
            ))}
          </div>
        </div>
      )}
      {CARD_KINDS.map((kind) => {
        const cards = [...byName.values()].filter(({ copy }) => copy.def.kind === kind);
        if (cards.length === 0) {
          return null;
        }
        return (
          <div key={kind}>
            <Text size="xs" className={styles.caption}>
              {KIND_LABEL[kind]} in the deck
            </Text>
            <div className={styles.glyphRow}>
              {cards.map(({ copy, left }) => (
                <CardPreview key={copy.id} card={copy}>
                  <UnstyledButton
                    className={styles.glyphButton}
                    aria-label={copy.def.name}
                    onClick={() => onPick(copy.id)}
                  >
                    <CardGlyph card={copy} size={32} />
                    {left > 1 && <span className={styles.badge}>{left}</span>}
                  </UnstyledButton>
                </CardPreview>
              ))}
            </div>
          </div>
        );
      })}
    </Stack>
  );
}

/** The plus at the foot of a hand: add an unknown card, a card seen at auction, or any card left in the deck. */
export function AddCard({
  faction,
  state,
  onAction,
}: Readonly<{ faction: FactionToken; state: TrackerState; onAction: (action: TrackerAction) => void }>) {
  const [open, setOpen] = useState(false);
  return (
    <Popover opened={open} onChange={setOpen} position="bottom" withinPortal shadow="md" width={300}>
      <Popover.Target>
        <AddAction label={`Add a card to ${faction.name}`} onClick={() => setOpen((was) => !was)} />
      </Popover.Target>
      <Popover.Dropdown className={styles.dropdown}>
        <CardChooser
          state={state}
          allowUnknown
          onPick={(card) => {
            onAction({ kind: 'add', faction: faction.id, card });
            setOpen(false);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

/** One card in a hand, and what can happen to it: name it, pass it on, discard it, or take it back. */
export function SlotChip({
  faction,
  slot,
  factions,
  state,
  onAction,
  children,
}: Readonly<{
  faction: string;
  slot: Slot;
  factions: readonly FactionToken[];
  state: TrackerState;
  onAction: (action: TrackerAction) => void;
  children: ReactNode;
}>) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'menu' | 'give' | 'identify'>('menu');
  const card = slot.card ? copyOf(state, slot.card) : null;
  const close = () => {
    setOpen(false);
    setMode('menu');
  };
  return (
    <Popover
      opened={open}
      onChange={(next) => (next ? setOpen(true) : close())}
      position="bottom"
      withinPortal
      shadow="md"
      width={mode === 'identify' ? 300 : 'target'}
    >
      <Popover.Target>
        <span>
          <CardPreview card={card}>
            <UnstyledButton
              className={styles.slotButton}
              aria-label={card ? card.def.name : 'Unknown card'}
              onClick={() => (open ? close() : setOpen(true))}
            >
              {children}
            </UnstyledButton>
          </CardPreview>
        </span>
      </Popover.Target>
      <Popover.Dropdown className={styles.dropdown} miw={200}>
        {mode === 'menu' && (
          <Stack gap={2}>
            {!card && (
              <MenuLine icon={<UnknownGlyph size={16} />} onClick={() => setMode('identify')}>
                It's this card…
              </MenuLine>
            )}
            <MenuLine icon={<ArrowRightLeft size={14} />} onClick={() => setMode('give')}>
              Given to…
            </MenuLine>
            <MenuLine
              icon={<Trash2 size={14} />}
              onClick={() => {
                onAction({ kind: 'discard', faction, slot: slot.id });
                close();
              }}
            >
              {card ? 'Discarded' : 'Discarded, unseen'}
            </MenuLine>
            <MenuLine
              icon={<Undo2 size={14} />}
              onClick={() => {
                onAction({ kind: 'undo', faction, slot: slot.id });
                close();
              }}
            >
              Take back (a mistake)
            </MenuLine>
          </Stack>
        )}
        {mode === 'give' && (
          <FactionPicker
            factions={factions}
            except={faction}
            size={26}
            label={(to) => `Given to ${to.name}`}
            onPick={(to) => {
              onAction({ kind: 'give', faction, slot: slot.id, to });
              close();
            }}
          />
        )}
        {mode === 'identify' && (
          <CardChooser
            state={state}
            allowUnknown={false}
            onPick={(picked) => {
              if (picked) {
                onAction({ kind: 'identify', faction, slot: slot.id, card: picked });
              }
              close();
            }}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
}

function MenuLine({
  icon,
  onClick,
  children,
}: Readonly<{ icon: ReactNode; onClick: () => void; children: ReactNode }>) {
  return (
    <UnstyledButton className={styles.menuLine} onClick={onClick}>
      <span className={styles.menuIcon}>{icon}</span>
      <Text size="sm">{children}</Text>
    </UnstyledButton>
  );
}

/** The deck's makeup by kind, as one thin bar: what an unknown card, or the next draw, could be. */
export function KindBar({ copies, height = 10 }: Readonly<{ copies: readonly CardCopy[]; height?: number }>) {
  const counts = kindCounts(copies);
  const total = copies.length || 1;
  return (
    <div className={styles.kindBar} style={{ height }} aria-label={kindSummary(copies)}>
      {CARD_KINDS.map((kind) =>
        counts[kind] > 0 ? (
          <HoverCard key={kind} openDelay={80} closeDelay={60} position="top" withinPortal shadow="md" withArrow>
            <HoverCard.Target>
              <span
                data-kind={kind}
                className={styles.kindSlice}
                style={{ flexGrow: counts[kind] / total }}
                tabIndex={0}
                aria-label={`${counts[kind]} ${KIND_LABEL[kind].toLowerCase()} left`}
              />
            </HoverCard.Target>
            <HoverCard.Dropdown className={styles.dropdown}>
              <KindList kind={kind} copies={copies} />
            </HoverCard.Dropdown>
          </HoverCard>
        ) : null
      )}
    </div>
  );
}

/** Exactly which cards of a kind are left, one line per card with how many copies. */
function KindList({ kind, copies }: Readonly<{ kind: CardKind; copies: readonly CardCopy[] }>) {
  const byName = new Map<string, { copy: CardCopy; left: number }>();
  for (const copy of copies.filter((entry) => entry.def.kind === kind)) {
    const entry = byName.get(copy.def.key);
    if (entry) {
      entry.left += 1;
    } else {
      byName.set(copy.def.key, { copy, left: 1 });
    }
  }
  const lines = [...byName.values()];
  return (
    <Stack gap={4}>
      <Text size="xs" className={styles.caption}>
        {lines.reduce((sum, line) => sum + line.left, 0)} {KIND_LABEL[kind].toLowerCase()} left
      </Text>
      <div className={styles.kindList}>
        {lines.map(({ copy, left }) => (
          <span key={copy.def.key} className={styles.kindLine}>
            <CardGlyph card={copy} size={22} />
            <Text size="sm">{copy.def.name}</Text>
            {left > 1 && <span className={styles.kindLeft}>×{left}</span>}
          </span>
        ))}
      </div>
    </Stack>
  );
}

export function kindSummary(copies: readonly CardCopy[]): string {
  const counts = kindCounts(copies);
  return CARD_KINDS.filter((kind) => counts[kind] > 0)
    .map((kind) => `${counts[kind]} ${KIND_LABEL[kind].toLowerCase()}`)
    .join(', ');
}

/** Where a card on bid went, as a small token on its glyph; nothing while it waits for a winner. */
export function holderOf(
  state: TrackerState,
  factions: readonly FactionToken[],
  sighting: Sighting
): FactionToken | 'discard' | null {
  const won = slotOf(state, sighting.slot);
  if (won) {
    return factions.find((faction) => faction.id === won.faction) ?? null;
  }
  if (!sighting.card) {
    return null;
  }
  const place = placeOf(state, sighting.card);
  if (place.at === 'hand') {
    return factions.find((faction) => faction.id === place.faction) ?? null;
  }
  if (place.at === 'discard') {
    return 'discard';
  }
  return null;
}
