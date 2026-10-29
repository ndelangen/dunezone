import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { HeadingIconStory } from './rulebookIllustratedBook.stories.fixture';
import {
  movement,
  stormTiming,
  exampleList,
  stormFigure,
  PageDetailsStory,
  pageDetailsCanvas,
  populatedRulesRegions,
} from './rulebookPageDetailsEdit.stories.fixture';

const meta = preview.meta({
  title: 'Page/Details/Editing',
  parameters: { layout: 'centered' },
});

export const EmptyVisualReference = meta.story({
  render: () => (
    <PageDetailsStory
      initialValue={{
        title: 'Markers and tokens',
        anchor: 'markers-and-tokens',
        showHeading: true,
      }}
      initialRegions={[
        {
          key: 'rail',
          label: 'Figures',
          blocks: [],
          collapsed: false,
          containsActiveBlock: false,
        },
        {
          key: 'content',
          label: 'Notes',
          blocks: [],
          collapsed: false,
          containsActiveBlock: false,
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = pageDetailsCanvas(canvasElement);
    await expect(canvas.getAllByText('No Blocks in this region.')).toHaveLength(2);
    await expect(canvas.getByLabelText('Figures')).toHaveTextContent('0 Blocks');
  },
});

export const CollapsedRegions = meta.story({
  render: () => (
    <PageDetailsStory
      initialValue={{ title: 'Movement', anchor: 'movement', showHeading: true }}
      initialRegions={[
        {
          key: 'column1',
          label: 'Rules',
          blocks: [movement, stormTiming],
          collapsed: false,
          containsActiveBlock: false,
        },
        {
          key: 'column2',
          label: 'Examples',
          blocks: [exampleList, stormFigure],
          collapsed: true,
          containsActiveBlock: false,
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = pageDetailsCanvas(canvasElement);
    await expect(canvas.getByLabelText('Examples')).toHaveAccessibleDescription('2 Blocks');
    await expect(
      canvas.queryByRole('button', {
        name: 'Edit Confirm that the destination is adjacent.',
      })
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Expand Examples' }));
    await expect(
      canvas.getByRole('button', {
        name: 'Edit Confirm that the destination is adjacent.',
      })
    ).toBeVisible();
  },
});

export const InvalidCommonValues = meta.story({
  render: () => (
    <PageDetailsStory
      initialValue={{ title: '', anchor: 'Movement section', showHeading: true }}
      diagnostics={{
        title: 'Enter a Page title.',
        anchor: 'Use lowercase letters, numbers, and single hyphens.',
      }}
      initialRegions={populatedRulesRegions}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = pageDetailsCanvas(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'Title' })).toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByRole('textbox', { name: 'Anchor' })).toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByText('Enter a Page title.')).toBeVisible();
  },
});

/** The title icon chosen in the page details leads the rendered page heading, and clearing it takes it away. */
export const HeadingIcon = meta.story({
  render: () => <HeadingIconStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('combobox', { name: 'Title icon' })).toHaveValue('Battle');
    const heading = within(canvas.getByRole('article', { name: 'Rulebook page: Battle' })).getByRole('heading', {
      name: 'Battle',
      level: 1,
    });
    await expect(heading.querySelector('img')).toHaveAttribute('src', '/vector/icon/combat.svg');
    await userEvent.click(canvas.getByLabelText('Clear artwork'));
    await expect(heading.querySelector('img')).toBeNull();
  },
});
