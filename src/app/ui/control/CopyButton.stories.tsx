import { Button, CopyButton } from '@mantine/core';
import preview from '@sb/preview';

const meta = preview.meta({
  title: 'Copy Button',
  component: CopyButton,
  args: {
    value: 'Example text',
    children: ({ copied, copy }) => <Button onClick={copy}>{copied ? 'Copied' : 'Copy text'}</Button>,
  },
});
export const Default = meta.story({});
