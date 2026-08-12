import { useReducedMotion } from '@mantine/hooks';
import { useEffect, useState } from 'react';

import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { factionTokenFixtures } from '@game/fixtures/factionTokens';

import styles from './AnimatedLeaderToken.module.css';

const PORTRAITS = [
  '/image/leader/ilya/ecaz.jpg',
  '/image/leader/ilya/hundro.jpg',
  '/image/leader/ilya/korba.png',
] as const;

const EDITS = [
  { name: 'Lady Siona', strength: '4', ...factionTokenFixtures.ecaz },
  { name: 'Duke Maros', strength: '2', ...factionTokenFixtures.moritani },
  { name: 'Farok', strength: '5', ...factionTokenFixtures.fremen },
] as const;

type AnimationPhase = 'hold' | 'transition' | 'typing';

/** A real leader token that demonstrates gradual edits while preserving its portrait. */
export function AnimatedLeaderToken() {
  const reduceMotion = useReducedMotion();
  const [portrait, setPortrait] = useState<(typeof PORTRAITS)[number]>(PORTRAITS[0]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<AnimationPhase>('hold');
  const [typedLength, setTypedLength] = useState(EDITS[0].name.length);
  const leader = EDITS[currentIndex];

  useEffect(() => {
    setPortrait(PORTRAITS[Math.floor(Math.random() * PORTRAITS.length)]);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }

    let delay = 1800;
    const advance = () => {
      if (phase === 'hold') {
        setPreviousIndex(currentIndex);
        setCurrentIndex((current) => (current + 1) % EDITS.length);
        setTypedLength(0);
        setPhase('transition');
        return;
      }
      if (phase === 'transition') {
        setPreviousIndex(null);
        setPhase('typing');
        return;
      }
      if (typedLength < leader.name.length) {
        setTypedLength((current) => current + 1);
        return;
      }
      setPhase('hold');
    };

    if (phase === 'transition') {
      delay = 850;
    }
    if (phase === 'typing') {
      delay = typedLength < leader.name.length ? 90 : 700;
    }
    const timer = window.setTimeout(advance, delay);
    return () => window.clearTimeout(timer);
  }, [currentIndex, leader.name.length, phase, reduceMotion, typedLength]);

  const displayedName =
    phase === 'hold' ? leader.name : phase === 'typing' ? leader.name.slice(0, typedLength) : '';

  return (
    <div
      className={styles.root}
      role="img"
      aria-label="An example leader token changing as it is edited"
    >
      {previousIndex !== null ? (
        <div className={styles.previous}>
          <LeaderToken {...EDITS[previousIndex]} image={portrait} />
        </div>
      ) : null}
      <div className={previousIndex === null ? styles.stable : styles.current}>
        <LeaderToken {...leader} image={portrait} name={displayedName || '\u00a0'} />
      </div>
    </div>
  );
}
