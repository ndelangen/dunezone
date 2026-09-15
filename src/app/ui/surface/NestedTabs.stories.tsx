import preview from '@sb/preview';
import { NestedTabs } from '@ui/surface';
import type { NestedTabsPath } from '@ui/surface';
import {
  Circle,
  FileText,
  Hexagon,
  Image,
  List,
  Rows3,
  Settings2,
  SlidersHorizontal,
  Square,
  Triangle,
  Type,
} from 'lucide-react';
import { useState } from 'react';
import type { Key, MouseEvent, ReactNode } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import styles from './NestedTabs.stories.module.css';
import { SurfaceFiller } from './SurfaceFiller.stories.fixture';

const ROOT_ONE = 'r-a7';
const ROOT_TWO = 'r-k4';
const ROOT_THREE = 'r-r9';

const NESTED_ONE = 'n-m2';
const NESTED_TWO = 'n-n3';
const NESTED_THREE = 'n-t8';
const GROUPED_ONE = 'g-h2';
const GROUPED_TWO = 'g-q5';
const GROUPED_THREE = 'g-w7';

interface PathItemProps {
  key?: Key;
  path: NestedTabsPath;
  label: string;
  icon: ReactNode;
  onNavigate: (path: NestedTabsPath) => void;
}

function pathItem({ key, path, label, icon, onNavigate }: PathItemProps) {
  return (
    <NestedTabs.Item
      key={key}
      as="a"
      href={`#${path.join('/')}`}
      path={path}
      label={label}
      icon={icon}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        onNavigate(path.length === 1 ? [path[0] ?? ROOT_ONE, NESTED_ONE] : path);
      }}
    />
  );
}

function rootLevel({ onNavigate }: { onNavigate: PathItemProps['onNavigate'] }) {
  return (
    <NestedTabs.Level label="Root level">
      {pathItem({ path: [ROOT_ONE], label: 'Root item A', icon: <Triangle />, onNavigate })}
      {pathItem({ path: [ROOT_TWO], label: 'Root item B', icon: <Hexagon />, onNavigate })}
      {pathItem({ path: [ROOT_THREE], label: 'Root item C', icon: <Square />, onNavigate })}
      <NestedTabs.Tools>
        <SurfaceFiller height={24} width={24} />
      </NestedTabs.Tools>
    </NestedTabs.Level>
  );
}

function nestedLevel({ onNavigate }: { onNavigate: PathItemProps['onNavigate'] }) {
  return (
    <NestedTabs.Level label="Nested Level">
      {pathItem({ path: [ROOT_TWO, NESTED_ONE], label: 'Nested item A', icon: <FileText />, onNavigate })}
      {pathItem({
        path: [ROOT_TWO, NESTED_TWO],
        label: 'Nested item B',
        icon: <SlidersHorizontal />,
        onNavigate,
      })}
      {pathItem({
        path: [ROOT_TWO, NESTED_THREE],
        label: 'Nested item C',
        icon: <Settings2 />,
        onNavigate,
      })}
      <NestedTabs.Group label="Group A" icon={<Rows3 />}>
        {pathItem({
          path: [ROOT_TWO, GROUPED_ONE],
          label: 'Grouped item A',
          icon: <Type />,
          onNavigate,
        })}
        {pathItem({
          path: [ROOT_TWO, GROUPED_TWO],
          label: 'Grouped item B',
          icon: <Image />,
          onNavigate,
        })}
      </NestedTabs.Group>
      <NestedTabs.Group label="Group B" icon={<List />}>
        {pathItem({
          path: [ROOT_TWO, GROUPED_THREE],
          label: 'Grouped item C',
          icon: <List />,
          onNavigate,
        })}
      </NestedTabs.Group>
    </NestedTabs.Level>
  );
}

function PanelFixture() {
  return <SurfaceFiller height={420} />;
}

function HierarchyFixture({ initialPath, tools = true }: { initialPath: NestedTabsPath; tools?: boolean }) {
  const [activePath, setActivePath] = useState<NestedTabsPath>(initialPath);
  return (
    <NestedTabs activePath={activePath} ariaLabel="Nested navigation">
      {tools ? (
        rootLevel({ onNavigate: setActivePath })
      ) : (
        <NestedTabs.Level label="Root level">
          {pathItem({ path: [ROOT_ONE], label: 'Root item A', icon: <Triangle />, onNavigate: setActivePath })}
          {pathItem({ path: [ROOT_TWO], label: 'Root item B', icon: <Hexagon />, onNavigate: setActivePath })}
          {pathItem({ path: [ROOT_THREE], label: 'Root item C', icon: <Square />, onNavigate: setActivePath })}
        </NestedTabs.Level>
      )}
      {nestedLevel({ onNavigate: setActivePath })}
      <NestedTabs.ContentPanel aria-label="Example content">
        <PanelFixture />
      </NestedTabs.ContentPanel>
    </NestedTabs>
  );
}

const meta = preview.meta({
  title: 'Nested Tabs',
  component: NestedTabs,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'NestedTabs renders one or two connected icon-only navigation Levels beside a caller-owned ContentPanel; with one Level its items connect straight to the panel. The caller owns path and navigation state; Items remain semantic links.',
      },
    },
  },
});

export const NestedItemActive = meta.story({
  render: () => (
    <main className={styles.stage}>
      <HierarchyFixture initialPath={[ROOT_TWO, NESTED_ONE]} />
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const storyDocument = within(canvasElement.ownerDocument.body);
    const levels = canvas.getAllByRole('navigation');
    const rootItemB = canvas.getByRole('link', { name: 'Root item B' });
    await expect(rootItemB).toHaveAttribute('data-path-state', 'ancestor');
    await expect(canvas.getByRole('link', { name: 'Nested item A' })).toHaveAttribute('aria-current', 'page');
    await expect(canvas.queryByRole('tab')).not.toBeInTheDocument();
    for (const level of levels) {
      const items = level.querySelector(':scope > ul');
      await expect(items).not.toBeNull();
      await expect(getComputedStyle(items as HTMLElement).overflowX).toBe('hidden');
    }
    await userEvent.hover(rootItemB);
    await waitFor(() => expect(storyDocument.getByRole('tooltip')).toHaveTextContent('Root item B'));
    levels[0]?.querySelector(':scope > ul')?.dispatchEvent(new Event('scroll'));
    await waitFor(() => expect(storyDocument.queryByRole('tooltip')).not.toBeInTheDocument());
    await new Promise<void>((resolve) => window.setTimeout(resolve, 700));
    await expect(storyDocument.queryByRole('tooltip')).not.toBeInTheDocument();
  },
});

export const GroupedItemActive = meta.story({
  render: () => (
    <main className={styles.stage}>
      <HierarchyFixture initialPath={[ROOT_TWO, GROUPED_TWO]} />
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Grouped item B' })).toHaveAttribute('aria-current', 'page');
    await expect(canvas.getByRole('list', { name: 'Group A' }).parentElement).toHaveAttribute(
      'data-contains-active-item',
      'true'
    );
  },
});

function ManyRootItemsFixture() {
  const [activePath, setActivePath] = useState<NestedTabsPath>(['root-19', NESTED_ONE]);
  const activeRoot = activePath[0] ?? 'root-19';
  return (
    <NestedTabs activePath={activePath} ariaLabel="Nested navigation with many root items">
      <NestedTabs.Level label="Root level">
        {Array.from({ length: 20 }, (_, index) => {
          const id = `root-${index + 1}`;
          return pathItem({
            key: id,
            path: [id],
            label: `Root item ${index + 1}`,
            icon: index % 3 === 0 ? <Circle /> : index % 3 === 1 ? <Triangle /> : <Hexagon />,
            onNavigate: setActivePath,
          });
        })}
        <NestedTabs.Tools>
          <SurfaceFiller height={24} width={24} />
        </NestedTabs.Tools>
      </NestedTabs.Level>
      <NestedTabs.Level label="Nested Level">
        {pathItem({
          path: [activeRoot, NESTED_ONE],
          label: 'Nested item A',
          icon: <FileText />,
          onNavigate: setActivePath,
        })}
        {pathItem({
          path: [activeRoot, NESTED_TWO],
          label: 'Nested item B',
          icon: <SlidersHorizontal />,
          onNavigate: setActivePath,
        })}
        {pathItem({
          path: [activeRoot, NESTED_THREE],
          label: 'Nested item C',
          icon: <Settings2 />,
          onNavigate: setActivePath,
        })}
      </NestedTabs.Level>
      <NestedTabs.ContentPanel aria-label="Example content">
        <PanelFixture />
      </NestedTabs.ContentPanel>
    </NestedTabs>
  );
}

export const ManyRootItems = meta.story({
  render: () => (
    <main className={styles.stage}>
      <ManyRootItemsFixture />
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rootLevel = canvas.getByRole('navigation', { name: 'Root level' });
    const rootItems = rootLevel.querySelector('ul');
    await expect(rootLevel.querySelectorAll('[data-nested-tabs-item]')).toHaveLength(20);
    await expect(rootItems).not.toBeNull();
    await expect(rootItems?.scrollHeight).toBeGreaterThan(rootItems?.clientHeight ?? 0);
    await expect(rootItems?.scrollTop).toBeGreaterThan(0);
    await userEvent.click(canvas.getByRole('link', { name: 'Root item 20' }));
    await expect(canvas.getByRole('link', { name: 'Root item 20' })).toHaveAttribute('data-path-state', 'ancestor');
    await expect(canvas.getByRole('link', { name: 'Nested item A' })).toHaveAttribute('aria-current', 'page');
    await expect(rootItems).toHaveAttribute('data-scroll-before');
    await expect(rootItems).not.toHaveAttribute('data-scroll-after');
  },
});

export const NarrowContainer = meta.story({
  globals: { viewport: { value: 'appMobile' } },
  render: () => (
    <main className={styles.stage}>
      <HierarchyFixture initialPath={[ROOT_TWO, GROUPED_THREE]} />
    </main>
  ),
});

function SingleLevelFixture({ initialPath }: { initialPath: NestedTabsPath }) {
  const [activePath, setActivePath] = useState<NestedTabsPath>(initialPath);
  const navigate = (path: NestedTabsPath) => setActivePath(path);
  return (
    <NestedTabs activePath={activePath} ariaLabel="Single-level navigation">
      <NestedTabs.Level label="Sections">
        <NestedTabs.Item
          as="a"
          href={`#${ROOT_ONE}`}
          path={[ROOT_ONE]}
          label="Section A"
          icon={<Triangle />}
          onClick={(event: MouseEvent<HTMLAnchorElement>) => {
            event.preventDefault();
            navigate([ROOT_ONE]);
          }}
        />
        <NestedTabs.Item
          as="a"
          href={`#${ROOT_TWO}`}
          path={[ROOT_TWO]}
          label="Section B"
          icon={<Hexagon />}
          onClick={(event: MouseEvent<HTMLAnchorElement>) => {
            event.preventDefault();
            navigate([ROOT_TWO]);
          }}
        />
        <NestedTabs.Item
          as="a"
          href={`#${ROOT_THREE}`}
          path={[ROOT_THREE]}
          label="Section C"
          icon={<Square />}
          onClick={(event: MouseEvent<HTMLAnchorElement>) => {
            event.preventDefault();
            navigate([ROOT_THREE]);
          }}
        />
      </NestedTabs.Level>
      <NestedTabs.ContentPanel aria-label="Section content">
        <PanelFixture />
      </NestedTabs.ContentPanel>
    </NestedTabs>
  );
}

/** One Level: the active item's contour runs straight into the content panel, with no second rail between them. */
export const SingleLevel = meta.story({
  render: () => (
    <main className={styles.stage}>
      <SingleLevelFixture initialPath={[ROOT_TWO]} />
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('navigation')).toHaveLength(1);
    await expect(canvas.getByRole('link', { name: 'Section B' })).toHaveAttribute('aria-current', 'page');
    await expect(canvasElement.querySelectorAll('[data-nested-tabs-surface]')).toHaveLength(1);
    await waitFor(() => expect(canvasElement.querySelector('[data-nested-tabs-surface="panel"] path')).not.toBeNull());
    const rail = canvas.getByRole('navigation').getBoundingClientRect();
    const panel = canvas.getByRole('region', { name: 'Section content' }).getBoundingClientRect();
    const host = canvas.getByRole('complementary', { name: 'Single-level navigation' }).getBoundingClientRect();
    /* The panel starts where the rail ends and runs to the host's edge: no empty second column between or after. */
    await expect(Math.round(panel.left)).toBe(Math.round(rail.right));
    await expect(Math.round(panel.right)).toBe(Math.round(host.right));
    await userEvent.click(canvas.getByRole('link', { name: 'Section C' }));
    await expect(canvas.getByRole('link', { name: 'Section C' })).toHaveAttribute('aria-current', 'page');
    await expect(canvas.getByRole('link', { name: 'Section B' })).toHaveAttribute('data-path-state', 'inactive');
  },
});

export const LevelWithoutTools = meta.story({
  render: () => (
    <main className={styles.stage}>
      <HierarchyFixture initialPath={[ROOT_TWO, NESTED_ONE]} tools={false} />
    </main>
  ),
});
