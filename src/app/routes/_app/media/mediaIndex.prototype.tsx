/* Three throwaway media-index designs on /media, selected by ?variant=A, B or C. */
import { Anchor, Button, Divider, Group, Stack, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { Section } from '@ui/block/Section';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';

import { resolveAsset } from '@game/assets/resolveAsset';

import { catalogueEntries, mediaKinds } from './mediaCatalogue';
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
      : samplePositions.map((i) => entries[i % entries.length]!);
  return { ...category, entries, samples };
});
type Gallery = (typeof galleries)[number];
export type PrototypeVariant = 'A' | 'B' | 'C';
const variants = { A: 'Collection wall', B: 'Illustrated directory', C: 'Gallery browser' };

function destination(gallery: Gallery) {
  return mediaLocation({ source: 'media', kind: gallery.kind, q: '', group: '' });
}

function Artwork({ entry }: { entry: MediaEntry }) {
  return entry.value.startsWith('/vector/') ? (
    <svg viewBox="0 0 100 100" className={styles.art} role="img" aria-label={entry.label}>
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

export function VariantA() {
  return (
    <div className={styles.wall}>
      {galleries.map((gallery, index) => (
        <Surface
          key={gallery.kind}
          padding="lg"
          interactive
          className={index < 2 ? styles.featured : styles.wallTile}
          renderRoot={(props) => (
            <Link {...props} className={`${props.className} ${styles.open}`} {...destination(gallery)} />
          )}
        >
          <Section
            title={gallery.title}
            description={`${gallery.entries.length} artworks`}
            action={<ArrowRight size={22} aria-hidden />}
          >
            <div className={`${styles.wallArt} ${gallery.kind === 'leader' ? styles.portraitWall : ''}`}>
              {gallery.samples.slice(0, index < 2 ? 5 : 3).map((entry, i) => (
                <div key={`${entry.value}-${i}`} className={styles.specimen}>
                  <Artwork entry={entry} />
                </div>
              ))}
            </div>
            <Text size="sm" c="dimmed">
              {gallery.description}
            </Text>
          </Section>
        </Surface>
      ))}
    </div>
  );
}

export function VariantB() {
  return (
    <Surface padding="lg">
      <Stack gap="md">
        {galleries.map((gallery, index) => (
          <Stack key={gallery.kind} gap="md">
            {index > 0 && <Divider />}
            <Anchor
              className={styles.directoryRow}
              renderRoot={(props) => <Link {...props} {...destination(gallery)} />}
            >
              <Text className={styles.number} c="dimmed">
                {String(index + 1).padStart(2, '0')}
              </Text>
              <Stack gap={4}>
                <Text size="xl" fw={600}>
                  {gallery.title}
                </Text>
                <Text size="sm" c="dimmed">
                  {gallery.entries.length} artworks
                </Text>
              </Stack>
              <div className={styles.strip}>
                {gallery.samples.slice(0, 4).map((entry, i) => (
                  <Artwork key={`${entry.value}-${i}`} entry={entry} />
                ))}
              </div>
              <ChevronRight size={22} aria-hidden />
            </Anchor>
          </Stack>
        ))}
      </Stack>
    </Surface>
  );
}

export function VariantC({ selected, onSelect }: { selected: string; onSelect: (kind: string) => void }) {
  const gallery = galleries.find((item) => item.kind === selected)!;
  return (
    <Surface padding="lg">
      <div className={styles.browser}>
        <nav aria-label="Preview a gallery" className={styles.categoryNav}>
          {galleries.map((item) => (
            <Button
              key={item.kind}
              variant={item.kind === selected ? 'light' : 'subtle'}
              color="gray"
              justify="space-between"
              size="lg"
              fullWidth
              rightSection={<Text size="xs">{item.entries.length}</Text>}
              onClick={() => onSelect(item.kind)}
              aria-pressed={item.kind === selected}
            >
              {item.title}
            </Button>
          ))}
        </nav>
        <div className={styles.stage}>
          <Section
            title={gallery.title}
            description={gallery.description}
            action={
              <Text size="sm" c="dimmed">
                {gallery.entries.length} artworks
              </Text>
            }
          >
            <Anchor
              className={styles.stageLink}
              aria-label={`Open ${gallery.title} gallery`}
              renderRoot={(props) => <Link {...props} {...destination(gallery)} />}
            >
              <div className={`${styles.stageArt} ${gallery.kind === 'cover' ? styles.covers : ''}`}>
                {gallery.samples.map((entry, i) => (
                  <div key={`${entry.value}-${i}`}>
                    <Artwork entry={entry} />
                  </div>
                ))}
              </div>
            </Anchor>
            <Button
              size="md"
              variant="light"
              rightSection={<ArrowRight size={18} aria-hidden />}
              renderRoot={(props) => <Link {...props} {...destination(gallery)} />}
            >
              Explore {gallery.title.toLowerCase()}
            </Button>
          </Section>
        </div>
      </div>
    </Surface>
  );
}

function PrototypeSwitcher({
  variant,
  onChange,
  selected,
}: {
  variant: PrototypeVariant;
  onChange: (variant: PrototypeVariant) => void;
  selected: string;
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
              {variant === 'C' ? `${mediaKinds.find((kind) => kind.value === selected)?.label} preview · ` : ''}8
              galleries · No search toolbar
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
  const [selected, setSelected] = useState<string>('decal');
  return (
    <>
      <PageLayout>
        <PageLayout.Header size="compact">
          <MediaShowcase overview />
        </PageLayout.Header>
        <PageLayout.Content width="viewport">
          <Stack gap="lg" className={styles.prototype}>
            {variant === 'A' ? (
              <VariantA />
            ) : variant === 'B' ? (
              <VariantB />
            ) : (
              <VariantC selected={selected} onSelect={setSelected} />
            )}
          </Stack>
        </PageLayout.Content>
      </PageLayout>
      {import.meta.env.DEV && <PrototypeSwitcher variant={variant} onChange={onVariant} selected={selected} />}
    </>
  );
}
