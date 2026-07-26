import { legacyStoryParameters } from '@sb/legacyStoryParameters';
import preview from '@sb/preview';

import { AccordionSection } from './Accordion';

const meta = preview.meta({
  component: AccordionSection,
  parameters: legacyStoryParameters,
  decorators: [
    (Story) => (
      <div style={{ width: 'min(100%, 22rem)' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    sectionId: 'rules',
    title: 'Faction rules',
    isOpen: true,
    onToggle: () => {},
    children: <p style={{ margin: 0 }}>Rules unique to this faction.</p>,
  },
});

export const Expanded = meta.story({});

export const CollapsedWithIcon = meta.story({
  args: {
    sectionId: 'alliance',
    title: 'Alliance ability',
    icon: (
      <span style={{ fontSize: '0.85rem' }} aria-hidden>
        ◆
      </span>
    ),
    isOpen: false,
  },
});
