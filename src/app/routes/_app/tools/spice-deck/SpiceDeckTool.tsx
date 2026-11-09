import { Menu, NumberInput, Switch } from '@mantine/core';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { ArrowRight, Ear, Layers, Mic, RotateCcw, Settings2, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { useMotionAllowed } from '@app/styles/motion';
import { useSpeech } from '@app/widgets/tutorial-guide/speech';

import {
  blowAll,
  blowPile,
  blowSentence,
  blowsOfTurn,
  canReveal,
  cardOf,
  currentBlow,
  isWorm,
  landed,
  newGame,
  nexus,
  nextTurn,
  MOST_PILES,
  pileLetter,
  remaining,
  revealOne,
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
 * Six looks share one game and one frame (the turn and its controls above, the one big action at the thumb);
 * they differ in what fills the middle. Norbert picks one; the rest go.
 */

export type SpiceDeckVariant = 'piles' | 'announcer' | 'log' | 'card-by-card' | 'odds' | 'voice';

type ToolProps = Readonly<{
  variant: SpiceDeckVariant;
  /** Where this browser keeps the game. */
  storageKey: string;
  /** The game to show before anything is stored, for stories; a real visit starts from the deck picker. */
  initial?: SpiceDeckGame;
  /** The decks a new game can be played with. */
  decks: readonly SpiceDeckDef[];
}>;

export function SpiceDeckTool({ variant, storageKey, initial, decks }: ToolProps) {
  const session = useSpiceDeckGame(storageKey, initial);
  const { game } = session;
  if (!game) {
    return <DeckPicker decks={decks} onStart={(deck, rules) => session.start(newGame(deck, session.random, rules))} />;
  }
  return <Playing variant={variant} session={session} game={game} />;
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

/* The one step the big button takes next, as its words. */
function nextStep(game: SpiceDeckGame, oneCard: boolean): string {
  if (!spiceBlowOver(game)) {
    if (oneCard) {
      return currentBlow(game)
        ? 'Turn over another card'
        : `Turn over a card for ${pileName(game, game.pile).toLowerCase()}`;
    }
    return `Blow ${pileName(game, game.pile).toLowerCase()}`;
  }
  return `Start turn ${game.turn + 1}`;
}

function Playing({
  variant,
  session,
  game,
}: Readonly<{ variant: SpiceDeckVariant; session: SpiceDeckSession; game: SpiceDeckGame }>) {
  const oneCard = variant === 'card-by-card';
  const speech = useSpeech();
  const [voice, setVoice] = useState(variant === 'voice');
  const [listen, setListen] = useState(variant === 'voice');
  const canListen = useCanListen();
  const lastSpoken = useRef<string | undefined>(undefined);

  const lastBlow = game.blows.at(-1);
  const sentence = lastBlow ? blowSentence(game, lastBlow) : undefined;
  /* A blow is read out once it has landed, or as each card turns when they turn one at a time. */
  useEffect(() => {
    if (!voice || !sentence || sentence === lastSpoken.current) {
      return;
    }
    const ready = oneCard || landed(game, lastBlow!) !== undefined;
    if (ready) {
      lastSpoken.current = sentence;
      speech.speak(nexus(game) && spiceBlowOver(game) ? `${sentence} A Nexus follows.` : sentence);
    }
  }, [voice, sentence, oneCard, game, lastBlow, speech]);

  const step = useCallback(() => {
    if (!spiceBlowOver(game)) {
      session.act(oneCard ? revealOne : blowPile);
    } else {
      session.act(nextTurn);
    }
  }, [game, oneCard, session]);

  const onCommand = useCallback(
    (command: VoiceCommand) => {
      if (command === 'undo') {
        session.undo();
      } else if (command === 'repeat') {
        if (sentence) {
          speech.speak(sentence);
        }
      } else if (command === 'next' && spiceBlowOver(game)) {
        session.act((current, random) => blowPile(nextTurn(current), random));
      } else {
        step();
      }
    },
    [game, sentence, session, speech, step]
  );
  /* Never listens while it speaks, or it would hear its own "spice". */
  const { listening } = useVoiceCommands(listen && canListen && !speech.speaking, onCommand);

  const blocked = !spiceBlowOver(game) && !canReveal(game);
  return (
    <div className={styles.tool} data-variant={variant}>
      <header className={styles.header}>
        <div className={styles.turn}>
          <span className={styles.turnNumber}>Turn {game.turn}</span>
          <span className={styles.deckName}>
            {game.deck.name} · {game.draw.length} left
          </span>
        </div>
        <IconAction
          label="Take back"
          tooltip="Take back the last step"
          emphasis="quiet"
          intent="neutral"
          icon={<RotateCcw size={20} />}
          disabledReason={session.canUndo ? undefined : 'Nothing to take back yet.'}
          onClick={session.undo}
        />
        <IconAction
          label={voice ? 'Stop reading blows aloud' : 'Read blows aloud'}
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
            tooltip={listen ? 'Stop listening' : 'Say “spice blow”, “next turn”, “repeat” or “undo”'}
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
        <VariantBody variant={variant} game={game} listening={listening} speaking={speech.speaking} />
      </main>
      <footer className={styles.footer}>
        {spiceBlowOver(game) && nexus(game) ? (
          <p className={styles.nexus}>Nexus! Shai-Hulud came up: alliances may be made and broken.</p>
        ) : null}
        <LabeledAction
          emphasis="strong"
          size="xl"
          className={styles.primary}
          icon={spiceBlowOver(game) ? <ArrowRight size={20} /> : <Layers size={20} />}
          disabledReason={blocked ? 'Every card is set aside; nothing is left to turn over.' : undefined}
          onClick={step}
        >
          {nextStep(game, oneCard)}
        </LabeledAction>
      </footer>
    </div>
  );
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

function VariantBody({
  variant,
  game,
  listening,
  speaking,
}: Readonly<{ variant: SpiceDeckVariant; game: SpiceDeckGame; listening: boolean; speaking: boolean }>) {
  switch (variant) {
    case 'piles':
      return <PilesBody game={game} />;
    case 'announcer':
      return <AnnouncerBody game={game} />;
    case 'log':
      return <LogBody game={game} />;
    case 'card-by-card':
      return <CardByCardBody game={game} />;
    case 'odds':
      return <OddsBody game={game} />;
    case 'voice':
      return <VoiceBody game={game} listening={listening} speaking={speaking} />;
  }
}

/* Shared pieces. */

function CardFace({ game, copy, className }: Readonly<{ game: SpiceDeckGame; copy?: string; className?: string }>) {
  const card = copy ? cardOf(game, copy) : undefined;
  const src = card?.face ?? game.deck.back;
  return (
    <span className={`${styles.card} ${className ?? ''}`} data-empty={!src || undefined}>
      {src ? <img src={src} alt={card?.name ?? 'Spice deck'} draggable={false} /> : null}
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
        Shai-Hulud on turn 1: set aside, shuffled back after the Spice Blow
      </li>
    );
  }
  if (reveal.kind === 'ignored') {
    return (
      <li className={styles.line} data-kind="aside">
        Shai-Hulud again: one too many this Spice Blow, shuffled back
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

function StormNote() {
  return (
    <p className={styles.hint}>No spice lands if the territory’s spice is under the storm; the card still counts.</p>
  );
}

function Waiting({ game }: Readonly<{ game: SpiceDeckGame }>) {
  return (
    <div className={styles.waiting}>
      <CardFace game={game} className={styles.waitingBack} />
      <p>{spiceBlowOver(game) ? 'The Spice Blow is over.' : `Ready for ${pileName(game, game.pile)}.`}</p>
    </div>
  );
}

/* A: Piles. */

function PilesBody({ game }: Readonly<{ game: SpiceDeckGame }>) {
  const turnBlows = blowsOfTurn(game);
  return (
    <div className={styles.piles}>
      <div className={styles.pileRow} data-piles={game.piles}>
        {game.discards.map((pile, index) => (
          <figure key={index} className={styles.pile} data-next={index === game.pile || undefined}>
            <CardFace game={game} copy={pile.at(-1)} />
            <figcaption>
              {pileName(game, index)} · {pile.length}
            </figcaption>
          </figure>
        ))}
      </div>
      {turnBlows.map((blow) => (
        <section key={blow.pile} className={styles.blowCard}>
          <h3 className={styles.blowTitle}>{pileName(game, blow.pile)}</h3>
          <BlowLines game={game} blow={blow} />
        </section>
      ))}
      {turnBlows.length === 0 ? (
        <p className={styles.hint}>Turn {game.turn}: nothing turned over yet.</p>
      ) : (
        <StormNote />
      )}
    </div>
  );
}

/* B: Announcer. */

function AnnouncerBody({ game }: Readonly<{ game: SpiceDeckGame }>) {
  const blow = game.blows.at(-1);
  if (!blow || blow.turn !== game.turn) {
    return <Waiting game={game} />;
  }
  const spice = landed(game, blow);
  const worms = blow.reveals.filter((reveal) => reveal.kind === 'worm');
  return (
    <div className={styles.announce}>
      <span className={styles.announcePile}>{pileName(game, blow.pile)}</span>
      {worms.length > 0 ? (
        <div className={styles.announceWorm}>
          <span>Shai-Hulud{worms.length > 1 ? ` ×${worms.length}` : ''}!</span>
          {worms[0]!.kind === 'worm' && worms[0]!.devours ? (
            <small>Devours {cardOf(game, worms[0]!.devours).name}</small>
          ) : null}
        </div>
      ) : null}
      {spice ? (
        <>
          <span className={styles.announceAmount}>{spice.amount}</span>
          <span className={styles.announceWhere}>spice in {spice.name}</span>
        </>
      ) : null}
      <BlowLines game={game} blow={blow} />
      <div className={styles.thumbs}>
        {game.discards.map((pile, index) => (
          <CardFace key={index} game={game} copy={pile.at(-1)} className={styles.thumb} />
        ))}
      </div>
    </div>
  );
}

/* C: Log. */

function LogBody({ game }: Readonly<{ game: SpiceDeckGame }>) {
  const turns = [...new Set(game.blows.map((blow) => blow.turn))].reverse();
  if (turns.length === 0) {
    return <Waiting game={game} />;
  }
  return (
    <div className={styles.log}>
      {turns.map((turn) => (
        <section key={turn} className={styles.logTurn}>
          <h3 className={styles.blowTitle}>
            Turn {turn}
            {nexus(game, turn) ? <span className={styles.nexusTag}>Nexus</span> : null}
          </h3>
          {blowsOfTurn(game, turn).map((blow) => {
            const spice = blow.reveals.at(-1);
            return (
              <div key={blow.pile} className={styles.logRow}>
                <CardFace game={game} copy={spice?.card ?? undefined} className={styles.logThumb} />
                <div>
                  {game.piles > 1 ? <span className={styles.pileTag}>{pileLetter(blow.pile)}</span> : null}
                  <BlowLines game={game} blow={blow} />
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

/* D: Card by card. */

function CardByCardBody({ game }: Readonly<{ game: SpiceDeckGame }>) {
  const motion = useMotionAllowed();
  const blow = game.blows.at(-1);
  const reveal = blow && blow.turn === game.turn ? blow.reveals.findLast((entry) => entry.card !== null) : undefined;
  const copy = reveal?.card ?? undefined;
  const ask = (): ReactNode => {
    if (!reveal || reveal.card === null) {
      return spiceBlowOver(game)
        ? 'The Spice Blow is over.'
        : `Turn over the top card for ${pileName(game, game.pile).toLowerCase()}.`;
    }
    if (reveal.kind === 'spice') {
      return (
        <>
          Place <strong>{cardOf(game, reveal.card).amount} spice</strong> in {cardOf(game, reveal.card).name}.
        </>
      );
    }
    if (reveal.kind === 'worm') {
      return (
        <>
          <strong>Shai-Hulud!</strong>{' '}
          {reveal.devours
            ? `Remove all spice and forces in ${cardOf(game, reveal.devours).name}.`
            : 'Nothing below to devour.'}{' '}
          Turn over another.
        </>
      );
    }
    return 'Shai-Hulud is set aside for now. Turn over another.';
  };
  return (
    <div className={styles.single}>
      <div className={styles.flipStage}>
        <CardFace
          key={copy ?? 'back'}
          game={game}
          copy={copy}
          className={`${styles.bigCard} ${motion && copy ? styles.flip : ''}`}
        />
      </div>
      <p className={styles.ask} data-kind={reveal?.kind}>
        {ask()}
      </p>
      {blow && blow.turn === game.turn && blow.reveals.length > 1 ? (
        <p className={styles.hint}>
          This blow so far:{' '}
          {blow.reveals
            .filter((entry) => entry.card)
            .map((entry) => cardOf(game, entry.card!).name)
            .join(', ')}
        </p>
      ) : null}
    </div>
  );
}

/* E: Odds. */

function OddsBody({ game }: Readonly<{ game: SpiceDeckGame }>) {
  const left = remaining(game);
  const chance = Math.round(wormChance(game) * 100);
  const blow = game.blows.at(-1);
  return (
    <div className={styles.odds}>
      <div className={styles.meter}>
        <div>
          <span className={styles.meterValue}>{game.draw.length}</span>
          <span className={styles.meterLabel}>cards left</span>
        </div>
        <div data-kind="worm">
          <span className={styles.meterValue}>{chance}%</span>
          <span className={styles.meterLabel}>Shai-Hulud next</span>
        </div>
      </div>
      {blow ? (
        <section className={styles.blowCard}>
          <h3 className={styles.blowTitle}>
            Turn {blow.turn}, {pileName(game, blow.pile)}
          </h3>
          <BlowLines game={game} blow={blow} />
        </section>
      ) : null}
      <ul className={styles.oddsGrid} aria-label="Still in the deck">
        {left
          .toSorted(
            (a, b) => Number(isWorm(a.card)) - Number(isWorm(b.card)) || (b.card.amount ?? 0) - (a.card.amount ?? 0)
          )
          .map(({ card, left: count }) => (
            <li key={card.key} data-gone={count === 0 || undefined} data-kind={isWorm(card) ? 'worm' : 'spice'}>
              <span className={styles.oddsName}>{card.name}</span>
              <span className={styles.oddsCount}>
                {isWorm(card) ? `${count} of ${card.count}` : count > 0 ? card.amount : '—'}
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}

/* F: Voice. */

function VoiceBody({
  game,
  listening,
  speaking,
}: Readonly<{ game: SpiceDeckGame; listening: boolean; speaking: boolean }>) {
  const blow = game.blows.at(-1);
  const current = blow && blow.turn === game.turn ? blow : undefined;
  return (
    <div className={styles.voice}>
      <span className={styles.voiceOrb} data-state={speaking ? 'speaking' : listening ? 'listening' : 'idle'}>
        {speaking ? <Volume2 size={56} /> : listening ? <Ear size={56} /> : <Mic size={56} />}
      </span>
      <p className={styles.voiceState}>
        {speaking
          ? 'Reading the blow aloud…'
          : listening
            ? 'Listening. Say “spice blow”.'
            : 'Tap the button or the microphone above.'}
      </p>
      {current ? (
        <p className={styles.voiceSaid}>{blowSentence(game, current)}</p>
      ) : (
        <p className={styles.voiceSaid}>
          {spiceBlowOver(game) ? 'The Spice Blow is over.' : `Ready for ${pileName(game, game.pile)}.`}
        </p>
      )}
      <p className={styles.hint}>Say “spice blow”, “next turn”, “repeat” or “undo”.</p>
    </div>
  );
}

/** A Dreamrules-like deck turned to a given turn, for stories and the page's first look. */
export function playedTo(game: SpiceDeckGame, turns: number, random: () => number): SpiceDeckGame {
  let next = game;
  for (let turn = 1; turn <= turns; turn++) {
    next = blowAll(turn === 1 ? next : nextTurn(next), random);
  }
  return next;
}
