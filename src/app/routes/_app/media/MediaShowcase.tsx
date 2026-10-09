import { Anchor, Group, Stack, Text } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import { DECAL, LEADERS } from '@shared/assetIds';
import { resolveAsset } from '@shared/media/resolveAsset';
import { Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { IconAction } from '@ui/control/IconAction';
import { Pause, Play } from 'lucide-react';
import { useEffect, useReducer } from 'react';

import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { backgroundPresets } from '@game/data/backgrounds';

import { catalogueEntries as mediaEntries } from './mediaCatalogue';
import { mediaLocation } from './mediaNavigation';
import styles from './MediaShowcase.module.css';

const decals = mediaEntries.filter((entry) => entry.kind === 'decal');
const leaders = mediaEntries.filter((entry) => entry.kind === 'leader');
const initial = { decal: 0, leader: 117, paused: false };
type ShowcaseEvent = { type: 'pause' } | { type: 'advance'; decal: number; leader: number };

function nextIndex(current: number, length: number) {
  const choices = length - 1;
  const limit = 2 ** 32 - (2 ** 32 % choices);
  let sample: number;
  do {
    sample = crypto.getRandomValues(new Uint32Array(1))[0]!;
  } while (sample >= limit);
  const index = sample % choices;
  return index >= current ? index + 1 : index;
}

function preload(src: string) {
  const image = new Image();
  image.src = src;
  return image.decode();
}

function useShowcaseRotation() {
  const reducedMotion = useReducedMotion();
  const [state, dispatch] = useReducer(
    (previous: typeof initial, event: ShowcaseEvent) =>
      event.type === 'pause'
        ? { ...previous, paused: !previous.paused }
        : { ...previous, decal: event.decal, leader: event.leader },
    initial
  );
  useEffect(() => {
    if (reducedMotion || state.paused) {
      return;
    }
    let cancelled = false;
    const timer = window.setInterval(() => {
      if (document.hidden) {
        return;
      }
      const decal = nextIndex(state.decal, decals.length);
      const leader = nextIndex(state.leader, leaders.length);
      void Promise.all([preload(decals[decal]!.value), preload(resolveAsset(leaders[leader]!.value, 'large'))])
        .then(() => {
          if (!cancelled) {
            dispatch({ type: 'advance', decal, leader });
          }
        })
        .catch(() => {
          /* Keep the current artwork if its replacement cannot be loaded. */
        });
    }, 6000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [state.decal, state.leader, state.paused, reducedMotion]);

  return { state, dispatch, reducedMotion };
}

export function MediaShowcase({ overview, compact = false }: Readonly<{ overview: boolean; compact?: boolean }>) {
  const { state, dispatch, reducedMotion } = useShowcaseRotation();

  const decal = decals[state.decal]!;
  const leader = leaders[state.leader]!;
  return (
    <div className={styles.header}>
      <Stack gap="sm">
        <PageTitle eyebrow={compact ? undefined : 'Artwork for your creations'} title="Media catalogue" />
        {!compact &&
          (overview ? (
            <Text>Choose a gallery to explore its artwork.</Text>
          ) : (
            <>
              <Text>Find artwork by name, subject or visual detail.</Text>
              <Text size="sm" className={styles.examples}>
                Try "crossed knives", "ringed planet" or "hooded sniper".
              </Text>
            </>
          ))}
        <Text size="sm">{mediaEntries.length.toLocaleString('en')} images and vectors to explore.</Text>
      </Stack>
      <Stack gap="xs" align="center">
        <div className={styles.artwork} aria-label="Examples from the media catalogue">
          <Anchor
            className={styles.cardLink}
            aria-label={`Explore decal ${decal.label}`}
            renderRoot={(props) => (
              <Link
                {...props}
                {...mediaLocation({ source: 'media', kind: 'decal', group: '', q: '', item: decal.value })}
              />
            )}
          >
            <div key={decal.value} className={styles.cardFrame}>
              <TreacheryCard
                name={decal.label}
                head={backgroundPresets.atreides}
                icon={[backgroundPresets.atreides, '/vector/icon/treachery.svg']}
                decals={[{ id: DECAL.parse(decal.value), muted: false, offset: [0, 0], outline: false, scale: 1.6 }]}
                text="Artwork from the media catalogue"
                subName="Decal"
              />
            </div>
          </Anchor>
          <Anchor
            className={styles.leaderLink}
            aria-label={`Explore portrait ${leader.label}`}
            renderRoot={(props) => (
              <Link
                {...props}
                {...mediaLocation({ source: 'media', kind: 'leader', group: '', q: '', item: leader.value })}
              />
            )}
          >
            <div key={leader.value} className={styles.leaderFrame}>
              <LeaderToken
                name={leader.label}
                image={LEADERS.parse(leader.value)}
                background={backgroundPresets.atreides}
                logo="/vector/logo/atreides.svg"
                strength=""
              />
            </div>
          </Anchor>
        </div>
        <Group gap="xs">
          <Text size="xs">Explore either example</Text>
          {!reducedMotion && (
            <IconAction
              label={state.paused ? 'Play artwork preview' : 'Pause artwork preview'}
              size="sm"
              emphasis="quiet"
              intent="neutral"
              icon={state.paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
              onClick={() => dispatch({ type: 'pause' })}
            />
          )}
        </Group>
      </Stack>
    </div>
  );
}
