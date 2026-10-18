import { Badge, Text } from '@mantine/core';
import { Check, CircleCheck, MousePointer2 } from 'lucide-react';

import { useMotionAllowed } from '@app/styles/motion';

import styles from './FaqWalkthrough.module.css';

interface FaqWalkthroughAnswer {
  /** Who replied. */
  author: string;
  text: string;
}

export interface FaqWalkthroughProps {
  /** Who asks. */
  asker: string;
  question: string;
  /** The replies, in the order they arrive; the first three arrive one after another, and any past the third arrive with the third. */
  answers: readonly FaqWalkthroughAnswer[];
  /** Which reply, by position, the asker takes as the answer. */
  accepted: number;
}

/** The disc beside a name: the first letter, so a reader can tell the voices apart. */
function Initial({ name, tone }: { name: string; tone: 'asker' | 'answerer' }) {
  return (
    <span className={styles.initial} data-tone={tone} aria-hidden>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * How a question becomes an answer: one person types a question, others reply, and the asker marks the reply that settled it, on a loop.
 *
 * Callers hand it the words of one exchange;
 * this block owns the staging: the typing, the replies arriving one after another, the pointer that picks the accepted answer, and the badge that follows.
 * It teaches the FAQ's shape to a reader who has not searched yet, so it says nothing about any real ruleset.
 *
 * A reader who keeps the site's motion off, through their device or the motion setting on their profile, sees the end of the story at once and still: the question asked, every reply in, one accepted.
 * The server renders that same end state, so the picture is complete before any script runs.
 */
export function FaqWalkthrough({ asker, question, answers, accepted }: FaqWalkthroughProps) {
  const motion = useMotionAllowed();
  return (
    <div className={styles.stage} data-motion={motion ? undefined : 'reduce'}>
      <div className={styles.question}>
        <div className={styles.voice}>
          <Initial name={asker} tone="asker" />
          <Text component="span" size="sm" fw={600}>
            {asker}
          </Text>
          <Text component="span" size="sm" c="dimmed">
            asks
          </Text>
        </div>
        <p className={styles.asked}>
          <span className={styles.typed}>{question}</span>
        </p>
      </div>
      <ol className={styles.answers}>
        {answers.map((answer, index) => {
          const isAccepted = index === accepted;
          return (
            <li key={index} className={styles.answer} data-accepted={isAccepted || undefined}>
              <div className={styles.voice}>
                <Initial name={answer.author} tone="answerer" />
                <Text component="span" size="sm" fw={600}>
                  {answer.author}
                </Text>
                <Text component="span" size="sm" c="dimmed">
                  replies
                </Text>
                {isAccepted ? (
                  <Badge
                    className={styles.badge}
                    variant="light"
                    color="green"
                    leftSection={<CircleCheck size={12} aria-hidden />}
                  >
                    Accepted answer
                  </Badge>
                ) : null}
              </div>
              <Text size="sm" className={styles.reply}>
                {answer.text}
              </Text>
              {isAccepted ? (
                <span className={styles.accept} aria-hidden>
                  <span className={styles.acceptMark}>
                    <Check size={14} />
                  </span>
                  <MousePointer2 className={styles.pointer} size={22} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
