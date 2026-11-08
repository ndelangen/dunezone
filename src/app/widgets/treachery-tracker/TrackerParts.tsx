import { HoverCard, Popover, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { AddAction } from '@ui/control/ListLengthActions';
import { ArrowRightLeft, Trash2, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { FactionTokenFace } from '../../routes/_app/play/multiplayer/FactionTokenFace';
import type { FactionToken } from '../../routes/_app/play/multiplayer/FactionTokenFace';
import { CardGlyph, CardPreview, UnknownGlyph } from './CardArt';
import {
  CARD_GROUPS,
  GROUP_LABEL,
  GROUP_ROWS,
  copyOf,
  chooserCards,
  groupCount,
  groupOf,
  placeOf,
  slotOf,
} from './tracker';
import type { CardCopy, CardGroup, Sighting, Slot, TrackerAction, TrackerState } from './tracker';
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
          <Tooltip key={faction.id} label={label(faction)} withinPortal>
            <UnstyledButton
              className={styles.tokenButton}
              aria-label={label(faction)}
              onClick={() => onPick(faction.id)}
            >
              <FactionTokenFace token={faction} size={size} />
            </UnstyledButton>
          </Tooltip>
        ))}
    </div>
  );
}

/* The chooser shows the whole deck at once: every group on a two-column grid, small enough to need no scrolling. */
const CHOOSER_GLYPH = 28;
export const CHOOSER_WIDTH = 400;

/** The cards one may still pick for a hand: the cards seen but not placed, newest first, then the rest of the deck by kind. */
export function CardChooser({
  state,
  onPick,
  allowUnknown,
  forBid = false,
}: Readonly<{
  state: TrackerState;
  onPick: (card: string | null) => void;
  allowUnknown: boolean;
  /** Picking the next card up for bid, which may never be a card already on bid. */
  forBid?: boolean;
}>) {
  const { seen, byName } = chooserCards(state, forBid);
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
                  <CardGlyph card={copy} size={CHOOSER_GLYPH} />
                </UnstyledButton>
              </CardPreview>
            ))}
          </div>
        </div>
      )}
      {GROUP_ROWS.map((row) => {
        const groups = row
          .map((group) => ({
            group,
            cards: byName.filter(({ copy }) => groupOf(copy.def) === group),
          }))
          .filter(({ cards }) => cards.length > 0);
        if (groups.length === 0) {
          return null;
        }
        return (
          <div key={row.join()} className={styles.groupRow} data-row={row[0]}>
            {groups.map(({ group, cards }) => (
              <div key={group}>
                <Text size="xs" className={styles.caption}>
                  {GROUP_LABEL[group]}
                </Text>
                <div className={styles.glyphRow}>
                  {cards.map(({ copy, left }) => (
                    <CardPreview key={copy.id} card={copy}>
                      <UnstyledButton
                        className={styles.glyphButton}
                        aria-label={copy.def.name}
                        onClick={() => onPick(copy.id)}
                      >
                        <CardGlyph card={copy} size={CHOOSER_GLYPH} />
                        {left > 1 && <span className={styles.badge}>{left}</span>}
                      </UnstyledButton>
                    </CardPreview>
                  ))}
                </div>
              </div>
            ))}
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
}: Readonly<{
  faction: FactionToken;
  state: TrackerState;
  onAction: (action: TrackerAction) => void;
}>) {
  const [open, setOpen] = useState(false);
  return (
    <Popover opened={open} onChange={setOpen} position="bottom" withinPortal shadow="md" width={CHOOSER_WIDTH}>
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

type SlotMode = 'menu' | 'give' | 'identify' | 'discard';

type SlotStepProps = Readonly<{
  faction: string;
  slot: Slot;
  card: CardCopy | null;
  factions: readonly FactionToken[];
  state: TrackerState;
  /** Sends the action and closes the popover. */
  act: (action: TrackerAction) => void;
  setMode: (mode: SlotMode) => void;
}>;

/* The first step: what happened to the card. */
function SlotMenu({ faction, slot, card, act, setMode }: SlotStepProps) {
  return (
    <Stack gap={2}>
      {!card && (
        <MenuLine icon={<UnknownGlyph size={16} />} onClick={() => setMode('identify')}>
          It's this card…
        </MenuLine>
      )}
      <MenuLine icon={<ArrowRightLeft size={14} />} onClick={() => setMode('give')}>
        Given to…
      </MenuLine>
      {/* A discarded card lands face up, so an unknown one is named as it goes. */}
      <MenuLine
        icon={<Trash2 size={14} />}
        onClick={() => (card ? act({ kind: 'discard', faction, slot: slot.id }) : setMode('discard'))}
      >
        {card ? 'Discarded' : 'Discarded as…'}
      </MenuLine>
      <MenuLine icon={<Undo2 size={14} />} onClick={() => act({ kind: 'undo', faction, slot: slot.id })}>
        Take back (a mistake)
      </MenuLine>
    </Stack>
  );
}

/* The step a menu line opened: the faction it went to, or the card it turned out to be, discarded or not. */
function SlotStep(props: SlotStepProps & Readonly<{ mode: SlotMode; close: () => void }>) {
  const { mode, faction, slot, factions, state, act, close } = props;
  if (mode === 'menu') {
    return <SlotMenu {...props} />;
  }
  if (mode === 'give') {
    return (
      <FactionPicker
        factions={factions}
        except={faction}
        size={26}
        label={(to) => `Given to ${to.name}`}
        onPick={(to) => act({ kind: 'give', faction, slot: slot.id, to })}
      />
    );
  }
  return (
    <CardChooser
      state={state}
      allowUnknown={false}
      onPick={(picked) => {
        if (!picked) {
          close();
          return;
        }
        act({ kind: 'identify', faction, slot: slot.id, card: picked });
        if (mode === 'discard') {
          act({ kind: 'discard', faction, slot: slot.id });
        }
      }}
    />
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
  const [mode, setMode] = useState<SlotMode>('menu');
  const card = slot.card ? copyOf(state, slot.card) : null;
  const close = () => {
    setOpen(false);
    setMode('menu');
  };
  const act = (action: TrackerAction) => {
    onAction(action);
    close();
  };
  return (
    <Popover
      opened={open}
      onChange={(next) => (next ? setOpen(true) : close())}
      position="bottom"
      withinPortal
      shadow="md"
      width={mode === 'identify' || mode === 'discard' ? CHOOSER_WIDTH : 'target'}
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
        <SlotStep
          mode={mode}
          faction={faction}
          slot={slot}
          card={card}
          factions={factions}
          state={state}
          act={act}
          setMode={setMode}
          close={close}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

export function MenuLine({
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
  const total = copies.length || 1;
  return (
    <div className={styles.kindBar} style={{ height }} aria-label={kindSummary(copies)}>
      {CARD_GROUPS.map((group) => {
        const count = copies.filter((copy) => groupOf(copy.def) === group).length;
        return count > 0 ? (
          <HoverCard key={group} openDelay={80} closeDelay={60} position="top" withinPortal shadow="md" withArrow>
            <HoverCard.Target>
              <button
                type="button"
                data-kind={group.split('-')[0]}
                data-group={group}
                className={styles.kindSlice}
                style={{ flexGrow: count / total }}
                aria-label={`${groupCount(group, count)} left`}
              />
            </HoverCard.Target>
            <HoverCard.Dropdown className={styles.dropdown}>
              <GroupList group={group} copies={copies} />
            </HoverCard.Dropdown>
          </HoverCard>
        ) : null;
      })}
    </div>
  );
}

/** Exactly which cards of a group are left, one line per card with how many copies. */
export function GroupList({
  group,
  copies,
  suffix = 'left',
  onPick,
}: Readonly<{
  group: CardGroup;
  copies: readonly CardCopy[];
  suffix?: string;
  /** Makes each line a button that picks one copy of that card. */
  onPick?: (copy: CardCopy) => void;
}>) {
  const byName = new Map<string, { copy: CardCopy; left: number }>();
  for (const copy of copies.filter((entry) => groupOf(entry.def) === group)) {
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
        {groupCount(
          group,
          lines.reduce((sum, line) => sum + line.left, 0)
        )}{' '}
        {suffix}
      </Text>
      <div className={styles.kindList}>
        {lines.map(({ copy, left }) => {
          const line = (
            <>
              <CardGlyph card={copy} size={22} />
              <Text size="sm">{copy.def.name}</Text>
              {left > 1 && <span className={styles.kindLeft}>×{left}</span>}
            </>
          );
          return onPick ? (
            <UnstyledButton
              key={copy.def.key}
              className={`${styles.kindLine} ${styles.menuLine}`}
              onClick={() => onPick(copy)}
            >
              {line}
            </UnstyledButton>
          ) : (
            <span key={copy.def.key} className={styles.kindLine}>
              {line}
            </span>
          );
        })}
      </div>
    </Stack>
  );
}

export function kindSummary(copies: readonly CardCopy[]): string {
  return CARD_GROUPS.map((group) => [group, copies.filter((copy) => groupOf(copy.def) === group).length] as const)
    .filter(([, count]) => count > 0)
    .map(([group, count]) => groupCount(group, count))
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
