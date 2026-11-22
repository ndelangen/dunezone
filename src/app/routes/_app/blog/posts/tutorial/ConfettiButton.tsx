import { LabeledAction } from '@ui/control/LabeledAction';
import { PartyPopper } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';

import { ChapterConfetti } from '@app/widgets/chapter-confetti/ChapterConfetti';

import styles from './ConfettiButton.module.css';

/*
 * A button for the reader to throw the tutorial's own confetti over the whole page, the burst a player gets as a chapter ends.
 * Each press mounts the burst afresh under a new key, so one still falling is swept and a new one fires from the corners.
 * The canvas goes to the document body rather than the column: the article is a size container, which makes it the containing block for anything fixed inside it, and the burst has to cover the window.
 * The burst is asked for, so it flies even for a reader whose motion preference is off: a press is an explicit request, where a chapter's end is not.
 */
export function ConfettiButton() {
  const [bursts, setBursts] = useState(0);

  return (
    <div className={styles.root}>
      <LabeledAction
        icon={<PartyPopper size={16} />}
        intent="positive"
        emphasis="strong"
        onClick={() => setBursts((count) => count + 1)}
      >
        Throw confetti
      </LabeledAction>
      {bursts > 0 ? createPortal(<ChapterConfetti key={bursts} requested />, document.body) : null}
    </div>
  );
}
