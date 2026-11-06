import { LabeledAction } from '@ui/control/LabeledAction';
import { CircleDot } from 'lucide-react';
import { useState } from 'react';

import styles from './combined.module.css';
import { KeyDetail } from './KeyDetail';
import { KeyMap } from './KeyMap';
import { SITUATIONS } from './shortcutCatalogue';
import type { Now, Situation } from './shortcutCatalogue';
import own from './SituationKeyboardShortcuts.module.css';
import { usePressedKey } from './usePressedKey';

const SHORT: Readonly<Record<Situation, string>> = {
  table: 'Anywhere',
  piece: 'Over a piece',
  carrying: 'Carrying',
  bidding: 'Bidding',
  spice: 'Spice Bank',
};

/**
 * Round 2, 2 Keyboard by moment: the keyboard map with a switch for each moment of play.
 * It opens on the moment the player is in, marked "now";
 * switching moments relabels and recolours the keys in place, so F turning from Ally into Flip is something you watch happen.
 * A key's story and hook show underneath.
 */
export function SituationKeyboardShortcuts({ now }: Readonly<{ now: readonly Now[] }>) {
  const [moment, setMoment] = useState<Situation>(now[0] ?? 'table');
  const [focus, setFocus] = useState<string | null>(null);
  const pressed = usePressedKey((key) => setFocus(key));
  const shown: readonly Now[] = moment === 'table' ? [] : [moment];
  const current: Situation = now[0] ?? 'table';

  return (
    <div className={styles.root}>
      <div className={own.moments} role="group" aria-label="Moment of play">
        {SITUATIONS.map((situation) => (
          <LabeledAction
            key={situation.id}
            icon={<CircleDot size={12} className={situation.id === current ? own.now : own.later} />}
            pressed={moment === situation.id}
            onClick={() => setMoment(situation.id)}
          >
            {SHORT[situation.id]}
          </LabeledAction>
        ))}
      </div>
      <KeyMap now={shown} pressed={pressed} focus={focus} onFocus={setFocus} />
      <div className={styles.panel} aria-live="polite">
        {focus ? (
          <KeyDetail keyName={focus} now={shown} />
        ) : (
          <p className={styles.hint}>
            {moment === 'table'
              ? 'Every lit key works anywhere over the table.'
              : `Glowing keys work only ${SHORT[moment].toLowerCase()}.`}{' '}
            Point at one for its story.
          </p>
        )}
      </div>
    </div>
  );
}
