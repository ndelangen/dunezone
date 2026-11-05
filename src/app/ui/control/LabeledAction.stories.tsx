import { Group, Stack } from '@mantine/core';
import preview from '@sb/preview';
import { ArrowLeft, Check, Download, RotateCcw, Send, Trash2 } from 'lucide-react';

import type { ActionIntent } from './actionIntent';
import { LabeledAction } from './LabeledAction';

const meta = preview.meta({
  component: LabeledAction,
  parameters: { layout: 'centered' },
  globals: { backgrounds: { value: 'dark', grid: false } },
  args: {
    children: 'Reset filters',
    icon: <RotateCcw size={16} />,
  },
});

/** The neutral tinted tile: an action that changes nothing of the reader's. */
export const Default = meta.story({});

const INTENTS: [ActionIntent, string, typeof RotateCcw][] = [
  ['neutral', 'Go back', ArrowLeft],
  ['positive', 'Save answer', Check],
  ['negative', 'Delete answer', Trash2],
  ['publish', 'Publish faction', Send],
  ['export', 'Download PDF', Download],
];

const EMPHASES = ['standard', 'strong'] as const;

/** Every intent at every emphasis, the same grid as IconAction's, so a worded action and its glyph twin can be compared. */
export const EveryIntent = meta.story({
  render: () => (
    <Stack gap="sm">
      {EMPHASES.map((emphasis) => (
        <Group key={emphasis} gap="sm">
          {INTENTS.map(([intent, words, Icon]) => (
            <LabeledAction key={intent} intent={intent} emphasis={emphasis} icon={<Icon size={16} />}>
              {words}
            </LabeledAction>
          ))}
        </Group>
      ))}
    </Stack>
  ),
});

/** Not available right now, saying why on hover and to a screen reader. */
export const DisabledWithReason = meta.story({
  args: {
    children: 'Publish faction',
    icon: <Send size={16} />,
    intent: 'publish',
    disabledReason: 'Add a name first.',
  },
});

/** While the work it started is in flight: a spinner in the glyph's place, still focusable. */
export const Busy = meta.story({ args: { busy: true } });

/** The small size, for a toolbar or a filter row. */
export const Small = meta.story({ args: { size: 'xs' } });
