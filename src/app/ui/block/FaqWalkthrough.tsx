import { Avatar, Button, Group, Stack, Text } from '@mantine/core';
import { BadgeCheck, EllipsisVertical, MousePointer2, Pause, Play } from 'lucide-react';
import { useLayoutEffect, useId, useRef, useState } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import { Eyebrow } from '../content/Eyebrow';
import { StatusBadge } from '../content/StatusBadge';
import { IconAction } from '../control/IconAction';
import { Surface } from '../surface/Surface';
import { BlockHeading } from './BlockHeading';
import styles from './FaqWalkthrough.module.css';

interface FaqWalkthroughAnswer {
  author: string;
  image?: string;
  text: string;
}

export interface FaqWalkthroughProps {
  asker: string;
  askerImage?: string;
  question: string;
  /** Replies in arrival order. */
  answers: readonly FaqWalkthroughAnswer[];
  /** Position of the reply the asker accepts. */
  accepted: number;
}

/** The original continuous animation, dressed in the FAQ discussion's cards and controls. */
export function FaqWalkthrough({ asker, askerImage, question, answers, accepted }: FaqWalkthroughProps) {
  const motion = useMotionAllowed();
  const [paused, setPaused] = useState(false);
  const questionId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  /*
   * Replies arrive in DOM order with no measured positioning.
   * Only the later acceptance move needs offsets, recalculated when rows resize.
   * Reduced motion puts the accepted reply first through grid order.
   */
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !motion) {
      return;
    }
    const rows = Array.from(list.children) as HTMLLIElement[];
    const measure = () => {
      const gap = Number.parseFloat(getComputedStyle(list).rowGap) || 0;
      let top = 0;
      for (const row of [...rows].sort(
        (a, b) => Number(b.hasAttribute('data-accepted')) - Number(a.hasAttribute('data-accepted'))
      )) {
        row.style.setProperty('--faq-after-y', `${top - row.offsetTop}px`);
        top += row.offsetHeight + gap;
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const row of rows) {
      observer.observe(row);
    }
    return () => observer.disconnect();
  }, [answers, accepted, motion]);
  const ordered = answers.map((answer, index) => ({ ...answer, index }));

  return (
    <div className={styles.walkthrough}>
      <Group justify="space-between" wrap="nowrap">
        <Eyebrow>Example discussion</Eyebrow>
        {motion ? (
          <IconAction
            label="Pause animation"
            emphasis="quiet"
            intent="neutral"
            size="sm"
            pressed={paused}
            onClick={() => setPaused((current) => !current)}
            icon={paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
          />
        ) : null}
      </Group>
      <div className={styles.stage} data-motion={motion ? undefined : 'reduce'} data-paused={paused || undefined}>
        <div className={styles.question}>
          <ExampleAuthor name={asker} image={askerImage} label="Asked by" />
          <Surface as="section" aria-labelledby={questionId} padding="lg">
            <Stack gap="md">
              <div className={styles.title}>
                <div className={styles.typed}>
                  <BlockHeading id={questionId} title={question} />
                </div>
                <span className={styles.caret} aria-hidden />
              </div>
              <Group gap="xs">
                <div className={styles.status}>
                  <span className={styles.open}>
                    <StatusBadge tone="neutral">Open question</StatusBadge>
                  </span>
                  <span className={styles.badge}>
                    <StatusBadge tone="positive">Answered</StatusBadge>
                  </span>
                </div>
                <Text size="xs" c="dimmed">
                  Asked just now
                </Text>
              </Group>
            </Stack>
          </Surface>
        </div>
        <ol ref={listRef} className={styles.answers} aria-label="Example answers">
          {ordered.map((answer) => {
            const isAccepted = answer.index === accepted;
            return (
              <li
                key={answer.index}
                className={styles.answer}
                data-order={answer.index}
                data-accepted={isAccepted || undefined}
                data-arrival={answer.index === 0 ? 'first' : answer.index === 1 ? 'second' : 'third'}
              >
                <ExampleAuthor name={answer.author} image={answer.image} />
                <Surface as="article" aria-label={`${answer.author}'s example answer`} padding="lg">
                  <Stack gap="md">
                    <Group justify="space-between" wrap="nowrap" align="start">
                      <Group gap="xs">
                        <div className={styles.status}>
                          <Text size="xs" fw={700} className={isAccepted ? styles.open : undefined}>
                            Answer
                          </Text>
                          {isAccepted ? (
                            <span className={styles.badge}>
                              <StatusBadge tone="positive">Accepted answer</StatusBadge>
                            </span>
                          ) : null}
                        </div>
                        <Text size="xs" c="dimmed">
                          Just now
                        </Text>
                      </Group>
                      <IconAction
                        label="Example answer actions"
                        intent="neutral"
                        emphasis="standard"
                        size="lg"
                        icon={<EllipsisVertical size={17} aria-hidden />}
                        renderRoot={(props) => <span {...props} aria-hidden />}
                      />
                    </Group>
                    {isAccepted ? (
                      <Text size="xs" c="dimmed" className={styles.acceptedAt}>
                        Accepted by {asker} just now
                      </Text>
                    ) : null}
                    <Text className={styles.prose}>{answer.text}</Text>
                    <Group justify="flex-end" className={styles.acceptRow} aria-hidden>
                      <div className={styles.accept}>
                        <Button
                          component="span"
                          color="confirm"
                          variant="filled"
                          size="sm"
                          className={styles.acceptButton}
                          leftSection={<BadgeCheck size={17} aria-hidden />}
                        >
                          Accept answer
                        </Button>
                        {isAccepted ? <MousePointer2 className={styles.pointer} size={24} aria-hidden /> : null}
                      </div>
                    </Group>
                  </Stack>
                </Surface>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function ExampleAuthor({ name, image, label }: { name: string; image?: string; label?: string }) {
  return (
    <Stack gap="xs" className={styles.author}>
      {label ? <Eyebrow>{label}</Eyebrow> : null}
      <div className={styles.identity}>
        <Avatar src={image} alt="" size={56} radius="50%">
          {name.slice(0, 2).toUpperCase()}
        </Avatar>
        <Text fw={600}>{name}</Text>
      </div>
    </Stack>
  );
}
