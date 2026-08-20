import preview from '@sb/preview';

import { LayoutSlotPlaceholder } from './LayoutSlotPlaceholder.stories.fixture';
import { WorkbenchLayout } from './WorkbenchLayout';

const meta = preview.meta({
  component: WorkbenchLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The authoring workbench: a capped reading column, and a two-column region placing chapters beside a sticky artifact rail. The rail narrows in steps with the viewport and leaves entirely below 48em.',
      },
    },
  },
});

/** The capped column alone: toolbar, warnings and editor flow down one centred track. */
export const ReadingColumn = meta.story({
  render: () => (
    <WorkbenchLayout>
      <LayoutSlotPlaceholder name="toolbar" minHeight={56} />
      <LayoutSlotPlaceholder name="editor" minHeight={360} />
    </WorkbenchLayout>
  ),
});

/** Chapters beside the rail, the shape every editor shares. */
export const ChaptersBesideRail = meta.story({
  render: () => (
    <WorkbenchLayout gap="sm">
      <WorkbenchLayout.Workbench>
        <WorkbenchLayout.Chapters>
          <LayoutSlotPlaceholder name="chapters" minHeight={480} />
        </WorkbenchLayout.Chapters>
        <WorkbenchLayout.Rail>
          <LayoutSlotPlaceholder name="rail" minHeight={240} />
        </WorkbenchLayout.Rail>
      </WorkbenchLayout.Workbench>
    </WorkbenchLayout>
  ),
});
