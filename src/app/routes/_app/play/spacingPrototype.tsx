/*
 * PROTOTYPE, #1321 F55. Throwaway, on prototype/1321-1321-f55-play-spacing, which never merges.
 *
 * `?variant=a|b|c` on a game's route picks the seated header's spacing, and the table marks the play shell with it.
 * B is the play stylesheet on this branch: the header reads md and sm, and the scale's own phone step shrinks md.
 * A puts back today's raw lengths and C takes the smaller step wherever two are near, both from a block at the end of the play stylesheet.
 * Everything below the xs step reads a named property in all three and renders as today.
 */
import { Box, SegmentedControl, Text } from '@mantine/core';
import { useNavigate, useSearch } from '@tanstack/react-router';

const PLAY_SPACING_VARIANTS = [
  { key: 'a', name: 'A: as today' },
  { key: 'b', name: 'B: md and sm, by what each gap separates' },
  { key: 'c', name: 'C: the smaller step, sm and xs' },
] as const;

export type PlaySpacingVariant = (typeof PLAY_SPACING_VARIANTS)[number]['key'];

export function isPlaySpacingVariant(value: unknown): value is PlaySpacingVariant {
  return PLAY_SPACING_VARIANTS.some((variant) => variant.key === value);
}

/* The variant the page asks for; B, the branch's stylesheet, when it asks for none. */
export function usePlaySpacingVariant(): PlaySpacingVariant {
  return useSearch({ from: '/_app/play/$gameId' }).variant ?? 'b';
}

/* The floating bar that flips `?variant=` in place. */
export function PlaySpacingVariantBar() {
  const current = usePlaySpacingVariant();
  const navigate = useNavigate({ from: '/play/$gameId' });
  if (import.meta.env.PROD) {
    return null;
  }
  const active = PLAY_SPACING_VARIANTS.find((variant) => variant.key === current);
  return (
    <Box
      component="nav"
      aria-label="Prototype variants for #1321"
      data-spacing-prototype-bar=""
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        zIndex: 1000,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        maxWidth: 'calc(100vw - 24px)',
        padding: '6px 12px',
        borderRadius: 999,
        background: '#101014',
        boxShadow: '0 8px 24px rgb(0 0 0 / 45%)',
        color: '#fff',
        transform: 'translateX(-50%)',
      }}
    >
      <Text size="xs" fw={700}>
        #1321 play spacing
      </Text>
      <SegmentedControl
        size="xs"
        value={current}
        onChange={(value) =>
          void navigate({
            search: (previous) => ({ ...previous, variant: isPlaySpacingVariant(value) ? value : 'b' }),
            replace: true,
          })
        }
        data={PLAY_SPACING_VARIANTS.map((variant) => ({ value: variant.key, label: variant.key.toUpperCase() }))}
      />
      <Text size="xs">{active?.name}</Text>
    </Box>
  );
}
