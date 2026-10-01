/* Three throwaway media-index designs on /media, selected by ?variant=A, B or C. */
import { Button, Group, Stack, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { Section } from '@ui/block/Section';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect } from 'react';

import { resolveAsset } from '@game/assets/resolveAsset';

import { catalogueEntries } from './mediaCatalogue';
import type { MediaEntry } from './mediaCatalogue';
import styles from './mediaIndex.prototype.module.css';
import { mediaLocation } from './mediaNavigation';
import { MediaShowcase } from './MediaShowcase';

const categories = [
  { kind: 'leader', title: 'Leaders', description: 'Portraits for your faction leaders.' },
  { kind: 'decal', title: 'Decals', description: 'Illustrations for cards and game pieces.' },
  { kind: 'logo', title: 'Emblems', description: 'Faction crests and insignia.' },
  { kind: 'troop', title: 'Troops', description: 'Silhouettes for your forces.' },
  { kind: 'planet', title: 'Planets', description: 'Worlds, moons and celestial bodies.' },
  { kind: 'generic', title: 'Symbols', description: 'Signs and shapes for custom creations.' },
  { kind: 'icon', title: 'Game icons', description: 'Actions, resources and game concepts.' },
  { kind: 'cover', title: 'Rulebook covers', description: 'Scenes for the front of your rulebook.' },
] as const;

const galleries = categories.map((category) => {
  const entries = catalogueEntries.filter((entry) => entry.kind === category.kind);
  const previewEntries = entries.filter((entry) => entry.value !== '/vector/logo/choam.svg');
  const samplePositions = category.kind === 'leader' ? [1, 28, 117, 241, 310, 432] : [0, 3, 8, 12, 19, 24];
  const samples =
    category.kind === 'decal'
      ? [
          'poison-blade',
          'atomics-multicolor',
          'ornithopters',
          'weather-control',
          'family-atomics-no-text',
          'prana-bundu',
        ].map((name) => entries.find((entry) => entry.value === `/vector/decal/${name}.svg`)!)
      : samplePositions.map((i) => previewEntries[i % previewEntries.length]!);
  return { ...category, entries, samples };
});
type Gallery = (typeof galleries)[number];
export type PrototypeVariant = 'A' | 'B' | 'C';
const variants = { A: 'Tight wall', B: 'Even grid', C: 'Decals first' };

function destination(gallery: Gallery) {
  return mediaLocation({ source: 'media', kind: gallery.kind, q: '', group: '' });
}

function Artwork({ entry }: { entry: MediaEntry }) {
  return entry.value.startsWith('/vector/') ? (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      className={styles.art}
      role="img"
      aria-label={entry.label}
    >
      <use href={`${entry.value}#root`} fill="currentColor" />
    </svg>
  ) : (
    <img
      src={resolveAsset(entry.value, 'small')}
      alt={entry.label}
      className={`${styles.art} ${entry.kind === 'leader' ? styles.disc : ''}`}
      loading="lazy"
    />
  );
}

function GalleryTile({
  gallery,
  className = '',
  featured = false,
}: {
  gallery: Gallery;
  className?: string;
  featured?: boolean;
}) {
  return (
    <Surface
      padding="md"
      interactive
      className={className}
      renderRoot={(props) => (
        <Link {...props} className={`${props.className} ${styles.open}`} {...destination(gallery)} />
      )}
    >
      <Section
        title={gallery.title}
        action={
          <Group gap="xs">
            <Text size="xs" c="dimmed">
              {gallery.entries.length}
            </Text>
            <ArrowRight size={16} aria-hidden />
          </Group>
        }
      >
        <div
          className={`${styles.collage} ${featured ? styles.largeCollage : ''} ${gallery.kind === 'leader' ? styles.portraits : ''} ${gallery.kind === 'decal' ? styles.decals : ''}`}
        >
          {gallery.samples.slice(0, featured ? 6 : 3).map((entry, i) => (
            <div key={`${entry.value}-${i}`} className={styles.specimen}>
              <Artwork entry={entry} />
            </div>
          ))}
        </div>
      </Section>
    </Surface>
  );
}

export function VariantA() {
  return (
    <div className={styles.tightWall}>
      {galleries.map((gallery, i) => (
        <GalleryTile
          key={gallery.kind}
          gallery={gallery}
          featured={i < 2}
          className={i < 2 ? styles.featured : styles.wallTile}
        />
      ))}
    </div>
  );
}

export function VariantB() {
  return (
    <div className={styles.evenGrid}>
      {galleries.map((gallery) => (
        <GalleryTile key={gallery.kind} gallery={gallery} />
      ))}
    </div>
  );
}

export function VariantC() {
  return (
    <div className={styles.decalsFirst}>
      <GalleryTile gallery={galleries[1]!} featured className={styles.focusDecals} />
      <GalleryTile gallery={galleries[0]!} featured className={styles.focusLeaders} />
      {galleries.slice(2).map((gallery) => (
        <GalleryTile key={gallery.kind} gallery={gallery} />
      ))}
    </div>
  );
}

function PrototypeSwitcher({
  variant,
  onChange,
}: {
  variant: PrototypeVariant;
  onChange: (variant: PrototypeVariant) => void;
}) {
  const change = (direction: number) => {
    const keys = Object.keys(variants) as PrototypeVariant[];
    onChange(keys[(keys.indexOf(variant) + direction + keys.length) % keys.length]!);
  };
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        !(event.target instanceof Element) ||
        event.target.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }
      event.preventDefault();
      change(event.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  });
  return (
    <div className={styles.switcher}>
      <Surface padding="sm">
        <Group gap="sm" wrap="nowrap" justify="space-between">
          <IconAction label="Previous design" icon={<ArrowLeft size={20} />} onClick={() => change(-1)} />
          <Stack gap={2} align="center">
            <Text size="xs" c="dimmed">
              INDEX PROTOTYPE · {variant} / 3
            </Text>
            <Group gap={4}>
              {(Object.keys(variants) as PrototypeVariant[]).map((key) => (
                <Button
                  key={key}
                  size="compact-xs"
                  variant={variant === key ? 'filled' : 'subtle'}
                  onClick={() => onChange(key)}
                  aria-label={`Design ${key}: ${variants[key]}`}
                >
                  {key}
                </Button>
              ))}
              <Text size="sm" fw={600}>
                {variants[variant]}
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              Round 2 · Smaller gaps · Varied artwork sizes
            </Text>
          </Stack>
          <IconAction label="Next design" icon={<ArrowRight size={20} />} onClick={() => change(1)} />
        </Group>
      </Surface>
    </div>
  );
}

export function MediaIndexPrototype({
  variant,
  onVariant,
}: {
  variant: PrototypeVariant;
  onVariant: (variant: PrototypeVariant) => void;
}) {
  return (
    <>
      <PageLayout>
        <PageLayout.Header size="compact">
          <MediaShowcase overview compact />
        </PageLayout.Header>
        <PageLayout.Content width="viewport">
          <Stack gap="lg" className={styles.prototype}>
            {variant === 'A' ? <VariantA /> : variant === 'B' ? <VariantB /> : <VariantC />}
          </Stack>
        </PageLayout.Content>
      </PageLayout>
      {import.meta.env.DEV && <PrototypeSwitcher variant={variant} onChange={onVariant} />}
    </>
  );
}
