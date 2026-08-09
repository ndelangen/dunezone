import { ActionIcon, Group, Paper, Text } from '@mantine/core';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect } from 'react';

export interface PrototypeVariant<Key extends string> {
  key: Key;
  name: string;
}

interface PrototypeSwitcherProps<Key extends string> {
  ariaLabel: string;
  variants: readonly PrototypeVariant<Key>[];
  current: Key;
  onChange: (variant: Key) => void;
}

/** PROTOTYPE ONLY — shared variant navigation for throwaway UI explorations. */
export function PrototypeSwitcher<Key extends string>({
  ariaLabel,
  variants,
  current,
  onChange,
}: PrototypeSwitcherProps<Key>) {
  const currentIndex = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current)
  );

  const cycle = (direction: -1 | 1) => {
    const nextIndex = (currentIndex + direction + variants.length) % variants.length;
    onChange(variants[nextIndex].key);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        cycle(-1);
      }
      if (event.key === 'ArrowRight') {
        cycle(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  if (import.meta.env.PROD) {
    return null;
  }

  return (
    <Paper
      component="nav"
      aria-label={ariaLabel}
      bg="gray.9"
      c="white"
      shadow="xl"
      radius="xl"
      px="xs"
      py={6}
      pos="fixed"
      left="50%"
      bottom="var(--mantine-spacing-md)"
      style={{ transform: 'translateX(-50%)', zIndex: 1000 }}
    >
      <Group gap="xs" wrap="nowrap">
        <ActionIcon
          aria-label="Previous prototype variant"
          color="dune"
          variant="filled"
          radius="xl"
          onClick={() => cycle(-1)}
        >
          <ArrowLeft size={17} aria-hidden />
        </ActionIcon>
        <Text size="sm" fw={700} miw="15rem" ta="center">
          {current.toUpperCase()} — {variants[currentIndex].name}
        </Text>
        <ActionIcon
          aria-label="Next prototype variant"
          color="dune"
          variant="filled"
          radius="xl"
          onClick={() => cycle(1)}
        >
          <ArrowRight size={17} aria-hidden />
        </ActionIcon>
      </Group>
    </Paper>
  );
}
