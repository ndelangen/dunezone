import { Menu, NumberInput, Switch } from '@mantine/core';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { ArrowRight, Layers, Mic, RotateCcw, Settings2, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useMotionAllowed } from '@app/styles/motion';
import { useSpeech } from '@app/widgets/tutorial-guide/speech';

import {
  blowsOfTurn,
  canReveal,
  cardOf,
  MOST_PILES,
  newGame,
  nexus,
  nextPile,
  nextTurn,
  pileLetter,
  revealOne,
  revealSentence,
  spiceBlowOver,
  wormChance,
} from './spiceDeck';
import type { Blow, Reveal, SpiceDeckDef, SpiceDeckGame, SpiceRules } from './spiceDeck';
import styles from './SpiceDeckTool.module.css';
import { useSpiceDeckGame } from './useSpiceDeckGame';
import type { SpiceDeckSession } from './useSpiceDeckGame';
import { useCanListen, useVoiceCommands } from './useVoiceCommands';
import type { VoiceCommand } from './useVoiceCommands';

/*
 * The spice deck tool: a phone at a real table runs the spice deck, so nobody shuffles or sorts cards.
 * The spice piles are the buttons: a tap on a pile draws the top card off the deck, turns it over and lays it on that pile,
 * every card the same way, Shai-Hulud included. The tool never draws on by itself; the players decide what comes next
 * (Norbert, 2026-11-09). The draw pile and the set-aside spot are off screen: cards fly in from above, and a Shai-Hulud
 * the rules set aside lands on its pile first, then leaves to the side.
 */

type ToolProps = Readonly<{
  /** Where this browser keeps the game. */
  storageKey: string;
  /** The game to show before anything is stored, for stories; a real visit starts from the deck picker. */
  initial?: SpiceDeckGame;
  /** The decks a new game can be played with. */
  decks: readonly SpiceDeckDef[];
}>;

export function SpiceDeckTool({ storageKey, initial, decks }: ToolProps) {
  const session = useSpiceDeckGame(storageKey, initial);
  const { game } = session;
  if (!game) {
    return <DeckPicker decks={decks} onStart={(deck, rules) => session.start(newGame(deck, session.random, rules))} />;
  }
  return <Playing session={session} game={game} />;
}

/* Before a game: which deck, and the two rules a ruleset may change about the Spice Blow. */
function DeckPicker({
  decks,
  onStart,
}: Readonly<{ decks: readonly SpiceDeckDef[]; onStart: (deck: SpiceDeckDef, rules: SpiceRules) => void }>) {
  const [piles, setPiles] = useState(1);
  const [limit, setLimit] = useState(false);
  return (
    <div className={styles.tool}>
      <header className={styles.header}>
        <div className={styles.turn}>
          <span className={styles.turnNumber}>Spice deck</span>
          <span className={styles.deckName}>Pick the deck your table plays with</span>
        </div>
      </header>
      <main className={styles.body}>
        <div className={styles.pickRules}>
          <ControlBlock
            title="How many spice piles?"
            description={'A card is turned over for each pile, every turn.\nThe rulebook plays two, A and B.'}
            input={(field) => (
              <NumberInput
                {...field}
                min={1}
                max={MOST_PILES}
                clampBehavior="strict"
                allowDecimal={false}
                value={piles}
                onChange={(value) => setPiles(typeof value === 'number' ? value : 1)}
              />
            )}
          />
          <Switch
            checked={limit}
            onChange={(event) => setLimit(event.currentTarget.checked)}
            label="A third Shai-Hulud in one Spice Blow is shuffled back"
          />
        </div>
        <ul className={styles.deckList}>
          {decks.map((deck) => (
            <li key={deck.id}>
              <button
                type="button"
                className={styles.deckChoice}
                onClick={() => onStart(deck, limit ? { piles, wormsPerPhase: 2 } : { piles })}
              >
                {deck.back ? <img src={deck.back} alt="" className={styles.deckBack} /> : null}
                <span>
                  <strong>{deck.name}</strong>
                  <small>
                    {deck.ruleset ? `${deck.ruleset} · ` : ''}
                    {deck.cards.reduce((sum, card) => sum + card.count, 0)} cards
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

const pileName = (game: SpiceDeckGame, pile: number) =>
  game.piles > 1 ? `Spice pile ${pileLetter(pile)}` : 'Spice pile';

const revealCount = (game: SpiceDeckGame) => game.blows.reduce((sum, blow) => sum + blow.reveals.length, 0);

/** A card on its way from the deck to a pile, and off to the side when the rules set it aside. */
type Flight = Readonly<{ key: number; pile: number; copy: string; toAside: boolean; reveal: Reveal }>;

/* The flight's timing: off the deck, turned over on the way, laid on the pile; a set-aside card rests there before it moves on. */
const FLIGHT_MS = 1500;
const ASIDE_REST_MS = 500;
const ASIDE_MS = 450;
/* The moments in the flight, as fractions of it: in from above to the middle of the screen, a snap turn, a beat to read it, the slam. */
const AT_CENTRE = 0.26;
const TURNED = 0.4;
const SLAM_START = 0.62;
const IMPACT = 0.8;
/* How much bigger than the pile the card shows in the middle of the screen. */
const SHOWCASE = 1.55;

function Playing({ session, game }: Readonly<{ session: SpiceDeckSession; game: SpiceDeckGame }>) {
  const motion = useMotionAllowed();
  const speech = useSpeech();
  const [voice, setVoice] = useState(false);
  const [listen, setListen] = useState(false);
  const canListen = useCanListen();
  const [flight, setFlight] = useState<Flight | undefined>(undefined);

  /* A new card turned over (not one taken back, nor the game as it loaded) starts its flight. */
  const seen = useRef(revealCount(game));
  useEffect(() => {
    const count = revealCount(game);
    const grew = count === seen.current + 1;
    seen.current = count;
    const blow = game.blows.findLast((entry) => entry.turn === game.turn && entry.pile === game.pile);
    const reveal = blow?.reveals.at(-1);
    if (!grew || !reveal || reveal.card === null) {
      setFlight(undefined);
      return;
    }
    const toAside = reveal.kind === 'set-aside' || reveal.kind === 'ignored';
    const landed = () => {
      setFlight(undefined);
      if (voice) {
        speech.speak(`${pileName(game, game.pile)}. ${revealSentence(game, reveal)}`);
      }
    };
    if (!motion) {
      landed();
      return;
    }
    setFlight({ key: count, pile: game.pile, copy: reveal.card, toAside, reveal });
    const timer = setTimeout(landed, FLIGHT_MS + (toAside ? ASIDE_REST_MS + ASIDE_MS : 0));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new card starts a flight
  }, [game]);

  const turnOver = useCallback(
    (pile: number) => {
      if (!flight) {
        session.act((current, random) => revealOne(current, random, pile));
      }
    },
    [flight, session]
  );

  const onCommand = useCallback(
    (command: VoiceCommand) => {
      if (command === 'undo') {
        session.undo();
      } else if (command === 'repeat') {
        const reveal = game.blows.at(-1)?.reveals.at(-1);
        if (reveal) {
          speech.speak(revealSentence(game, reveal));
        }
      } else if (command === 'next') {
        session.act(nextTurn);
      } else {
        turnOver(nextPile(game) ?? 0);
      }
    },
    [game, session, speech, turnOver]
  );
  /* Never listens while it speaks, or it would hear its own "spice". */
  const { listening } = useVoiceCommands(listen && canListen && !speech.speaking, onCommand);

  const over = spiceBlowOver(game);
  return (
    <div className={styles.tool}>
      <header className={styles.header}>
        <div className={styles.turn}>
          <span className={styles.turnNumber}>Turn {game.turn}</span>
          <span className={styles.deckName}>
            {game.deck.name} · {game.draw.length + (flight ? 1 : 0)} left · {Math.round(wormChance(game) * 100)}%
            Shai-Hulud
          </span>
        </div>
        <IconAction
          label="Take back"
          tooltip="Take back the last card"
          emphasis="quiet"
          intent="neutral"
          icon={<RotateCcw size={20} />}
          disabledReason={session.canUndo ? undefined : 'Nothing to take back yet.'}
          onClick={session.undo}
        />
        <IconAction
          label={voice ? 'Stop reading cards aloud' : 'Read cards aloud'}
          emphasis="quiet"
          intent="neutral"
          pressed={voice}
          icon={voice ? <Volume2 size={20} /> : <VolumeX size={20} />}
          onClick={() => {
            if (voice) {
              speech.stop();
            }
            setVoice(!voice);
          }}
        />
        {canListen ? (
          <IconAction
            label={listen ? 'Stop listening' : 'Listen for “spice blow”'}
            tooltip={listening ? 'Listening: say “spice blow”, “next turn”, “repeat” or “undo”' : undefined}
            emphasis="quiet"
            intent="neutral"
            pressed={listen}
            icon={<Mic size={20} />}
            onClick={() => setListen(!listen)}
          />
        ) : null}
        <GameMenu session={session} game={game} />
      </header>
      <main className={styles.body}>
        <Table game={game} flight={flight} onPile={turnOver} />
      </main>
      <footer className={styles.footer}>
        {over && nexus(game) ? (
          <p className={styles.nexus}>Nexus! Shai-Hulud came up: alliances may be made and broken.</p>
        ) : null}
        <LabeledAction
          emphasis={over ? 'strong' : 'standard'}
          size="lg"
          className={styles.primary}
          icon={<ArrowRight size={20} />}
          onClick={() => session.act(nextTurn)}
        >
          {`Start turn ${game.turn + 1}`}
        </LabeledAction>
      </footer>
    </div>
  );
}

/* Where an element sits inside the table, for a flight between two of them. */
function boxIn(table: HTMLElement, element: Element | null | undefined) {
  if (!element) {
    return undefined;
  }
  const outer = table.getBoundingClientRect();
  const inner = element.getBoundingClientRect();
  return { x: inner.left - outer.left, y: inner.top - outer.top, w: inner.width, h: inner.height };
}

function Table({
  game,
  flight,
  onPile,
}: Readonly<{
  game: SpiceDeckGame;
  flight: Flight | undefined;
  onPile: (pile: number) => void;
}>) {
  const table = useRef<HTMLDivElement>(null);
  const piles = useRef<(HTMLButtonElement | null)[]>([]);
  const flyer = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const turnBlows = blowsOfTurn(game);
  const next = nextPile(game);
  const blocked = !canReveal(game);

  /* The flying card: in from the deck above the screen, turned over big in the middle, slammed onto its pile; a set-aside card then leaves to the side. */
  useLayoutEffect(() => {
    const card = flyer.current;
    if (!flight || !card || !table.current) {
      return;
    }
    const to = boxIn(table.current, piles.current[flight.pile]?.querySelector('[data-card]'));
    if (!to) {
      return;
    }
    /* The draw pile is above the screen, the set-aside spot beyond its right edge. */
    const outer = table.current.getBoundingClientRect();
    const from = { x: to.x, y: -outer.top - to.h - 24, w: to.w };
    const rest = { x: outer.width + 24, y: to.y, w: to.w };
    const at = (box: { x: number; y: number; w: number }, lift = 1) =>
      `translate(${box.x}px, ${box.y}px) scale(${(box.w / to.w) * lift})`;
    card.style.width = `${to.w}px`;
    card.style.height = `${to.h}px`;
    const centre = {
      x: (outer.width - to.w * SHOWCASE) / 2,
      y: Math.max(8, window.innerHeight / 2 - outer.top - (to.h * SHOWCASE) / 2),
      w: to.w * SHOWCASE,
    };
    /* In from above, held big for a beat, then slammed down onto the pile, overshooting into it and settling. */
    const travel = card.animate(
      [
        { transform: at(from, 0.9), offset: 0, easing: 'cubic-bezier(.2,.8,.3,1)' },
        { transform: at(centre), offset: AT_CENTRE },
        { transform: at(centre, 1.04), offset: SLAM_START - 0.04, easing: 'ease-out' },
        { transform: at(centre, 1.1), offset: SLAM_START, easing: 'cubic-bezier(.55,0,.9,.4)' },
        { transform: at(to, 0.92), offset: IMPACT, easing: 'ease-out' },
        { transform: at(to, 1.04), offset: IMPACT + 0.08, easing: 'ease-in-out' },
        { transform: at(to), offset: 1 },
      ],
      { duration: FLIGHT_MS, fill: 'forwards' }
    );
    /* A snap turn with a little overshoot, as a card game deals a card face up. */
    const turn = card.querySelector('[data-turn]')!.animate(
      [
        { transform: 'rotateY(180deg)', offset: 0 },
        { transform: 'rotateY(180deg)', offset: AT_CENTRE - 0.02, easing: 'cubic-bezier(.5,0,.2,1)' },
        { transform: 'rotateY(-14deg)', offset: TURNED, easing: 'ease-out' },
        { transform: 'rotateY(0deg)', offset: TURNED + 0.06 },
        { transform: 'rotateY(0deg)', offset: 1 },
      ],
      { duration: FLIGHT_MS, fill: 'forwards' }
    );
    const impact = FLIGHT_MS * IMPACT;
    /* The landing: a ring bursts from the pile and the pile jolts under the card. */
    if (ring.current) {
      ring.current.style.transform = `translate(${to.x}px, ${to.y}px)`;
      ring.current.style.width = `${to.w}px`;
      ring.current.style.height = `${to.h}px`;
    }
    const burst = ring.current?.animate(
      [
        { opacity: 0, scale: '0.9' },
        { opacity: 0.9, scale: '1', offset: 0.1 },
        { opacity: 0, scale: '1.45' },
      ],
      { duration: 520, delay: impact, easing: 'ease-out', fill: 'both' }
    );
    const jolt = piles.current[flight.pile]?.animate(
      [
        { translate: '0 0' },
        { translate: '0 6px', offset: 0.2 },
        { translate: '-3px -2px', offset: 0.45 },
        { translate: '2px 1px', offset: 0.7 },
        { translate: '0 0' },
      ],
      { duration: 340, delay: impact }
    );
    const moves = [travel, turn, ...(burst ? [burst] : []), ...(jolt ? [jolt] : [])];
    if (flight.toAside) {
      moves.push(
        card.animate([{ transform: at(to) }, { transform: at(rest) }], {
          duration: ASIDE_MS,
          delay: FLIGHT_MS + ASIDE_REST_MS,
          easing: 'ease-in-out',
          fill: 'forwards',
        })
      );
    }
    return () => moves.forEach((move) => move.cancel());
  }, [flight]);

  return (
    <div ref={table} className={styles.table}>
      <div className={styles.pileRow} data-piles={Math.min(game.piles, 3)}>
        {game.discards.map((pile, index) => {
          const landing = flight?.pile === index && !flight.toAside;
          const top = landing ? pile.at(-2) : pile.at(-1);
          const count = pile.length - (landing ? 1 : 0);
          return (
            <button
              key={index}
              ref={(element) => {
                piles.current[index] = element;
              }}
              type="button"
              className={styles.pileButton}
              data-next={index === next || undefined}
              disabled={blocked || flight !== undefined}
              aria-label={`Turn over a card onto ${pileName(game, index).toLowerCase()}`}
              onClick={() => onPile(index)}
            >
              {top ? <CardFace game={game} copy={top} /> : <span className={styles.slot} data-card />}
              <span className={styles.caption}>
                {pileName(game, index)} · {count}
              </span>
            </button>
          );
        })}
      </div>
      {flight ? (
        <div key={`ring-${flight.key}`} ref={ring} className={styles.ring} data-kind={flight.reveal.kind} />
      ) : null}
      {flight ? (
        <div key={flight.key} ref={flyer} className={styles.flyer} aria-hidden>
          <div className={styles.flyerTurn} data-turn>
            <CardFace game={game} copy={flight.copy} className={styles.front} />
            <CardFace game={game} back className={styles.backFace} />
          </div>
        </div>
      ) : null}
      {turnBlows.length === 0 ? (
        <p className={styles.hint}>
          Turn {game.turn}: tap a spice pile to turn over its card{game.piles > 1 ? ', A first' : ''}.
        </p>
      ) : (
        turnBlows
          .map((blow) => landedPart(blow, flight))
          .map((blow, index) =>
            blow.reveals.length > 0 ? (
              <section key={index} className={styles.blowCard}>
                <h3 className={styles.blowTitle}>{pileName(game, blow.pile)}</h3>
                <BlowLines game={game} blow={blow} />
              </section>
            ) : null
          )
      )}
      {turnBlows.length > 0 ? (
        <p className={styles.hint}>
          No spice lands if the territory’s spice is under the storm; the card still counts.
        </p>
      ) : null}
    </div>
  );
}

/* A blow's lines as far as the table has seen: the card in flight is told once it lands. */
function landedPart(blow: Blow, flight: Flight | undefined): Blow {
  return flight && blow.reveals.at(-1) === flight.reveal ? { ...blow, reveals: blow.reveals.slice(0, -1) } : blow;
}

function GameMenu({ session, game }: Readonly<{ session: SpiceDeckSession; game: SpiceDeckGame }>) {
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <IconAction label="Game settings" emphasis="quiet" intent="neutral" icon={<Settings2 size={20} />} />
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{game.deck.name}</Menu.Label>
        <Menu.Item
          leftSection={<Layers size={16} />}
          onClick={() => session.start(newGame(game.deck, session.random, rulesOf(game)))}
        >
          New game, same deck
        </Menu.Item>
        <Menu.Item onClick={() => session.start(undefined)}>Pick another deck</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

const rulesOf = (game: SpiceDeckGame) =>
  game.wormsPerPhase === undefined ? { piles: game.piles } : { piles: game.piles, wormsPerPhase: game.wormsPerPhase };

function CardFace({
  game,
  copy,
  back = false,
  className,
}: Readonly<{ game: SpiceDeckGame; copy?: string; back?: boolean; className?: string }>) {
  const card = copy ? cardOf(game, copy) : undefined;
  const src = back ? game.deck.back : card?.face;
  return (
    <span className={`${styles.card} ${className ?? ''}`} data-card data-empty={!src || undefined}>
      {src ? <img src={src} alt={back ? 'Spice deck' : (card?.name ?? '')} draggable={false} /> : null}
    </span>
  );
}

/** What one turned card asks of the table, in a line. */
function RevealLine({ game, reveal }: Readonly<{ game: SpiceDeckGame; reveal: Reveal }>) {
  if (reveal.kind === 'reshuffle') {
    return <li className={styles.line}>The deck ran out: the spice piles shuffled into a new deck.</li>;
  }
  const card = cardOf(game, reveal.card);
  if (reveal.kind === 'spice') {
    return (
      <li className={styles.line} data-kind="spice">
        <strong>{card.amount} spice</strong> in {card.name}
      </li>
    );
  }
  if (reveal.kind === 'set-aside') {
    return (
      <li className={styles.line} data-kind="aside">
        Shai-Hulud on turn 1: set aside, shuffled back when the turn ends
      </li>
    );
  }
  if (reveal.kind === 'ignored') {
    return (
      <li className={styles.line} data-kind="aside">
        Shai-Hulud again: one too many this turn, set aside
      </li>
    );
  }
  return (
    <li className={styles.line} data-kind="worm">
      <strong>Shai-Hulud</strong>{' '}
      {reveal.devours ? (
        <>devours all spice and forces in {cardOf(game, reveal.devours).name}</>
      ) : (
        'finds no territory to devour'
      )}
    </li>
  );
}

function BlowLines({ game, blow }: Readonly<{ game: SpiceDeckGame; blow: Blow }>) {
  return (
    <ol className={styles.lines}>
      {blow.reveals.map((reveal, index) => (
        <RevealLine key={index} game={game} reveal={reveal} />
      ))}
    </ol>
  );
}
