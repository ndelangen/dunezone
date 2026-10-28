import preview from '@sb/preview';

import {
  expectSideBySideSlots,
  expectStackedSlots,
  LayoutSlotPlaceholder,
} from './LayoutSlotPlaceholder.stories.fixture';
import { TicketLayout } from './TicketLayout';

const meta = preview.meta({
  component: TicketLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          "Places a ticket's main part and its stub side by side once the ticket itself is 48rem wide, and stacks them below that, whatever the page's width.",
      },
    },
  },
  render: () => (
    <TicketLayout>
      <TicketLayout.Main>
        <LayoutSlotPlaceholder name="main" tone="primary" minHeight={320} />
      </TicketLayout.Main>
      <TicketLayout.Stub>
        <LayoutSlotPlaceholder name="stub" tone="secondary" minHeight={320} />
      </TicketLayout.Stub>
    </TicketLayout>
  ),
});

/** A wide ticket: the main part and the stub side by side. */
export const Wide = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  play: async ({ canvasElement }) => {
    await expectSideBySideSlots(canvasElement, ['main', 'stub']);
  },
});

/** A narrow ticket on a wide page stacks, since it answers to its own width rather than the page's. */
export const NarrowTicketOnAWidePage = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  decorators: [(Story) => <div style={{ width: '30rem' }}>{Story()}</div>],
  play: async ({ canvasElement }) => {
    await expectStackedSlots(canvasElement, ['main', 'stub']);
  },
});
