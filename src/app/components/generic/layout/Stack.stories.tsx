import { legacyStoryParameters } from '@sb/legacyStoryParameters';
import preview from '@sb/preview';

import { Stack } from './Stack';
import type { StackGap } from './Stack';

const meta = preview.meta({
  component: Stack,
  parameters: {
    ...legacyStoryParameters,
    layout: 'padded',
  },
});

const demoItemStyle = {
  padding: '0.5rem 0.75rem',
  borderRadius: 6,
  background: 'rgba(0, 0, 0, 0.08)',
} as const;

const gaps: StackGap[] = [1, 2, 3, 4];

export const Default = meta.story({
  args: {
    children: (
      <>
        <div style={demoItemStyle}>First item</div>
        <div style={demoItemStyle}>Second item</div>
        <div style={demoItemStyle}>Third item</div>
      </>
    ),
  },
});

export const GapVariants = meta.story({
  render: () => (
    <Stack gap={4}>
      {gaps.map((gap) => (
        <section key={gap}>
          <p>Gap {gap}</p>
          <Stack gap={gap}>
            <div style={demoItemStyle}>First item</div>
            <div style={demoItemStyle}>Second item</div>
          </Stack>
        </section>
      ))}
    </Stack>
  ),
});

export const SemanticElement = meta.story({
  render: () => (
    <Stack
      as="ul"
      gap={2}
      aria-label="Deployment stages"
      style={{ margin: 0, padding: 0, listStyle: 'none' }}
    >
      <li style={demoItemStyle}>Build</li>
      <li style={demoItemStyle}>Verify</li>
      <li style={demoItemStyle}>Deploy</li>
    </Stack>
  ),
});
