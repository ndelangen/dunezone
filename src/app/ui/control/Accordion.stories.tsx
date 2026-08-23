import { Accordion } from '@mantine/core';
import preview from '@sb/preview';

const meta = preview.meta({
  component: Accordion,
  parameters: { layout: 'centered' },
});

export const Default = meta.story({
  render: () => (
    <Accordion defaultValue="first" w={320}>
      <Accordion.Item value="first">
        <Accordion.Control>First section</Accordion.Control>
        <Accordion.Panel>Content for the first section.</Accordion.Panel>
      </Accordion.Item>
      <Accordion.Item value="second">
        <Accordion.Control>Second section</Accordion.Control>
        <Accordion.Panel>Content for the second section.</Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  ),
});
