import { Code } from '@mantine/core';
import preview from '@sb/preview';

import { asDefaultElement } from '../mantine.stories.fixture';

const meta = preview.meta({
  component: asDefaultElement(Code),
  parameters: { layout: 'padded' },
  globals: { backgrounds: { value: 'light', grid: false } },
  args: { children: 'j7f2k9d4m1p8' },
});

/** An identifier quoted in a sentence — a job id, an asset key. */
export const Inline = meta.story({});

/** Standalone, for output that has its own lines. */
export const Block = meta.story({
  args: { block: true, children: 'capture: queued\npublish: in_progress' },
});
