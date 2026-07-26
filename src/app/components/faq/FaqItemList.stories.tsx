import preview from '@sb/preview';

import { FaqItemList, FaqItemListRow } from './FaqItemList';

const meta = preview.meta({
  component: FaqItemList,
  globals: {
    backgrounds: { value: 'light', grid: false },
  },
  parameters: {
    layout: 'padded',
  },
});

const badgeStyle = {
  display: 'inline-flex',
  padding: '0.15rem 0.5rem',
  borderRadius: 4,
  background: 'rgba(0, 0, 0, 0.08)',
  fontSize: '0.75em',
} as const;

export const Default = meta.story({
  render: () => (
    <FaqItemList>
      <FaqItemListRow>
        <strong>Can leaders move through the storm?</strong>
        <small>Asked two hours ago</small>
      </FaqItemListRow>
      <FaqItemListRow>
        <strong>When does combat resolution begin?</strong>
        <small>Asked yesterday</small>
      </FaqItemListRow>
    </FaqItemList>
  ),
});

export const WithStatusBadges = meta.story({
  render: () => (
    <FaqItemList>
      <FaqItemListRow>
        <strong>How many forces can ship at once?</strong>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          <span style={badgeStyle}>Answered</span>
          <span style={badgeStyle}>2 answers</span>
          <span style={badgeStyle}>Movement</span>
        </span>
      </FaqItemListRow>
    </FaqItemList>
  ),
});

export const LinkedRows = meta.story({
  render: () => (
    <FaqItemList>
      <FaqItemListRow>
        <a href="#spice-blow">When is the spice blow resolved?</a>
        <small>Core rules · five answers</small>
      </FaqItemListRow>
      <FaqItemListRow>
        <a href="#karama">Can a Karama card cancel this effect?</a>
        <small>Advanced rules · one answer</small>
      </FaqItemListRow>
    </FaqItemList>
  ),
});
