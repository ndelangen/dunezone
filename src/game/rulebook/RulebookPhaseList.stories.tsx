import preview from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { createPhaseListPage } from './RulebookPhaseList.stories.fixture';
import { RulebookPageRenderer } from './RulebookRenderer';

const meta = preview.meta({
  title: 'Blocks/List/Rendered',
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 'min(850px, 94vw)' }}>
        <Story />
      </div>
    ),
  ],
});

export const PhaseList = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement).getByRole('article', { name: 'Rulebook page: A turn and the Nexus' });
    await document.fonts.ready;
    const icons = [...page.querySelectorAll<HTMLImageElement>('.rulebookListIcon img')];
    expect(icons).toHaveLength(10);
    await waitFor(() => expect(icons.every((icon) => icon.complete && icon.naturalWidth > 0)).toBe(true));
    const items = within(page).getAllByRole('listitem');
    expect(items).toHaveLength(10);
    for (const region of page.querySelectorAll<HTMLElement>('[data-rulebook-region]')) {
      expect(region.scrollHeight).toBeLessThanOrEqual(region.clientHeight + 1);
    }
    expect(within(page).getByRole('complementary')).toHaveTextContent('Example: turn three');
  },
  render: () => (
    <RulebookPageRenderer
      page={createPhaseListPage()}
      settings={{ size: 'square', design: 'illustrated' }}
      pageNumber={4}
    />
  ),
});
