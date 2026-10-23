import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { NestedTabs } from '@ui/surface';
import type { NestedTabsPath } from '@ui/surface';
import { FileText, Hexagon, List, Settings2, SlidersHorizontal, Square, Triangle } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import {
  ROOT_ONE,
  ROOT_TWO,
  ROOT_THREE,
  NESTED_ONE,
  NESTED_TWO,
  NESTED_THREE,
  PanelFixture,
} from './NestedTabs.stories.fixture';
import styles from './NestedTabs.stories.module.css';

const meta = testingPreview.meta({
  title: 'Nested Tabs',
  component: NestedTabs,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'NestedTabs renders one or two connected icon-only Levels beside a caller-owned ContentPanel; with one Level its items connect straight to the panel. The caller owns path and navigation state. Link Items navigate, so each Level is a named navigation of links; when every Item is a button that switches content in place, each Level is a vertical tablist and the ContentPanel their tabpanel, where the arrow keys move focus and Enter or Space opens a tab.',
      },
    },
  },
});

const TAB_ROOTS = [
  { key: ROOT_ONE, label: 'Root tab A', icon: <Triangle /> },
  { key: ROOT_TWO, label: 'Root tab B', icon: <Hexagon /> },
  { key: ROOT_THREE, label: 'Root tab C', icon: <Square /> },
] as const;

const TAB_NESTED = [
  { key: NESTED_ONE, label: 'Nested tab A', icon: <FileText /> },
  { key: NESTED_TWO, label: 'Nested tab B', icon: <SlidersHorizontal /> },
  { key: NESTED_THREE, label: 'Nested tab C', icon: <Settings2 /> },
] as const;

/* Button items switch the panel in place, so the levels are tablists; the panel says which tab it holds. */
function TabsFixture() {
  const [activePath, setActivePath] = useState<NestedTabsPath>([ROOT_TWO, NESTED_ONE]);
  const root = activePath[0] ?? ROOT_ONE;
  const nested = TAB_NESTED.find((tab) => tab.key === activePath[1]) ?? TAB_NESTED[0];
  return (
    <NestedTabs activePath={activePath} ariaLabel="Tabbed controls">
      <NestedTabs.Level label="Root level">
        {TAB_ROOTS.map((tab) => (
          <NestedTabs.Item
            key={tab.key}
            as="button"
            type="button"
            path={[tab.key]}
            label={tab.label}
            icon={tab.icon}
            onClick={() => setActivePath([tab.key, NESTED_ONE])}
          />
        ))}
      </NestedTabs.Level>
      <NestedTabs.Level label="Nested Level">
        {TAB_NESTED.map((tab) => (
          <NestedTabs.Item
            key={tab.key}
            as="button"
            type="button"
            path={[root, tab.key]}
            label={tab.label}
            icon={tab.icon}
            onClick={() => setActivePath([root, tab.key])}
          />
        ))}
      </NestedTabs.Level>
      <NestedTabs.ContentPanel>
        <p>{nested.label} content</p>
        <PanelFixture />
      </NestedTabs.ContentPanel>
    </NestedTabs>
  );
}

/**
 * Button items: each Level is a vertical tablist and the panel is their tabpanel.
 * Tab enters a Level at its selected tab, Up, Down, Home and End move between its tabs, and Enter or Space opens the focused one.
 */
export const Tabs = meta.story({
  render: () => (
    <main className={styles.stage}>
      <TabsFixture />
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('navigation')).not.toBeInTheDocument();
    const rootList = canvas.getByRole('tablist', { name: 'Root level' });
    const nestedList = canvas.getByRole('tablist', { name: 'Nested Level' });
    await expect(rootList).toHaveAttribute('aria-orientation', 'vertical');
    const rootTabA = within(rootList).getByRole('tab', { name: 'Root tab A' });
    const rootTabB = within(rootList).getByRole('tab', { name: 'Root tab B' });
    const rootTabC = within(rootList).getByRole('tab', { name: 'Root tab C' });
    const nestedTabA = within(nestedList).getByRole('tab', { name: 'Nested tab A' });
    await expect(rootTabB).toHaveAttribute('aria-selected', 'true');
    await expect(nestedTabA).toHaveAttribute('aria-selected', 'true');
    await expect(rootTabA).toHaveAttribute('aria-selected', 'false');
    const panel = canvas.getByRole('tabpanel', { name: 'Nested tab A' });
    await expect(nestedTabA).toHaveAttribute('aria-controls', panel.id);

    /* One Tab stop per Level: its selected tab. */
    rootTabB.focus();
    await userEvent.tab();
    await expect(nestedTabA).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect(rootTabB).toHaveFocus();

    /* The stop follows focus inside a list, so Home then Tab leaves the rail; coming back lands on the selected tab again. */
    await userEvent.keyboard('{Home}');
    await expect(rootTabA).toHaveFocus();
    await userEvent.tab();
    await expect(nestedTabA).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect(rootTabB).toHaveFocus();

    /* The arrows move focus and wrap without opening anything; Enter opens. */
    await userEvent.keyboard('{ArrowDown}');
    await expect(rootTabC).toHaveFocus();
    await expect(rootTabB).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowDown}');
    await expect(rootTabA).toHaveFocus();
    await userEvent.keyboard('{End}');
    await expect(rootTabC).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(rootTabC).toHaveAttribute('aria-selected', 'true');
    await expect(rootTabC).toHaveAttribute('tabindex', '0');
    await expect(rootTabB).toHaveAttribute('tabindex', '-1');

    within(nestedList).getByRole('tab', { name: 'Nested tab A' }).focus();
    await userEvent.keyboard('{ArrowUp}');
    await expect(within(nestedList).getByRole('tab', { name: 'Nested tab C' })).toHaveFocus();
    await userEvent.keyboard(' ');
    await waitFor(() =>
      expect(canvas.getByRole('tabpanel', { name: 'Nested tab C' })).toHaveTextContent('Nested tab C content')
    );
  },
});

function GuidanceFixture() {
  const [activePath, setActivePath] = useState<NestedTabsPath>([ROOT_ONE]);
  return (
    <NestedTabs activePath={activePath} ariaLabel="Guided controls">
      <NestedTabs.Level label="Controls">
        <NestedTabs.Item
          as="button"
          type="button"
          path={[ROOT_ONE]}
          label="Spice"
          description="Your private spice reserve."
          help="Only you see this balance. Withdraw onto the table."
          icon={<Hexagon />}
          onClick={() => setActivePath([ROOT_ONE])}
        />
        <NestedTabs.Item
          as="button"
          type="button"
          path={[ROOT_TWO]}
          label="Log"
          icon={<List />}
          onClick={() => setActivePath([ROOT_TWO])}
        />
      </NestedTabs.Level>
      <NestedTabs.ContentPanel>
        <PanelFixture />
      </NestedTabs.ContentPanel>
    </NestedTabs>
  );
}

/**
 * A tab can say what it is for: hovering shows its name over a one-line description, and resting on it for 1.8 seconds swaps in its full help.
 * Assistive technology reads both as the tab's description.
 */
export const TabGuidance = meta.story({
  render: () => (
    <main className={styles.stage}>
      <GuidanceFixture />
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const storyDocument = within(canvasElement.ownerDocument.body);
    const spice = canvas.getByRole('tab', { name: 'Spice' });
    await expect(spice).toHaveAccessibleDescription(
      'Your private spice reserve. Only you see this balance. Withdraw onto the table.'
    );
    await expect(canvas.getByRole('tab', { name: 'Log' })).not.toHaveAttribute('aria-describedby');
    await userEvent.hover(spice);
    await waitForFrame(() =>
      expect(storyDocument.getByRole('tooltip')).toHaveTextContent('SpiceYour private spice reserve.')
    );
    await waitForFrame(() =>
      expect(storyDocument.getByRole('tooltip')).toHaveTextContent(
        'SpiceOnly you see this balance. Withdraw onto the table.'
      )
    );
    await userEvent.unhover(spice);
    await waitForFrame(() => expect(storyDocument.queryByRole('tooltip')).not.toBeInTheDocument());
    /* Escape dismisses the tooltip wherever focus is, and leaves focus there. */
    const log = canvas.getByRole('tab', { name: 'Log' });
    log.focus();
    await userEvent.hover(spice);
    await waitForFrame(() =>
      expect(storyDocument.getAllByRole('tooltip').some((tip) => tip.textContent?.startsWith('Spice'))).toBe(true)
    );
    await userEvent.keyboard('{Escape}');
    await waitForFrame(() => expect(storyDocument.queryAllByRole('tooltip')).toHaveLength(0));
    await expect(log).toHaveFocus();
    await userEvent.unhover(spice);
    /* Keyboard focus that lands on a hovered tab keeps its guidance once the pointer leaves. */
    await userEvent.hover(spice);
    spice.focus();
    await userEvent.unhover(spice);
    await waitForFrame(() =>
      expect(storyDocument.getAllByRole('tooltip').some((tip) => tip.textContent?.startsWith('Spice'))).toBe(true)
    );
    spice.blur();
    await waitForFrame(() => expect(storyDocument.queryAllByRole('tooltip')).toHaveLength(0));
  },
});
