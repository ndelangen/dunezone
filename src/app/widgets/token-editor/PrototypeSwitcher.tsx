import { Box, Group, Text, UnstyledButton } from '@mantine/core';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect } from 'react';

/*
 * PROTOTYPE — wayfinder #594. Throwaway.
 *
 * A floating bar for flipping between prototype variants. Deliberately unlike the app's own
 * chrome, so nobody mistakes it for the design under evaluation. Never rendered in production.
 */

const EDITABLE = ['INPUT', 'TEXTAREA'];

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: {
  variants: readonly { key: string; name: string }[];
  current: string;
  onChange: (key: string) => void;
}) {
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current)
  );
  const step = (delta: number) => {
    const next = variants[(index + delta + variants.length) % variants.length];
    if (next) {
      onChange(next.key);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (EDITABLE.includes(target.tagName) || target.isContentEditable)) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        step(-1);
      }
      if (event.key === 'ArrowRight') {
        step(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const active = variants[index];

  return (
    <Box
      style={{
        position: 'fixed',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 400,
        background: '#101014',
        color: '#fff',
        borderRadius: 999,
        padding: '6px 10px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
      }}
    >
      <Group gap="xs" wrap="nowrap">
        <UnstyledButton
          aria-label="Previous variant"
          onClick={() => step(-1)}
          style={{ color: '#fff', display: 'flex' }}
        >
          <ChevronLeft size={18} />
        </UnstyledButton>
        <Text size="sm" fw={700} style={{ whiteSpace: 'nowrap' }}>
          {active ? `${active.key} — ${active.name}` : current}
        </Text>
        <UnstyledButton aria-label="Next variant" onClick={() => step(1)} style={{ color: '#fff', display: 'flex' }}>
          <ChevronRight size={18} />
        </UnstyledButton>
      </Group>
    </Box>
  );
}
