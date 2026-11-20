import { Group, Stack, Switch, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { HelpMark } from '@ui/content/HelpMark';
import { Kbd } from '@ui/content/Kbd';
import { Stepper } from '@ui/control/Stepper';
import { TooltipTarget } from '@ui/control/TooltipTarget';
import { DarkSchemeIsland } from '@ui/surface/DarkSchemeIsland';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useEffectEvent, useState } from 'react';

import { Token as FactionToken } from '@game/assets/faction/token/Token';

import bidder from '../Bidder.module.css';
import styles from './BidderPrototype.module.css';
import type { PrototypeRound } from './prototypeRound';
import {
  bidTo,
  handOn,
  lowerOne,
  openRound,
  otherFactionActs,
  pass,
  raiseOne,
  thinkingMs,
  TURN_MS,
  VIEWER,
} from './prototypeRound';

/**
 * The bidding prototypes of #2983, one per story.
 * `today` is the bidder as it ships;
 * `quick` raises by +1, +2 or +5 and hands on;
 * `stepper` bids a set amount with Enter.
 * `typed` types the amount or picks it from a ladder;
 * `autoPass` adds "out for this card" and a ceiling to today's bidder.
 * `combined` puts the stepper, the quick raises and the auto-pass together.
 */
export type BidderVariant = 'today' | 'quick' | 'stepper' | 'typed' | 'autoPass' | 'combined';

export type PrototypeFaction = {
  name: string;
  token: ComponentProps<typeof FactionToken>;
};

type Props = {
  variant: BidderVariant;
  factions: Readonly<Record<string, PrototypeFaction>>;
};

const HOW: Record<BidderVariant, { title: string; help: string }> = {
  today: {
    title: 'Today',
    help: 'The bidder as it plays now.\nEach click or I raises by one and keeps the turn; O takes a raise back; P hands the bidder on, which is a pass if you did not raise.',
  },
  quick: {
    title: 'Quick raises',
    help: 'Raise by +1, +2 or +5 with one click or the 1, 2 and 5 keys.\nA raise is your whole turn:\nthe bidder moves on at once.\nP passes.',
  },
  stepper: {
    title: 'Set an amount, then bid',
    help: 'Pick your bid with ↑ and ↓, the wheel over the bidder, or − and +.\nEnter or a click on the bidder places it and hands the bidder on.\nP passes.',
  },
  typed: {
    title: 'Type the amount',
    help: 'Type the number you want to bid and press Enter, or click one of the next five amounts.\nBackspace corrects, P passes.',
  },
  autoPass: {
    title: 'Today, with auto-pass',
    help: 'Today’s controls, plus two settings you can change while others bid:\n“Out for this card” passes for you every time the bidder reaches you, and “Stay in up to” passes for you once the bid reaches your ceiling.\nBoth reset for the next card.',
  },
  combined: {
    title: 'All together',
    help: 'Set an amount with ↑ and ↓ and bid it with Enter, or raise by +1, +2 or +5 with one click or the 1, 2 and 5 keys.\nAuto-pass sits underneath.',
  },
};

const QUICK = [1, 2, 5] as const;

function quickRaises(variant: BidderVariant) {
  return variant === 'quick' || variant === 'combined';
}
function setsAmount(variant: BidderVariant) {
  return variant === 'stepper' || variant === 'combined';
}
function oneAtATime(variant: BidderVariant) {
  return variant === 'today' || variant === 'autoPass';
}
function autoPasses(variant: BidderVariant) {
  return variant === 'autoPass' || variant === 'combined';
}

/* A clock for the prototype: the stories run without a table, so `performance.now()` stands in for the server. */
function useNow(): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function TokenDisc({ faction }: { faction: PrototypeFaction | undefined }) {
  return faction ? <FactionToken {...faction.token} /> : null;
}

/** A round button of the bidder's face with its key, the same pill as today's raise, take-back and pass. */
function FaceButton({
  children,
  shortcut,
  hint,
  disabled,
  onClick,
}: {
  children: ReactNode;
  shortcut?: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={hint}>
      <TooltipTarget>
        <UnstyledButton
          className={bidder.turnButton}
          aria-label={hint}
          aria-keyshortcuts={shortcut}
          disabled={disabled}
          onClick={(event) => {
            event.currentTarget.blur();
            onClick();
          }}
        >
          <span className={bidder.turnSign}>{children}</span>
          {shortcut ? <Kbd>{shortcut}</Kbd> : null}
        </UnstyledButton>
      </TooltipTarget>
    </Tooltip>
  );
}

/* The factions on a ring around the bidder: the one it points at glows, and the ones that passed fade. */
function Ring({ round, factions }: { round: PrototypeRound; factions: Props['factions'] }) {
  return (
    <>
      {round.order.map((factionId, index) => {
        const angle = (index / round.order.length) * Math.PI * 2 + Math.PI / 2;
        const faction = factions[factionId];
        return (
          <Tooltip key={factionId} label={faction?.name ?? factionId}>
            <div
              className={styles.seat}
              data-turn={round.turn === factionId || undefined}
              data-passed={round.passed.includes(factionId) || undefined}
              data-viewer={factionId === VIEWER || undefined}
              style={{ left: `${50 + Math.cos(angle) * 42}%`, top: `${50 + Math.sin(angle) * 42}%` }}
            >
              <TokenDisc faction={faction} />
            </div>
          </Tooltip>
        );
      })}
    </>
  );
}

function ClockRing({ remaining }: { remaining: number }) {
  const drained = 100 - (remaining / TURN_MS) * 100;
  return (
    <svg className={bidder.clockRing} viewBox="0 0 104 104" aria-hidden="true">
      <circle className={bidder.clockTrack} cx="52" cy="52" r="49" />
      <circle
        className={bidder.clockArc}
        cx="52"
        cy="52"
        r="49"
        pathLength="100"
        style={{ strokeDashoffset: drained }}
      />
    </svg>
  );
}

/** The auto-pass settings, which a player changes at any time in the round, their own turn or not. */
function AutoPass({
  out,
  ceiling,
  high,
  onOut,
  onCeiling,
}: {
  out: boolean;
  ceiling: number | null;
  high: number;
  onOut: (out: boolean) => void;
  onCeiling: (ceiling: number | null) => void;
}) {
  return (
    <Group gap="sm" wrap="nowrap" className={styles.autoPass} role="group" aria-label="Auto-pass">
      <Switch
        size="xs"
        label="Out for this card"
        checked={out}
        onChange={(event) => onOut(event.currentTarget.checked)}
      />
      <Switch
        size="xs"
        label="Stay in up to"
        disabled={out}
        checked={ceiling !== null}
        onChange={(event) => onCeiling(event.currentTarget.checked ? Math.max(high + 2, 3) : null)}
      />
      <Stepper
        size="sm"
        label="Most you will bid"
        value={ceiling ?? Math.max(high + 2, 3)}
        min={1}
        max={99}
        disabled={out || ceiling === null}
        onChange={onCeiling}
      />
      <HelpMark
        text={
          'Passes for you when the bidder reaches you:\non every turn while you are out, or once the bid is at your ceiling.\nBoth reset for the next card.'
        }
      />
    </Group>
  );
}

function outcome(round: PrototypeRound, factions: Props['factions']) {
  if (!round.bid) {
    return 'No bids';
  }
  return `${factions[round.bid.factionId]?.name ?? round.bid.factionId} wins with ${round.bid.amount}`;
}

/** One bidding prototype: a playable round against four factions that bid on their own. */
export function BidderPrototype({ variant, factions }: Props) {
  const now = useNow();
  const [round, setRound] = useState(() => openRound(1, performance.now()));
  const [chosen, setAmount] = useState(1);
  const [typed, setTyped] = useState('');
  const [out, setOut] = useState(false);
  const [ceiling, setCeiling] = useState<number | null>(null);
  const high = round.bid?.amount ?? 0;
  const mine = round.turn === VIEWER;
  const remaining = Math.max(0, round.deadline - now);
  /* The amount never sits below one above the high bid, which is the least a bid can be. */
  const amount = Math.max(chosen, high + 1);

  /* The other factions think, then act; the viewer's own clock passes for them when it runs out. */
  useEffect(() => {
    if (!round.turn) {
      return;
    }
    if (round.turn !== VIEWER) {
      const timer = setTimeout(
        () => setRound((current) => otherFactionActs(current, performance.now())),
        thinkingMs(round)
      );
      return () => clearTimeout(timer);
    }
    const autoPass = autoPasses(variant) && (out || (ceiling !== null && high >= ceiling));
    if (autoPass) {
      const note = out ? 'Passed for you: out for this card' : `Passed for you: the bid reached ${ceiling}`;
      const timer = setTimeout(() => setRound((current) => pass(current, performance.now(), note)), 600);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(
      () => setRound((current) => pass(current, performance.now(), 'Passed for you: time ran out')),
      Math.max(0, round.deadline - performance.now())
    );
    return () => clearTimeout(timer);
  }, [round, variant, out, ceiling, high]);

  const act = (change: (current: PrototypeRound, at: number) => PrototypeRound) => {
    setTyped('');
    setRound((current) => (current.turn === VIEWER ? { ...change(current, performance.now()), note: null } : current));
  };
  const placeBid = (value: number) => act((current, at) => bidTo(current, value, at));
  const passTurn = () => act((current, at) => (oneAtATime(variant) ? handOn(current, at) : pass(current, at)));
  const nextCard = () => {
    setRound((current) => openRound(current.card + 1, performance.now()));
    setOut(false);
    setCeiling(null);
    setAmount(1);
  };

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (!round.turn && event.key === 'Enter') {
      nextCard();
      return;
    }
    if (!mine) {
      return;
    }
    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    if (key === 'P') {
      passTurn();
    } else if (oneAtATime(variant) && key === 'I') {
      act(raiseOne);
    } else if (oneAtATime(variant) && key === 'O') {
      act(lowerOne);
    } else if (quickRaises(variant) && ['1', '2', '5'].includes(key)) {
      placeBid(high + Number(key));
    } else if (setsAmount(variant) && (key === 'ArrowUp' || key === 'ArrowDown')) {
      setAmount(Math.max(high + 1, amount + (key === 'ArrowUp' ? 1 : -1)));
    } else if (setsAmount(variant) && key === 'Enter') {
      placeBid(amount);
    } else if (variant === 'typed' && /^[0-9]$/.test(key)) {
      setTyped((before) => (before + key).slice(-2));
    } else if (variant === 'typed' && key === 'Backspace') {
      setTyped((before) => before.slice(0, -1));
    } else if (variant === 'typed' && key === 'Enter' && typed !== '') {
      placeBid(Number(typed));
    } else {
      return;
    }
    event.preventDefault();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const typedTooLow = variant === 'typed' && typed !== '' && Number(typed) <= high;
  const discLabel = !mine
    ? 'Not your turn'
    : oneAtATime(variant)
      ? `Raise the bid to ${high + 1}`
      : setsAmount(variant)
        ? `Bid ${amount}`
        : 'Your turn';
  const discClick = () => {
    if (oneAtATime(variant)) {
      act(raiseOne);
    } else if (setsAmount(variant)) {
      placeBid(amount);
    }
  };
  const turnName = round.turn ? (factions[round.turn]?.name ?? round.turn) : '';

  return (
    <DarkSchemeIsland>
      <Stack gap="xs" align="center" className={styles.frame}>
        <Group gap={6} className={styles.title}>
          <Text fw={700}>{HOW[variant].title}</Text>
          <HelpMark text={HOW[variant].help} />
        </Group>
        <div className={styles.stage}>
          <Ring round={round} factions={factions} />
          <Stack gap={4} align="center" className={`${bidder.face} ${styles.centre}`}>
            <div className={round.turn ? bidder.clockWrap : undefined}>
              {round.turn ? <ClockRing remaining={remaining} /> : null}
              <Tooltip label={discLabel}>
                <TooltipTarget
                  onContextMenu={(event) => {
                    event.preventDefault();
                    if (mine) {
                      passTurn();
                    }
                  }}
                >
                  <UnstyledButton
                    className={bidder.disc}
                    data-mine={mine || undefined}
                    aria-label={discLabel}
                    disabled={!mine || variant === 'quick' || variant === 'typed'}
                    onClick={discClick}
                    onWheel={(event) => {
                      if (mine && setsAmount(variant)) {
                        setAmount(Math.max(high + 1, amount + (event.deltaY < 0 ? 1 : -1)));
                      }
                    }}
                  >
                    {mine && setsAmount(variant) ? (
                      <span className={bidder.amount}>{amount}</span>
                    ) : mine && variant === 'typed' && typed !== '' ? (
                      <span className={typedTooLow ? `${bidder.amount} ${styles.tooLow}` : bidder.amount}>{typed}</span>
                    ) : round.bid ? (
                      <>
                        <TokenDisc faction={factions[round.bid.factionId]} />
                        <span className={bidder.amount}>{round.bid.amount}</span>
                      </>
                    ) : (
                      <span className={bidder.prompt}>{mine ? 'Bid' : 'No bid'}</span>
                    )}
                  </UnstyledButton>
                </TooltipTarget>
              </Tooltip>
            </div>
            <Text component="output" size="xs" fw={700} className={bidder.timer}>
              {!round.turn
                ? outcome(round, factions)
                : mine && setsAmount(variant)
                  ? `High bid ${high || 'none'} · ${Math.ceil(remaining / 1000)}s`
                  : mine && variant === 'typed'
                    ? typedTooLow
                      ? `Bid more than ${high}`
                      : `High bid ${high || 'none'} · ${Math.ceil(remaining / 1000)}s`
                    : `${Math.ceil(remaining / 1000)}s · ${mine ? 'Your turn' : turnName}`}
            </Text>
            {round.turn ? (
              <Group
                gap={6}
                justify="center"
                wrap="nowrap"
                role="group"
                aria-label="Your bid"
                inert={!mine}
                data-waiting={mine ? undefined : true}
                className={bidder.turnButtons}
              >
                {oneAtATime(variant) && (
                  <>
                    <FaceButton shortcut="I" hint={`Raise the bid to ${high + 1}`} onClick={() => act(raiseOne)}>
                      +
                    </FaceButton>
                    <FaceButton
                      shortcut="O"
                      hint="Take back your last raise"
                      disabled={round.bid?.factionId !== VIEWER}
                      onClick={() => act(lowerOne)}
                    >
                      −
                    </FaceButton>
                  </>
                )}
                {quickRaises(variant) &&
                  QUICK.map((step) => (
                    <FaceButton
                      key={step}
                      shortcut={String(step)}
                      hint={`Bid ${high + step}`}
                      onClick={() => placeBid(high + step)}
                    >
                      +{step}
                    </FaceButton>
                  ))}
                {setsAmount(variant) && variant === 'stepper' && (
                  <>
                    <FaceButton
                      shortcut="↓"
                      hint="One less"
                      disabled={amount <= high + 1}
                      onClick={() => setAmount(Math.max(high + 1, amount - 1))}
                    >
                      −
                    </FaceButton>
                    <FaceButton shortcut="↑" hint="One more" onClick={() => setAmount(amount + 1)}>
                      +
                    </FaceButton>
                    <FaceButton shortcut="Enter" hint={`Bid ${amount} and hand on`} onClick={() => placeBid(amount)}>
                      Bid
                    </FaceButton>
                  </>
                )}
                {variant === 'typed' &&
                  [1, 2, 3, 4, 5].map((step) => (
                    <FaceButton key={step} hint={`Bid ${high + step}`} onClick={() => placeBid(high + step)}>
                      {high + step}
                    </FaceButton>
                  ))}
                <FaceButton
                  shortcut="P"
                  hint={oneAtATime(variant) && round.bid?.factionId === VIEWER ? 'Hand the bidder on' : 'Pass'}
                  onClick={passTurn}
                >
                  Pass
                </FaceButton>
              </Group>
            ) : (
              <FaceButton shortcut="Enter" hint="Auction the next card" onClick={nextCard}>
                Next card
              </FaceButton>
            )}
            {variant === 'combined' && round.turn && mine ? (
              <Text size="xs" className={bidder.timer}>
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> set · <Kbd>Enter</Kbd> bid {amount}
              </Text>
            ) : null}
            {round.note ? (
              <Text size="xs" fw={700} className={bidder.timer}>
                {round.note}
              </Text>
            ) : null}
          </Stack>
        </div>
        {autoPasses(variant) && round.turn ? (
          <AutoPass out={out} ceiling={ceiling} high={high} onOut={setOut} onCeiling={setCeiling} />
        ) : null}
      </Stack>
    </DarkSchemeIsland>
  );
}
