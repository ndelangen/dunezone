import preview from '@sb/preview';

import { Stack } from '@app/components/generic/layout';

import { Answer } from './Answer';

const meta = preview.meta({
  component: Answer.List,
  globals: {
    backgrounds: { value: 'light', grid: false },
  },
  parameters: {
    layout: 'padded',
  },
});

export const Default = meta.story({
  render: () => (
    <Answer.List>
      <Answer.Item>
        <Stack gap={1}>
          <strong>Use the storm as cover.</strong>
          <span>Submitted by a ruleset contributor.</span>
        </Stack>
      </Answer.Item>
      <Answer.Item>
        <Stack gap={1}>
          <strong>Resolve movement before combat.</strong>
          <span>Submitted by the question author.</span>
        </Stack>
      </Answer.Item>
    </Answer.List>
  ),
});

export const Accepted = meta.story({
  render: () => (
    <Answer.List>
      <Answer.Item id="accepted-answer" isAccepted>
        <Stack gap={1}>
          <strong>Accepted answer</strong>
          <span>The item exposes its state through data-accepted=&quot;true&quot;.</span>
        </Stack>
      </Answer.Item>
    </Answer.List>
  ),
});
