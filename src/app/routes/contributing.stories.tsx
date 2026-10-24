import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { expectDiagramLabelsFit } from './contributing.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({ title: 'Contributing', ...pageStoryMeta });

export const Overview = meta.story({
  args: { path: '/contributing' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Contributing', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await Promise.all(
      ['Start here', 'Codebase', 'Data', 'Interface', 'How it ships', 'Technical glossary', 'Design decisions'].map(
        async (title) => {
          await expect(page.getByRole('heading', { name: title, level: 2 })).toBeVisible();
          await expect(
            page.getByRole('region', { name: title }).querySelector('[data-connected-tabs-mobile-picker]')
          ).not.toBeNull();
        }
      )
    );
    const icons = page.getAllByRole('tab').map((tab) => tab.querySelector('svg')?.getAttribute('class'));
    await expect(icons.every(Boolean)).toBe(true);
    await expect(new Set(icons).size).toBe(icons.length);
  },
});

export const Code = meta.story({
  args: { path: '/contributing/code' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const tree = within(await page.findByRole('tree', { name: 'Repository files' }, { timeout: 30_000 }));
    await expect(tree.getByRole('link', { name: '.github/workflows/' })).toBeVisible();
    await userEvent.click(tree.getByText('Kit components render caller-supplied data.'));
    await expect(tree.getByRole('link', { name: 'content/' })).toHaveAttribute(
      'href',
      'https://github.com/ndelangen/dunezone/tree/main/src/app/ui/content'
    );
  },
});
export const Deployment = meta.story({
  args: { path: '/contributing/deployment' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const deployment = within(await page.findByRole('region', { name: 'How it ships' }, { timeout: 30_000 }));
    const backend = within(deployment.getByRole('figure', { name: 'Step 2: Deploy compatible Convex functions' }));
    await expect(backend.getByRole('img', { name: 'Convex runs new code, changes at this step' })).toBeVisible();
    await expect(backend.getByRole('img', { name: 'Site Worker runs previous code' })).toBeVisible();
    const game = within(deployment.getByRole('figure', { name: 'Step 5: Deploy the game Worker' }));
    await expect(game.getByRole('img', { name: 'Game Worker runs new code, changes at this step' })).toBeVisible();
    await expect(game.getByRole('img', { name: 'Site Worker runs previous code' })).toBeVisible();
    const site = within(deployment.getByRole('figure', { name: 'Step 7: Deploy and check the site Worker' }));
    await expect(site.getByRole('img', { name: 'Site Worker runs new code, changes at this step' })).toBeVisible();
    await expect(site.getByRole('img', { name: 'Open tab runs previous code' })).toBeVisible();
    await expect(deployment.getByRole('heading', { name: 'Release gate' })).toBeVisible();
    await expect(deployment.getByRole('heading', { name: 'Check the commit' })).toBeVisible();
    await expect(deployment.getByRole('heading', { name: 'Publish Storybook and queue image updates' })).toBeVisible();
    await expect(deployment.queryByRole('button', { name: 'Next step' })).toBeNull();
  },
});
export const Glossary = meta.story({
  args: { path: '/contributing/glossary' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const glossary = within(await page.findByRole('region', { name: 'Technical glossary' }, { timeout: 30_000 }));
    await expect(glossary.getByRole('tab', { name: 'Code structure' })).toHaveAttribute('aria-selected', 'true');
    await expect(glossary.queryByRole('tab', { name: 'Parts of a page' })).toBeNull();
    await expect(
      page.getAllByRole('img', {
        name: 'Application chrome contains the header band, optional page toolbar, main content and shell footer',
      })
    ).toHaveLength(1);
  },
});
export const DesignDecisions = meta.story({ args: { path: '/contributing/design-decisions' } });

export const TechnologyStack = meta.story({
  args: { path: '/contributing/stack' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const stack = within(await page.findByRole('tabpanel', { name: 'Technology stack' }, { timeout: 30_000 }));
    await expect(stack.getByRole('link', { name: 'TanStack Router and Start' })).toHaveAttribute(
      'href',
      'https://tanstack.com/'
    );
    await expect(stack.getByRole('link', { name: 'Vite+' })).toHaveAttribute('href', 'https://viteplus.dev/');
    await expect(stack.queryByRole('heading')).toBeNull();
    await expect(stack.queryByText('What the application is built from.')).toBeNull();
  },
});
export const LocalSetup = meta.story({
  args: { path: '/contributing/setup' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const prompt = within(await page.findByRole('region', { name: 'Agent setup prompt' }, { timeout: 30_000 }));
    await expect(prompt.getByRole('button', { name: 'Copy agent prompt' })).toBeVisible();
    await expect(prompt.getByText(/Set up this Dune Zone checkout/)).toHaveTextContent('bun run app:dev --local');
  },
});
export const PhoneNavigation = meta.story({
  args: { path: '/contributing/glossary' },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const picker = await page.findByRole('combobox', { name: 'Technical glossary topics' }, { timeout: 30_000 });
    await userEvent.click(picker);
    await userEvent.click(await page.findByRole('option', { name: 'Image terms' }));
    const glossary = within(page.getByRole('region', { name: 'Technical glossary' }));
    await expect(glossary.getByRole('tabpanel', { name: 'Image terms' })).toBeVisible();
    await expect(glossary.getByRole('combobox', { name: 'Technical glossary topics' })).toHaveTextContent(
      'Image terms'
    );
    await expect(page.getByRole('combobox', { name: 'Codebase topics' })).toHaveTextContent('Repository map');
  },
});

export const PageData = meta.story({
  args: { path: '/contributing/code/data' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const data = within(await page.findByRole('region', { name: 'Data' }, { timeout: 30_000 }));
    const readers = data.getByLabelText('Signed-in viewers looking at the same faction');
    await userEvent.clear(readers);
    await userEvent.type(readers, '6');
    await expect(data.getByRole('region', { name: 'Shared page query' })).toHaveTextContent(
      '1 public page result for 6 viewers'
    );
    await expect(data.getByRole('region', { name: 'Viewer-dependent page query' })).toHaveTextContent(
      'Up to 6 page-result variants'
    );
  },
});
export const PageInterface = meta.story({ args: { path: '/contributing/code/interface' } });
export const CheckingChanges = meta.story({
  args: { path: '/contributing/code/testing' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const checks = within(await page.findByRole('tabpanel', { name: 'Checks' }, { timeout: 30_000 }));
    await expect(checks.getByRole('img', { name: /Types reject a number/ })).toBeVisible();
    await expect(checks.getByRole('img', { name: /A seam test calls a mutation/ })).toBeVisible();
    await expect(checks.getByRole('img', { name: /A browser story clicks the real page/ })).toBeVisible();
    await expect(checks.getByRole('img', { name: /An end-to-end test signs in/ })).toBeVisible();
    await expect(checks.getByRole('img', { name: /Runtime verification checks assembled files/ })).toBeVisible();
  },
});
export const Publishing = meta.story({ args: { path: '/contributing/deployment/publishing' } });
export const SchemaChange = meta.story({
  args: { path: '/contributing/deployment/schema' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const deployment = within(await page.findByRole('region', { name: 'How it ships' }, { timeout: 30_000 }));
    const narrow = within(deployment.getByRole('region', { name: 'Narrow' }));
    const old = within(deployment.getByRole('region', { name: 'Old shape' }));
    const widen = within(deployment.getByRole('region', { name: 'Widen' }));
    const migrate = within(deployment.getByRole('region', { name: 'Migrate' }));
    const verify = within(deployment.getByRole('region', { name: 'Verify' }));
    await expect(widen.getByRole('img', { name: /4 old records, 0 new records/ })).toBeVisible();
    await expect(migrate.getByRole('img', { name: /2 old records, 2 new records/ })).toBeVisible();
    await expect(verify.getByRole('img', { name: /0 old records, 4 new records/ })).toBeVisible();
    await expect(verify.getByText('Accepted', { exact: true })).toBeVisible();
    await expect(narrow.getByText('Rejected', { exact: true })).toBeVisible();
    await expect(old.getByText('Accepted', { exact: true })).toBeVisible();
    await userEvent.click(deployment.getByRole('switch', { name: 'Send the old client shape' }));
    await expect(narrow.getByText('Accepted', { exact: true })).toBeVisible();
    await expect(old.getByText('Rejected', { exact: true })).toBeVisible();
    await expect(widen.getByText('Accepted', { exact: true })).toBeVisible();
    await expect(widen.getByRole('img', { name: /4 old records, 0 new records/ })).toBeVisible();
  },
});
export const PhoneRolloutDiagrams = meta.story({
  args: { path: '/contributing/deployment' },
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const shipping = await page.findByRole('region', { name: 'How it ships' }, { timeout: 30_000 });
    const diagramsFit = async () => {
      await expectDiagramLabelsFit(shipping);
      const tooWide = Array.from(shipping.querySelectorAll<HTMLElement>('figure, section, ol, pre, code'))
        .filter((element) => element.clientWidth > shipping.clientWidth)
        .map((element) => `${element.tagName}.${element.className}: ${element.clientWidth}`);
      await expect(shipping.scrollWidth, tooWide.join('\n')).toBeLessThanOrEqual(shipping.clientWidth + 1);
    };
    await expect(
      within(shipping).getByRole('figure', { name: 'Step 7: Deploy and check the site Worker' })
    ).toBeVisible();
    await diagramsFit();
    await userEvent.click(within(shipping).getByRole('combobox', { name: 'How it ships topics' }));
    await userEvent.click(await page.findByRole('option', { name: 'Schema changes' }));
    await expect(within(shipping).getByRole('region', { name: 'Verify' })).toBeVisible();
    await diagramsFit();
  },
});
export const PageAnatomy = meta.story({
  args: { path: '/contributing/glossary/page' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const term = await page.findByRole('region', { name: 'Page toolbar' }, { timeout: 30_000 });
    window.scrollBy(0, term.getBoundingClientRect().top - Math.min(window.innerHeight * 0.3, 240) + 1);
    await waitFor(async () => {
      const active = page
        .getByRole('img', {
          name: 'Application chrome contains the header band, optional page toolbar, main content and shell footer',
        })
        .querySelector('[data-region="toolbar"]');
      await expect(active).toHaveAttribute('data-active', 'true');
    });
  },
});
export const CodeStructure = meta.story({
  args: { path: '/contributing/glossary/structure' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const categories = within(await page.findByRole('region', { name: 'Six kit categories' }, { timeout: 30_000 }));
    await expect(categories.getAllByRole('img')).toHaveLength(6);
    const name = categories.getByRole('textbox', { name: 'Example name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Desert Alliance');
    await expect(
      categories.getByRole('img', { name: /Content receives data.*Example value: Desert Alliance/ })
    ).toBeVisible();
    await expect(
      categories.getByRole('img', { name: /Controls receives value.*Example value: Desert Alliance/ })
    ).toBeVisible();
    await expect(
      categories.getByRole('img', { name: 'Layout receives named slots. Positions the slots.' })
    ).toBeVisible();
  },
});
export const PublishingWords = meta.story({
  args: { path: '/contributing/glossary/assets' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const diagram = await page.findByRole(
      'figure',
      { name: 'How records, publication jobs and public images connect' },
      { timeout: 30_000 }
    );
    await expect(diagram).toHaveTextContent('1. Queue the asset');
    await expect(diagram).toHaveTextContent('2. Capture in a browser');
    await expect(diagram).toHaveTextContent('3. Serve the publication');
    await expect(within(diagram).getByRole('link', { name: 'Cloudflare R2 object storage' })).toHaveAttribute(
      'href',
      'https://developers.cloudflare.com/r2/'
    );
    await expect(within(diagram).getByRole('link', { name: 'Cloudflare Browser Run' })).toHaveAttribute(
      'href',
      'https://developers.cloudflare.com/browser-run/'
    );
    await expect(
      within(diagram).getByRole('img', {
        name: 'R2 stores a captured image file, then a public page displays that image through PublishedImage',
      })
    ).toBeVisible();
  },
});
export const DataWords = meta.story({
  args: { path: '/contributing/glossary/data' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const name = await page.findByRole('textbox', { name: 'Try a faction name' }, { timeout: 30_000 });
    await userEvent.clear(name);
    await userEvent.type(name, 'Desert Alliance');
    await expect(page.getByRole('status', { name: 'Example faction URL' })).toHaveTextContent(
      'https://dune.zone/factions/desert-alliance'
    );
  },
});
export const ComponentDecisions = meta.story({ args: { path: '/contributing/design-decisions/components' } });
export const LayoutDecisions = meta.story({
  args: { path: '/contributing/design-decisions/layout' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const slider = await page.findByRole('slider', { name: 'Container width' }, { timeout: 30_000 });
    await expect(page.getByRole('figure', { name: 'AtlasLayout named slots' })).toBeVisible();
    await expect(page.getByLabelText('Named slots · TSX')).toHaveTextContent('AtlasLayout.Content');
    await expect(
      page.getByRole('img', { name: 'Avoid: a menu opens an editor which opens another floating picker' })
    ).toBeVisible();
    const items = page.getByLabelText('Responsive layout demonstration').children;
    slider.focus();
    await userEvent.keyboard('{Home}');
    await expect(slider).toHaveAttribute('aria-valuenow', '240');
    await expect(items[1]!.getBoundingClientRect().top).toBeGreaterThan(items[0]!.getBoundingClientRect().top);
    await userEvent.keyboard('{End}');
    await expect(slider).toHaveAttribute('aria-valuenow', '800');
    await expect(items[1]!.getBoundingClientRect().top).toBe(items[0]!.getBoundingClientRect().top);
  },
});
export const DataDecisions = meta.story({ args: { path: '/contributing/design-decisions/data' } });
export const CodeDecisions = meta.story({
  args: { path: '/contributing/design-decisions/code' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const example = await page.findByLabelText(
      'Test the refusal a caller receives · Convex seam test excerpt',
      {},
      { timeout: 30_000 }
    );
    await expect(example).toHaveTextContent('rejects.toThrow("Not authorized")');
    await expect(page.getByLabelText('Avoid · the comment repeats the value')).toHaveTextContent('120_000');
    await expect(page.getByLabelText('Use · explain why the query stays open')).toHaveTextContent('back navigation');
  },
});
export const ComponentMembrane = meta.story({
  args: { path: '/contributing?ui=membrane#guide-ui' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole(
        'img',
        {
          name: 'Use: the page reads data and passes a name in; the component reports a change and the page saves it',
        },
        { timeout: 30_000 }
      )
    ).resolves.toBeVisible();
    await expect(
      page.getByRole('img', {
        name: 'Avoid: a component fetches from the database and navigates without involving its caller',
      })
    ).toBeVisible();
  },
});

async function expectMissingLesson({ canvasElement }: { canvasElement: HTMLElement }) {
  await expect(
    within(canvasElement.ownerDocument.body).findByRole('heading', { name: 'Page not found' }, { timeout: 30_000 })
  ).resolves.toBeVisible();
}

export const UnknownCodeLesson = meta.story({
  args: { path: '/contributing/code/toString' },
  play: expectMissingLesson,
});

export const UnknownGlossaryTopic = meta.story({
  args: { path: '/contributing/glossary/constructor' },
  play: expectMissingLesson,
});
