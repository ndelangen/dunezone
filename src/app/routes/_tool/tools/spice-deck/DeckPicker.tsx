import { NumberInput } from '@mantine/core';
import { FetchProgress } from '@ui/content/FetchProgress';
import { preloadPublishedImages } from '@ui/content/preloadPublishedImage';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { ArrowLeft, Layers } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import styles from './route.module.css';
import { MOST_PEEK, MOST_PILES } from './spiceDeck';
import type { SpiceDeckDef, SpiceRules } from './spiceDeck';
import type { SpiceDeckChoice } from './spiceDeckSupply';

export type PickerActions = Readonly<{
  onStart: (deck: SpiceDeckDef, rules: SpiceRules) => void;
  /** Back to the game being played, when there is one. */
  onBack?: () => void;
}>;

/* Every picture a deck shows: its back and each card's face. */
export const deckImages = (deck: SpiceDeckDef) =>
  [deck.back, ...deck.cards.map((card) => card.face)].filter((src): src is string => src !== undefined);

/* Before a game: which deck, how many spice piles, and how many cards a peek shows. */
export function DeckPicker({
  decks,
  loadDeck,
  onStart,
  onBack,
  preload = preloadPublishedImages,
}: PickerActions &
  Readonly<{
    /** The decks a new game can be played with, by ruleset; undefined while they load. */
    decks: readonly SpiceDeckChoice[] | undefined;
    /** Reads a deck's cards once the table picks it. */
    loadDeck: (choice: SpiceDeckChoice) => Promise<SpiceDeckDef>;
    /** Fetches the picked deck's pictures, telling how many are in; the page fetches them for real. */
    preload?: typeof preloadPublishedImages;
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
      await preload(deckImages(deck), (done, total) => {
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
