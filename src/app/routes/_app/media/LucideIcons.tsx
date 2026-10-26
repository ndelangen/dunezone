import { Stack, Text } from '@mantine/core';
import { Surface } from '@ui/surface';
import { icons } from 'lucide-react';
import type { ReactNode } from 'react';

import styles from './route.module.css';

const lucideEntries = Object.entries(icons);

/**
 * Every Lucide icon, about 1,900 of them and 190 KB gzipped, so the gallery loads them only when this source is open.
 * The heading takes the match count, which needs the same list.
 */
export default function LucideIcons({
  query,
  heading,
}: Readonly<{ query: string; heading: (total: number) => ReactNode }>) {
  const matches = lucideEntries.filter(([name]) => name.toLowerCase().includes(query));
  return (
    <>
      {heading(matches.length)}
      <div className={styles.grid}>
        {matches.map(([name, Icon]) => (
          <Surface key={name} padding="md" className={styles.card}>
            <Stack align="center" gap="sm">
              <Icon size={48} aria-hidden />
              <Text size="xs">{name}</Text>
            </Stack>
          </Surface>
        ))}
      </div>
      {matches.length === 0 && <Text>No artwork matches these filters. Try fewer words or clear the filters.</Text>}
    </>
  );
}
