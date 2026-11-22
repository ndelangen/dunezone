import { Menu, NumberInput } from '@mantine/core';
import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { FetchProgress } from '@ui/content/FetchProgress';
import { preloadPublishedImage, preloadPublishedImages } from '@ui/content/preloadPublishedImage';
import { PublishedImage } from '@ui/content/PublishedImage';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Card } from '@ui/surface/Card';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Layers,
  Mic,
  RotateCcw,
  Settings2,
  Shuffle,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

import { readSpiceDeck, useSpiceDeckChoices } from '@app/db/spiceDeckTool';
import { toolPageHead } from '@app/routes/_app/tools/toolHead';
import { useMotionAllowed } from '@app/styles/motion';
import { useSpeech } from '@app/widgets/speech/speech';

import styles from './route.module.css';
import {
  blowsOfTurn,
  canReveal,
  cardOf,
  newGame,
  nextPile,
  nextTurn,
  lastPlayed,
  MOST_PEEK,
  MOST_PILES,
  peekAt,
  pileLetter,
  revealOne,
  revealSentence,
  setAsideLast,
  spiceBlowOver,
  wormChance,
} from './spiceDeck';
import type { Blow, Reveal, SpiceDeckDef, SpiceDeckGame, SpiceRules } from './spiceDeck';
import { spiceDeckFromSupply } from './spiceDeckSupply';
import type { SpiceDeckChoice } from './spiceDeckSupply';
import { SPICE_DECK_STORAGE_KEY, useSpiceDeckGame } from './useSpiceDeckGame';
import type { SpiceDeckSession } from './useSpiceDeckGame';
import { useCanListen, useVoiceCommands } from './useVoiceCommands';
import type { VoiceCommand } from './useVoiceCommands';

/*
 * The spice deck tool at /tools/spice-deck, the address its placeholder held.
 * A standalone page with no app chrome: public, indexed and the same HTML for every visitor; the game, kept in this browser's storage, starts in the browser.
 */
export const Route = createFileRoute('/_tool/tools/spice-deck')({
  ssr: true,
  head: ({ match }) => toolPageHead('spice-deck', { description: SPICE_DECK_LEDE, match }),
  component: SpiceDeckPage,
});

/* The whole screen is the tool, so a phone on the table shows the piles and nothing else; the title is there for screen readers and crawlers. */
function SpiceDeckPage() {
  return (
    <PageLayout height="fullscreen">
      <PageLayout.Header>
        <PageTitle title="Spice deck" lede={SPICE_DECK_LEDE} />
      </PageLayout.Header>
      <PageLayout.Content width="viewport">
        <ClientOnly fallback={<div className={styles.tool} />}>
          <SpiceDeckTool storageKey={SPICE_DECK_STORAGE_KEY} />
        </ClientOnly>
      </PageLayout.Content>
    </PageLayout>
  );
}

const SPICE_DECK_LEDE =
  'Run the Dune board game’s spice deck on a phone: pick your Ruleset’s deck, tap a spice pile to turn over its card, and see what Shai-Hulud devours.';

/*
 * The spice deck tool: a phone at a real table runs the spice deck, so nobody shuffles or sorts cards.
 * The spice piles are the buttons: a tap on a pile draws the top card off the deck, turns it over and lays it on that pile,
 * every card the same way, Shai-Hulud included. The tool never draws on by itself; the players decide what comes next
 * (Norbert, 2026-11-09). The draw pile and the set-aside spot are off screen: cards fly in from above, and a Shai-Hulud
 * the rules set aside lands on its pile first, then leaves to the side.
 */

function SpiceDeckTool({ storageKey }: Readonly<{ storageKey: string }>) {
  const session = useSpiceDeckGame(storageKey);
  const { game } = session;
  /* Picking another deck keeps the game until the new deck is in, so backing out or a deck that fails to load loses nothing. */
  const [choosing, setChoosing] = useState(false);
  if (!game || choosing) {
    return (
      <CatalogueDeckPicker
        onStart={(deck, rules) => {
          session.start(newGame(deck, session.random, rules));
          setChoosing(false);
        }}
        onBack={game ? () => setChoosing(false) : undefined}
      />
    );
  }
  return <Playing session={session} game={game} onPickDeck={() => setChoosing(true)} />;
}

/*
 * The picker with the catalogue's decks: the rulesets that slot one, and a picked deck's cards read once to live in the stored game.
 * Only the picker subscribes to the catalogue, so a table mid-game holds no query open.
 */
function CatalogueDeckPicker(actions: PickerActions) {
  const { data } = useSpiceDeckChoices();
  const decks = useMemo(
    () => data?.map((entry) => ({ id: entry.rulesetId, name: entry.deck.name, ruleset: entry.ruleset })),
    [data]
  );
  const loadDeck = useCallback(
    async (choice: SpiceDeckChoice) => {
      const entry = data?.find((candidate) => candidate.rulesetId === choice.id);
      const supply = entry ? await readSpiceDeck(entry.deck) : null;
      if (!supply) {
        throw new Error(`The ${choice.name} is not in the catalogue.`);
      }
      return spiceDeckFromSupply(choice, supply);
    },
    [data]
  );
  return <DeckPicker decks={decks} loadDeck={loadDeck} {...actions} />;
}

type PickerActions = Readonly<{
  onStart: (deck: SpiceDeckDef, rules: SpiceRules) => void;
  /** Back to the game being played, when there is one. */
  onBack?: () => void;
}>;

/* Every picture a deck shows: its back and each card's face. */
const deckImages = (deck: SpiceDeckDef) =>
  [deck.back, ...deck.cards.map((card) => card.face)].filter((src): src is string => src !== undefined);

/* Before a game: which deck, how many spice piles, and how many cards a peek shows. */
function DeckPicker({
  decks,
  loadDeck,
  onStart,
  onBack,
}: PickerActions &
  Readonly<{
    /** The decks a new game can be played with, by ruleset; undefined while they load. */
    decks: readonly SpiceDeckChoice[] | undefined;
    /** Reads a deck's cards once the table picks it. */
    loadDeck: (choice: SpiceDeckChoice) => Promise<SpiceDeckDef>;
  }>) {
  const [piles, setPiles] = useState(1);
  const [peek, setPeek] = useState(1);
  const [loading, setLoading] = useState<string | null>(null);
  /* The picked deck's pictures fetched so far, so a table on a slow connection sees how far along it is. */
  const [fetched, setFetched] = useState<Readonly<{ done: number; total: number }> | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  /* A deck still loading when the table goes back to its game is dropped, so it never replaces the game they went back to. */
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);
  const pick = async (choice: SpiceDeckChoice) => {
    setLoading(choice.id);
    setFetched(null);
    setFailed(null);
    const deck = await loadDeck(choice).catch(() => undefined);
    if (!open.current) {
      return;
    }
    if (deck && deck.cards.length > 0) {
      /* Every card's picture is in before the game starts, so no card flies in before its face can show. */
      await preloadPublishedImages(deckImages(deck), (done, total) => {
        if (open.current) {
          setFetched({ done, total });
        }
      });
      if (open.current) {
        onStart(deck, { piles, peek });
      }
      return;
    }
    setFailed(choice.id);
    setLoading(null);
  };
  return (
    <div className={styles.tool}>
      <header className={styles.header}>
        <div className={styles.turn}>
          <span className={styles.turnNumber}>Spice deck</span>
          <span className={styles.deckName}>Pick the deck your table plays with</span>
        </div>
        {onBack ? (
          <IconAction
            label="Back to the game"
            emphasis="quiet"
            intent="neutral"
            icon={<ArrowLeft size={20} />}
            onClick={onBack}
          />
        ) : null}
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
                disabled={loading !== null}
                value={piles}
                onChange={(value) => setPiles(typeof value === 'number' ? value : 1)}
              />
            )}
          />
          <ControlBlock
            title="Cards shown by a peek"
            description={
              'Holding Peek for two seconds shows the next cards off the deck.\nSome factions may look at one; set how many your table allows.'
            }
            input={(field) => (
              <NumberInput
                {...field}
                min={1}
                max={MOST_PEEK}
                clampBehavior="strict"
                allowDecimal={false}
                disabled={loading !== null}
                value={peek}
                onChange={(value) => setPeek(typeof value === 'number' ? value : 1)}
              />
            )}
          />
        </div>
        {decks?.length === 0 ? <p className={styles.hint}>No Ruleset has a spice deck yet.</p> : null}
        {decks ? (
          <ul className={styles.deckList}>
            {decks.map((choice) => (
              <li key={choice.id}>
                <button
                  type="button"
                  className={styles.deckChoice}
                  disabled={loading !== null}
                  aria-busy={loading === choice.id}
                  onClick={() => void pick(choice)}
                >
                  <Layers aria-hidden className={styles.deckMark} />
                  <span>
                    <strong>{choice.ruleset}</strong>
                    <small>
                      {loading === choice.id
                        ? fetched
                          ? `Fetching the cards · ${fetched.done} of ${fetched.total}`
                          : 'Reading the deck…'
                        : failed === choice.id
                          ? 'This deck could not be read. Try again.'
                          : choice.name}
                    </small>
                    {loading === choice.id ? (
                      <FetchProgress
                        className={styles.fetchBar}
                        label={`Fetching the ${choice.name}`}
                        done={fetched?.done}
                        total={fetched?.total}
                      />
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.hint}>Reading the decks…</p>
        )}
      </main>
    </div>
  );
}

const pileName = (game: SpiceDeckGame, pile: number) =>
  game.piles > 1 ? `Spice pile ${pileLetter(pile)}` : 'Spice pile';

/** A card on its way: dealt from the deck onto a pile, or set aside off its pile. */
type Flight = Readonly<{
  key: number;
  pile: number;
  copy: string;
  mode: 'deal' | 'aside';
  reveal: Reveal;
  /** Whether the card's pictures are in, so it can fly; until then it waits off the table and nothing else moves. */
  ready: boolean;
}>;

type Step = Readonly<{ mode: 'deal' | 'aside'; blow: Blow; reveal: Extract<Reveal, { card: string }> }>;

/* The card the last step turned over or set aside, if it was one. */
function stepOf(game: SpiceDeckGame, last: Readonly<{ kind: string }> | undefined): Step | undefined {
  const mode = last?.kind;
  if (mode !== 'deal' && mode !== 'aside') {
    return undefined;
  }
  const blow = game.blows.at(-1);
  const reveal = blow?.reveals.at(-1);
  return blow && isCard(reveal) ? { mode, blow, reveal } : undefined;
}

const isCard = (reveal: Reveal | undefined): reveal is Step['reveal'] => reveal !== undefined && reveal.card !== null;

/* A landed step as the voice reads it; a deal that found the deck empty reshuffled it first, and the table hears that before the card. */
function stepSentence(game: SpiceDeckGame, { mode, blow, reveal }: Step): string {
  const card = revealSentence(game, reveal, blow.turn);
  if (mode === 'aside') {
    return card;
  }
  const reshuffled = blow.reveals.at(-2)?.kind === 'reshuffle';
  return `${reshuffled ? 'The deck is reshuffled. ' : ''}${pileName(game, blow.pile)}. ${card}`;
}

/* The flight's timing: off the deck, turned over on the way, laid on the pile; a set-aside card rests there before it moves on. */
const FLIGHT_MS = 1500;
const ASIDE_MS = 520;
/* The moments in the flight, as fractions of it: in from above to the middle of the screen, a snap turn, a beat to read it, the slam. */
const AT_CENTRE = 0.26;
const TURNED = 0.4;
const SLAM_START = 0.62;
const IMPACT = 0.8;
/* How much bigger than the pile the card shows in the middle of the screen. */
const SHOWCASE = 1.55;
/* The columns either side of each pile: its letter on the left, its Shai-Hulud notice on the right. Always kept, so nothing moves when a notice shows. */
const SIDE = 40;
const SIDE_GAP = 6;
const CARD_ON_ITS_WAY = 'A card is on its way to its pile.';
/* A card's width to its height. */
const CARD_RATIO = 900 / 1263;
/* Height over width, as PublishedImage takes it. */
const CARD_ASPECT = 1 / CARD_RATIO;

function Playing({
  session,
  game,
  onPickDeck,
}: Readonly<{ session: SpiceDeckSession; game: SpiceDeckGame; onPickDeck: () => void }>) {
  const motion = useMotionAllowed();
  const speech = useSpeech();
  const [voice, setVoice] = useState(false);
  const [listen, setListen] = useState(false);
  const canListen = useCanListen();
  const [peeking, setPeeking] = useState(false);

  /*
   * A card turned over starts its flight onto its pile; a card set aside leaves its pile to the side.
   * The session says what the last step was, so a step taken back, a new turn and the game as it loaded show at once.
   * A step is in flight until it lands; the step that landed last is remembered, so the flight is read off the game.
   */
  const lastId = session.last?.id;
  /* The step already on the table when the table appears, back from the deck picker or a reload, has landed: it does not fly again. */
  const [landedId, setLandedId] = useState<number | undefined>(() => session.last?.id);
  /* The step whose card's face and the deck's back have loaded: a card never flies before it can show. */
  const [readyId, setReadyId] = useState<number | undefined>(() => session.last?.id);
  const step = useMemo(() => stepOf(game, session.last), [game, session.last]);
  const flight = useMemo<Flight | undefined>(
    () =>
      step && motion && lastId !== landedId
        ? {
            key: lastId ?? 0,
            pile: step.blow.pile,
            copy: step.reveal.card,
            mode: step.mode,
            reveal: step.reveal,
            ready: readyId === lastId,
          }
        : undefined,
    [step, motion, lastId, landedId, readyId]
  );
  /* A game the page opened on, from a reload, fetches its deck's pictures now rather than card by card. */
  useEffect(() => {
    void preloadPublishedImages(deckImages(game.deck));
  }, [game.deck]);
  /* A new step that flies waits for its card's pictures; they are usually in already, fetched when the deck was picked. */
  const awaitCard = useEffectEvent(() => {
    if (!step || !motion) {
      return;
    }
    let live = true;
    const pictures = [cardOf(game, step.reveal.card).face, game.deck.back].filter(
      (src): src is string => src !== undefined
    );
    void Promise.all(pictures.map(preloadPublishedImage)).then(() => {
      if (live) {
        setReadyId(lastId);
      }
    });
    return () => {
      live = false;
    };
  });
  useEffect(() => awaitCard(), [lastId]);
  /* Read aloud is read as the card lands, so switching it off while a card is on its way keeps it quiet. */
  const voiceOn = useRef(voice);
  useEffect(() => {
    voiceOn.current = voice;
  }, [voice]);
  /*
   * Lands a new step once its flight is over, at once without motion, and reads it out; only a new step starts one.
   * Only a flight waits for the card's pictures, so without motion the card is read out at once.
   */
  const landStep = useEffectEvent(() => {
    if (!step || lastId === landedId || (motion && readyId !== lastId)) {
      return;
    }
    const timer = setTimeout(
      () => {
        setLandedId(lastId);
        if (voiceOn.current) {
          speech.speak(stepSentence(game, step));
        }
      },
      motion ? (step.mode === 'aside' ? ASIDE_MS : FLIGHT_MS) : 0
    );
    return () => clearTimeout(timer);
  });
  useEffect(() => landStep(), [lastId, readyId]);

  /* While a card is on its way, nothing else moves the game: the table sees each card land before the next step. */
  const busy = flight !== undefined;
  const turnOver = useCallback(
    (pile: number) => {
      if (!busy) {
        session.act((current, random) => revealOne(current, random, pile), 'deal');
      }
    },
    [busy, session]
  );

  const onCommand = useCallback(
    (command: VoiceCommand) => {
      if (busy && command !== 'repeat') {
        return;
      }
      if (command === 'undo') {
        session.undo();
      } else if (command === 'repeat') {
        const blow = game.blows.at(-1);
        const reveal = blow?.reveals.at(-1);
        if (blow && reveal) {
          speech.speak(revealSentence(game, reveal, blow.turn));
        }
      } else if (command === 'next') {
        session.act(nextTurn);
      } else {
        turnOver(nextPile(game) ?? 0);
      }
    },
    [busy, game, session, speech, turnOver]
  );
  /* Never listens while it speaks, or it would hear its own "spice". */
  /* Nor while Peek shows the next cards: a command would change the game behind them. */
  const { listening } = useVoiceCommands(listen && canListen && !speech.speaking && !peeking, onCommand);

  /* The header and footer heights, so the piles get the whole screen between them. */
  const header = useRef<HTMLElement>(null);
  const footer = useRef<HTMLElement>(null);
  const [chrome, setChrome] = useState(0);
  useLayoutEffect(() => {
    const measure = () => setChrome((header.current?.offsetHeight ?? 0) + (footer.current?.offsetHeight ?? 0));
    measure();
    const observer = new ResizeObserver(measure);
    for (const element of [header.current, footer.current]) {
      if (element) {
        observer.observe(element);
      }
    }
    return () => observer.disconnect();
  }, []);

  const over = spiceBlowOver(game);
  return (
    <div className={styles.tool} style={{ '--chrome': `${chrome}px` } as CSSProperties}>
      <header ref={header} className={styles.header}>
        <div className={styles.turn}>
          <span className={styles.turnNumber}>Turn {game.turn}</span>
          <span className={styles.deckLine}>
            <span className={styles.deckName}>{game.deck.name} ·</span>
            <span className={styles.left}>{game.draw.length + (flight?.mode === 'deal' ? 1 : 0)} left ·</span>
            <span className={styles.odds}>{Math.round(wormChance(game) * 100)}% Shai-Hulud</span>
          </span>
        </div>
        <IconAction
          label="Take back"
          tooltip="Take back the last card"
          emphasis="quiet"
          intent="neutral"
          icon={<RotateCcw size={20} />}
          disabledReason={busy ? CARD_ON_ITS_WAY : session.canUndo ? undefined : 'Nothing to take back yet.'}
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
        <GameMenu session={session} game={game} busy={busy} onPickDeck={onPickDeck} />
      </header>
      <main className={styles.body}>
        <Table game={game} flight={flight} onPile={turnOver} />
      </main>
      <footer ref={footer} className={styles.footer}>
        <div className={styles.actions}>
          <PeekHold disabled={game.draw.length === 0 || flight !== undefined} onPeek={() => setPeeking(true)} />
          <LabeledAction
            size="md"
            className={styles.action}
            icon={<Shuffle size={18} />}
            accessibleName="Set aside & shuffle back in next turn"
            disabledReason={
              lastPlayed(game) && !flight ? undefined : 'Turn a card over first: it sets aside the card just played.'
            }
            onClick={() => session.act(setAsideLast, 'aside')}
          >
            Set aside
          </LabeledAction>
          <LabeledAction
            emphasis={over ? 'strong' : 'standard'}
            size="md"
            className={styles.action}
            icon={<ArrowRight size={18} />}
            accessibleName={`Start turn ${game.turn + 1}`}
            disabledReason={busy ? CARD_ON_ITS_WAY : undefined}
            onClick={() => session.act(nextTurn)}
          >
            {`Turn ${game.turn + 1}`}
          </LabeledAction>
        </div>
      </footer>
      {peeking ? <Peek game={game} onClose={() => setPeeking(false)} /> : null}
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
  const stage = useRef<HTMLDivElement>(null);
  const [cardWidth, setCardWidth] = useState<number | undefined>(undefined);
  /* The piles as big as the screen allows: whichever grid (all across, stacked, or between) gives the biggest cards. */
  const pileCount = game.piles;
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) {
      return;
    }
    const measure = () => {
      /* The content box: the stage's padding is room for outlines, not for cards. */
      const { width, height } = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const gap = 12;
      const caption = 22;
      const widthFor = (across: number) => {
        const down = Math.ceil(pileCount / across);
        const byWidth = (width - padX - gap * (across - 1)) / across - 2 * (SIDE + SIDE_GAP);
        const byHeight = ((height - padY - gap * (down - 1)) / down - caption) * CARD_RATIO;
        return Math.min(byWidth, byHeight);
      };
      const best = Math.max(...Array.from({ length: pileCount }, (_, index) => widthFor(index + 1)));
      setCardWidth(Math.max(60, Math.floor(best)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [pileCount]);
  const turnBlows = blowsOfTurn(game);
  const next = nextPile(game);
  const blocked = !canReveal(game);

  /* The flying card: in from the deck above the screen, turned over big in the middle, slammed onto its pile; a set-aside card then leaves to the side. */
  useLayoutEffect(() => {
    const card = flyer.current;
    if (!flight?.ready || !card || !table.current) {
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
    if (flight.mode === 'aside') {
      /* Set aside: the card lifts off its pile and slides away to the side, face up. */
      const away = card.animate(
        [
          { transform: at(to), offset: 0 },
          { transform: at(to, 1.08), offset: 0.25, easing: 'cubic-bezier(.5,0,.8,.4)' },
          { transform: at(rest, 0.9), offset: 1 },
        ],
        { duration: ASIDE_MS, fill: 'forwards' }
      );
      return () => away.cancel();
    }
    /* Shown bigger than the pile, but never past the screen. */
    const showW = Math.max(to.w, Math.min(to.w * SHOWCASE, outer.width * 0.94, window.innerHeight * 0.8 * CARD_RATIO));
    const centre = {
      x: (outer.width - showW) / 2,
      y: Math.max(8, window.innerHeight / 2 - outer.top - showW / CARD_RATIO / 2),
      w: showW,
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
    /* The landing: a ring bursts out from the pile's edge and the pile jolts under the card. */
    if (ring.current) {
      ring.current.style.left = `${to.x}px`;
      ring.current.style.top = `${to.y}px`;
      ring.current.style.width = `${to.w}px`;
      ring.current.style.height = `${to.h}px`;
    }
    const burst = ring.current?.animate(
      /* It grows by the same distance on every side, whatever the card's shape. */
      [
        { opacity: 0, outlineOffset: '-4px' },
        { opacity: 0.95, outlineOffset: '0px', offset: 0.1 },
        { opacity: 0, outlineOffset: '36px' },
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
    return () => moves.forEach((move) => move.cancel());
  }, [flight]);

  return (
    <div ref={table} className={styles.table}>
      <div
        ref={stage}
        className={styles.stage}
        style={cardWidth ? ({ '--card-w': `${cardWidth}px` } as CSSProperties) : undefined}
      >
        {game.discards.map((pile, index) => {
          const landing = flight?.pile === index && flight.mode === 'deal';
          const top = landing ? pile.at(-2) : pile.at(-1);
          const count = pile.length - (landing ? 1 : 0);
          const worm = wormNotice(game, index, flight);
          return (
            <div key={index} className={styles.pileSpot}>
              <span className={styles.pileLetter} aria-hidden>
                {game.piles > 1 ? pileLetter(index) : ''}
              </span>
              <button
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
              <span className={styles.wormNotice} role={worm ? 'status' : undefined}>
                {worm ? (
                  <>
                    <strong>Shai-Hulud!</strong>
                    <small>{worm}</small>
                  </>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
      {flight?.ready ? (
        <div key={`ring-${flight.key}`} ref={ring} className={styles.ring} data-kind={flight.reveal.kind} />
      ) : null}
      {flight?.ready ? (
        <div key={flight.key} ref={flyer} className={styles.flyer} aria-hidden>
          <div className={styles.flyerTurn} data-turn data-mode={flight.mode}>
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
              <Card key={index} title={pileName(game, blow.pile)} padding="sm" className={styles.blowCard}>
                <BlowLines game={game} blow={blow} />
              </Card>
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

/*
 * The latest Shai-Hulud that came up on a pile this turn, and the territory it devours. No Nexus line: some rulesets' Shai-Hulud
 * bring none, and the deck can't tell which, so the players call it. It stays until the next turn, even once a spice card covers it; one the players set aside no longer counts.
 * A Shai-Hulud still flying to its pile is told once it lands.
 */
function wormNotice(game: SpiceDeckGame, pile: number, flight: Flight | undefined): string | undefined {
  const worm = game.blows
    .filter((blow) => blow.turn === game.turn && blow.pile === pile)
    .flatMap((blow) => blow.reveals)
    .findLast((entry) => entry.kind === 'worm' && entry !== flight?.reveal);
  if (worm?.kind !== 'worm') {
    return undefined;
  }
  if (game.turn === 1) {
    return 'Turn 1: set it aside';
  }
  return worm.devours ? `Devours ${cardOf(game, worm.devours).name}` : 'Nothing to devour';
}

/* A blow's lines as far as the table has seen: the card in flight is told once it lands. */
function landedPart(blow: Blow, flight: Flight | undefined): Blow {
  return flight && blow.reveals.at(-1) === flight.reveal ? { ...blow, reveals: blow.reveals.slice(0, -1) } : blow;
}

/* How long Peek is held before it shows: long enough that a brush of the screen at the table never shows the next card. */
const PEEK_HOLD_MS = 2000;

/**
 * Starts a hold from a primary press only: a second finger or another button does nothing.
 * Touch captures the pointer implicitly, which would swallow the leave that cancels a finger sliding off, so the capture is let go.
 */
function holdStart(event: ReactPointerEvent<HTMLElement>, press: () => void) {
  if (!event.isPrimary || event.button !== 0) {
    return;
  }
  if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  press();
}

/** Peek: held for two seconds, it shows the next cards to whoever holds the phone. A shorter press does nothing. */
function PeekHold({ disabled, onPeek }: Readonly<{ disabled: boolean; onPeek: () => void }>) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const release = () => {
    clearTimeout(timer.current);
    setHolding(false);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  /* A hold cut short any way at all, focus moving off or the control turning disabled among them, never opens Peek. */
  useEffect(() => {
    if (disabled) {
      clearTimeout(timer.current);
    }
  }, [disabled]);
  const press = () => {
    if (disabled) {
      return;
    }
    setHolding(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setHolding(false);
      onPeek();
    }, PEEK_HOLD_MS);
  };
  return (
    <span
      className={styles.hold}
      data-holding={(holding && !disabled) || undefined}
      style={{ '--hold-ms': `${PEEK_HOLD_MS}ms` } as CSSProperties}
    >
      <IconAction
        label="Hold to peek at the next card"
        tooltip="Hold for two seconds to see the next card, then put the phone back"
        emphasis="standard"
        intent="neutral"
        size="lg"
        icon={<Eye size={20} />}
        disabledReason={disabled ? 'No card to peek at right now.' : undefined}
        onPointerDown={(event) => holdStart(event, press)}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
            press();
          }
        }}
        onKeyUp={release}
        onBlur={release}
      />
    </span>
  );
}

/**
 * The next cards, shown big to the one holding the phone, until they put them away again.
 * A modal dialog: focus moves inside, the game behind it cannot be reached, and focus goes back to Peek when it closes.
 */
function Peek({ game, onClose }: Readonly<{ game: SpiceDeckGame; onClose: () => void }>) {
  const next = peekAt(game);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (element && !element.open) {
      element.showModal();
    }
    return () => {
      if (element?.open) {
        element.close();
      }
      before?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.peek}
      aria-label="The next spice cards"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <p className={styles.peekTitle}>
        {next.length > 1 ? `The next ${next.length} cards, the next first` : 'The next card'}
      </p>
      <ol className={styles.peekCards} data-count={next.length}>
        {next.map((copy) => (
          <li key={copy}>
            <CardFace game={game} copy={copy} />
          </li>
        ))}
      </ol>
      <LabeledAction emphasis="strong" size="lg" icon={<EyeOff size={20} />} onClick={onClose}>
        Hide and put the phone back
      </LabeledAction>
    </dialog>
  );
}

/* Both start over without losing the game: a new game is taken back with Undo, and picking another deck keeps this one until the new deck is in. */
function GameMenu({
  session,
  game,
  busy,
  onPickDeck,
}: Readonly<{ session: SpiceDeckSession; game: SpiceDeckGame; busy: boolean; onPickDeck: () => void }>) {
  /* While a card is on its way, the game is not swapped out under it, even from a menu opened before. */
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <IconAction label="Game settings" emphasis="quiet" intent="neutral" icon={<Settings2 size={20} />} />
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{game.deck.name}</Menu.Label>
        <Menu.Item
          leftSection={<Layers size={16} />}
          disabled={busy}
          onClick={() => {
            if (!busy) {
              session.start(newGame(game.deck, session.random, rulesOf(game)));
            }
          }}
        >
          New game, same deck
        </Menu.Item>
        <Menu.Item disabled={busy} onClick={() => !busy && onPickDeck()}>
          Pick another deck
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

const rulesOf = (game: SpiceDeckGame) => ({ piles: game.piles, peek: game.peek ?? 1 });

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
      {src ? (
        <PublishedImage
          src={src}
          name={back ? 'Spice deck' : (card?.name ?? '')}
          aspect={CARD_ASPECT}
          radius="4.5% / 3.2%"
        />
      ) : null}
    </span>
  );
}

/** What one turned card asks of the table, in a line. */
function RevealLine({ game, reveal, turn }: Readonly<{ game: SpiceDeckGame; reveal: Reveal; turn: number }>) {
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
  if (reveal.kind === 'special') {
    return (
      <li className={styles.line} data-kind="special">
        <strong>{card.name}</strong>: follow the card
      </li>
    );
  }
  if (reveal.kind === 'set-aside') {
    return (
      <li className={styles.line} data-kind="aside">
        {card.name}: set aside, shuffled back in next turn
      </li>
    );
  }
  if (turn === 1) {
    return (
      <li className={styles.line} data-kind="worm">
        <strong>Shai-Hulud</strong> on turn 1: the rulebook sets it aside and draws again
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
        <RevealLine key={index} game={game} reveal={reveal} turn={blow.turn} />
      ))}
    </ol>
  );
}
