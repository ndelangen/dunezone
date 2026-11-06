import { Progress } from '@mantine/core';
import { Kbd } from '@ui/content/Kbd';
import { LabeledAction } from '@ui/control/LabeledAction';
import { SkipForward } from 'lucide-react';
import { useState } from 'react';

import { Keys } from './Keys';
import styles from './PracticeShortcuts.module.css';
import { SHORTCUT_ENTRIES, SITUATIONS, capsOf } from './shortcutCatalogue';
import type { ShortcutEntry } from './shortcutCatalogue';
import { usePressedKey } from './usePressedKey';

/* Only keys can be practised; scrolling and right-clicking are learnt by doing them. */
const DECK = SHORTCUT_ENTRIES.filter((entry) => !entry.pointer);
const SITUATION_LABEL = Object.fromEntries(SITUATIONS.map((situation) => [situation.id, situation.label]));
/* A window is asked for as opening it; everything else already says what it does. */
function promptOf(entry: ShortcutEntry) {
  if (entry.id === 'help') {
    return 'Show these shortcuts';
  }
  return ['hand', 'hidden', 'battle', 'table', 'ally'].includes(entry.id) ? `Open ${entry.action.charAt(0).toLowerCase()}${entry.action.slice(1)}` : entry.action;
}

/* Two right answers in a row and a key counts as learnt. */
const LEARNT_AT = 2;

type Answer = Readonly<{ entry: ShortcutEntry; right: boolean; key: string; count: number }>;

/* The next card: one not yet learnt, the last missed one first, never the card just shown. */
function nextOf(streaks: Readonly<Record<string, number>>, after: string | null, missed: string | null) {
  const open = DECK.filter((entry) => (streaks[entry.id] ?? 0) < LEARNT_AT && entry.id !== after);
  const retry = open.find((entry) => entry.id === missed);
  if (retry) {
    return retry;
  }
  const from = after ? DECK.findIndex((entry) => entry.id === after) : -1;
  return open.find((entry) => DECK.indexOf(entry) > from) ?? open[0] ?? null;
}

/**
 * Variant F, practice: a flash card asks for a key ("Flip a piece") and the player presses it.
 * A right key glows and the next card comes;
 * a wrong one shakes and shows the answer.
 * Two right in a row is learnt, and the bar counts how many of the table's keys the player knows.
 */
export function PracticeShortcuts({ learnt = [] }: Readonly<{ learnt?: readonly string[] }>) {
  const [streaks, setStreaks] = useState<Record<string, number>>(() =>
    Object.fromEntries(learnt.map((id) => [id, LEARNT_AT]))
  );
  const [card, setCard] = useState<ShortcutEntry | null>(() => nextOf(streaks, null, null));
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [missed, setMissed] = useState<string | null>(null);

  const advance = (from: ShortcutEntry, nextStreaks: Record<string, number>, lastMissed: string | null) =>
    setCard(nextOf(nextStreaks, from.id, lastMissed));

  usePressedKey(
    (key) => {
      if (!card) {
        return false;
      }
      const right = capsOf(card).includes(key);
      const nextStreaks = { ...streaks, [card.id]: right ? (streaks[card.id] ?? 0) + 1 : 0 };
      setStreaks(nextStreaks);
      setAnswer({ entry: card, right, key, count: (answer?.count ?? 0) + 1 });
      if (right) {
        const lastMissed = missed === card.id ? null : missed;
        setMissed(lastMissed);
        advance(card, nextStreaks, lastMissed);
      } else {
        setMissed(card.id);
      }
      return true;
    },
    { everyKey: true }
  );

  const known = DECK.filter((entry) => (streaks[entry.id] ?? 0) >= LEARNT_AT).length;

  return (
    <div className={styles.root}>
      <div className={styles.score}>
        <span>
          <strong>{known}</strong> of {DECK.length} keys learnt
        </span>
        <Progress color="var(--color-positive)" value={(known / DECK.length) * 100} className={styles.bar} size="sm" aria-label="Keys learnt" />
      </div>

      {card ? (
        <div
          key={answer ? answer.count : 'first'}
          className={styles.card}
          data-group={card.group}
          data-answer={answer ? (answer.right ? 'right' : 'wrong') : undefined}
        >
          <span className={styles.where}>{SITUATION_LABEL[card.when]}</span>
          <span className={styles.prompt}>{promptOf(card)}</span>
          <span className={styles.ask}>Press the key</span>
        </div>
      ) : (
        <div className={styles.card} data-answer="right">
          <span className={styles.prompt}>Every key learnt.</span>
        </div>
      )}

      <div className={styles.feedback} aria-live="polite">
        {answer?.right && (
          <span className={styles.right}>
            <Kbd>{answer.key}</Kbd> {answer.entry.action}: right
          </span>
        )}
        {answer && !answer.right && (
          <span className={styles.wrong}>
            <Kbd>{answer.key}</Kbd> is not it. It is <Keys entry={answer.entry} />
            {answer.entry.hook ? `. ${answer.entry.hook}` : ''}
          </span>
        )}
      </div>

      <div className={styles.actions}>
        <LabeledAction
          icon={<SkipForward size={14} />}
          onClick={() => {
            if (card) {
              setAnswer(null);
              advance(card, streaks, missed);
            }
          }}
        >
          Skip this one
        </LabeledAction>
      </div>
    </div>
  );
}
