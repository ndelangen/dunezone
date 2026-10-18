import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { ContributingGuideLookContext } from '@app/widgets/contributing-guide/ContributingGuide';

import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Contributing',
  ...pageStoryMeta,
});

/* PREVIEW ONLY: the tab row Norbert is weighing against the rail; the losing look's stories go before merge. */
const withTabs = [
  (Story: () => React.ReactNode) => (
    <ContributingGuideLookContext.Provider value="tabs">
      <Story />
    </ContributingGuideLookContext.Provider>
  ),
];

/** The guide's front page: what each sub-page covers, what the app is built from and how to run it. */
export const Overview = meta.story({
  args: { path: '/contributing' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Contributing' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findAllByRole('link', { name: /Technical glossary/ })).resolves.not.toHaveLength(0);
  },
});

export const Code = meta.story({ args: { path: '/contributing/code' } });

export const Deployment = meta.story({ args: { path: '/contributing/deployment' } });

/** The technical glossary, found by the word it replaces: PageHead finds the page header. */
export const Glossary = meta.story({
  args: { path: '/contributing/glossary' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Tint' }, { timeout: 30_000 })).resolves.toBeVisible();
    await userEvent.type(page.getByRole('textbox', { name: 'Search the technical glossary' }), 'PageHead');
    await expect(page.findByRole('heading', { name: 'Page header' })).resolves.toBeVisible();
    await expect(page.queryByRole('heading', { name: 'Tint' })).toBeNull();
  },
});

export const DesignDecisions = meta.story({ args: { path: '/contributing/design-decisions' } });

export const OverviewWithTabs = meta.story({ args: { path: '/contributing' }, decorators: withTabs });

export const CodeWithTabs = meta.story({ args: { path: '/contributing/code' }, decorators: withTabs });

export const DeploymentWithTabs = meta.story({ args: { path: '/contributing/deployment' }, decorators: withTabs });

export const GlossaryWithTabs = meta.story({ args: { path: '/contributing/glossary' }, decorators: withTabs });

export const DesignDecisionsWithTabs = meta.story({
  args: { path: '/contributing/design-decisions' },
  decorators: withTabs,
});
