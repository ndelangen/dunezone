/* MOCKUP ONLY: the territory tints panel for design screenshots. Not for merge. */
import { ActionIcon, Button, ColorSwatch, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { Section } from '@ui/block/Section';
import { RadialMenu } from '@ui/control/RadialMenu';

import atomicsSvg from '../../../../../../media/vector/decal/atomics.svg?raw';

const PALETTE = ['#2f7fe0', '#d63a2a', '#3fae4a', '#9450d0', '#f2f2f2', '#1b1b1b'];
const ROWS = [
  { color: '#2f7fe0', name: 'Fremen deployment', count: '16 territories', stamp: false },
  { color: '#d63a2a', name: 'Shield Wall destroyed', count: 'Shield Wall', stamp: true },
];
const atomics = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(atomicsSvg.replace('<svg ', '<svg fill="#f3e6c8" '))}`;

function Eye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function Cross() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function TerritoryTintsPanelMock() {
  const design = (typeof window !== 'undefined' && (window as { __tintDesign?: string }).__tintDesign) || 'A';
  const ring = (typeof window !== 'undefined' && (window as { __ringAt?: [number, number] }).__ringAt) || null;
  const disc = (color: string, on: boolean, stamp = false) => (
    <span
      style={{
        display: 'grid',
        placeItems: 'center',
        width: '100%',
        height: '100%',
        borderRadius: '50%',
        background: color,
        boxShadow: on ? '0 0 0 3px #f3e6c8' : undefined,
        color: color === '#f2f2f2' ? '#222' : '#fff',
        fontSize: 18,
        fontWeight: 700,
      }}
    >
      {stamp ? <img src={atomics} width={26} height={26} alt="" /> : on ? '✓' : ''}
    </span>
  );
  const ringMenu = ring && (
    <RadialMenu
      name="Shield Wall"
      hub="Shield Wall"
      x={ring[0]}
      y={ring[1]}
      onClose={() => {}}
      actions={[
        {
          key: 'tint',
          label: 'Tint',
          icon: 'peek',
          targetsLabel: 'Tint Shield Wall',
          targets: [
            { key: 'b', label: 'Fremen deployment', name: 'Fremen deployment', face: disc('#2f7fe0', false), onSelect: () => {} },
            { key: 'r', label: 'Shield Wall destroyed', name: 'Shield Wall destroyed', face: disc('#d63a2a', true, true), onSelect: () => {} },
            { key: 'g', label: 'New green tint', name: 'New green tint', face: disc('#3fae4a', false), onSelect: () => {} },
            { key: 'p', label: 'New purple tint', name: 'New purple tint', face: disc('#9450d0', false), onSelect: () => {} },
            { key: 'w', label: 'New white tint', name: 'New white tint', face: disc('#f2f2f2', false), onSelect: () => {} },
            { key: 'k', label: 'New black tint', name: 'New black tint', face: disc('#1b1b1b', false), onSelect: () => {} },
          ],
        },
      ]}
    />
  );
  return (
    <>
    {ringMenu}
    <Section
      title="Territory tints"
      description={
        design === 'A'
          ? 'Pick a tint, then click territories on the board to add or remove them. Everyone sees them.'
          : 'Right-click any territory on the board to tint it. Everyone sees them.'
      }
    >
      <Stack gap="xs">
        {ROWS.map((row, index) => {
          const active = design === 'A' && index === 0;
          return (
            <Group
              key={row.name}
              justify="space-between"
              wrap="nowrap"
              px="sm"
              py={6}
              style={{
                borderRadius: 8,
                border: `1px solid ${active ? row.color : 'rgba(214,170,110,0.28)'}`,
                background: active ? 'rgba(47,127,224,0.14)' : 'transparent',
              }}
            >
              <UnstyledButton style={{ flex: 1 }}>
                <Group gap="sm" wrap="nowrap">
                  <ColorSwatch color={row.color} size={22}>
                    {row.stamp && <img src={atomics} width={16} height={16} alt="" />}
                  </ColorSwatch>
                  <div>
                    <Text size="sm" fw={600}>
                      {row.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {active ? 'Painting · click territories on the board' : row.count}
                    </Text>
                  </div>
                </Group>
              </UnstyledButton>
              <Group gap={4} wrap="nowrap">
                <ActionIcon variant="subtle" color="gray" aria-label={`Hide ${row.name}`}>
                  <Eye />
                </ActionIcon>
                <ActionIcon variant="subtle" color="gray" aria-label={`Remove ${row.name}`}>
                  <Cross />
                </ActionIcon>
              </Group>
            </Group>
          );
        })}
        <Group gap="xs" mt={4}>
          <Text size="xs" c="dimmed" mr={4}>
            New tint
          </Text>
          {PALETTE.map((color) => (
            <ColorSwatch key={color} component="button" color={color} size={22} aria-label={`New ${color} tint`} />
          ))}
        </Group>
        <Group gap="xs">
          <Text size="xs" c="dimmed" mr={4}>
            Presets
          </Text>
          <Button size="compact-sm" variant="default">
            Fremen deployment
          </Button>
          <Button size="compact-sm" variant="default">
            Shield Wall destroyed
          </Button>
        </Group>
      </Stack>
    </Section>
    </>
  );
}
