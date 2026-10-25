import { TextInput } from '@mantine/core';
import preview from '@sb/preview';
import { publishingSpiceCard } from '@shared/assets/fixtures/publishingSpiceCard';
import { spiceBoardLink } from '@shared/assets/fixtures/spiceBoardCard';
import { SpiceAsset } from '@shared/assets/schema';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { INITIAL_SPICE_DRAFT, SpiceCardEditor, spiceDraftWarnings } from './SpiceCardEditor';
import type { SpiceDraft } from './SpiceCardEditor';
import {
  pickOne,
  boardSelect,
  LiveEditor,
  proofOf,
  territoryOnScreen,
  onBoard,
} from './SpiceCardEditor.stories.fixture';

const meta = preview.meta({
  title: 'Spice Card Editor',
  component: SpiceCardEditor,
  parameters: { layout: 'padded' },
  /* The page's workbench frame gives the editor its reading column; without it the proof and the chapters collapse to their content. */
  render: (args) => (
    <WorkbenchLayout>
      <SpiceCardEditor {...args} />
    </WorkbenchLayout>
  ),
  args: {
    nameField: <TextInput aria-label="Name" readOnly value="Arsunt" />,
    draft: publishingSpiceCard,
    patch: fn(),
    chapter: 'identity' as const,
    onChapterChange: fn(),
    onSettle: fn(),
    boardSelect,
    tokenPicker: pickOne('Pick the spice token', 'spice-token'),
  },
});

/** Icon placement controls update the saved draft and the live card together. */
export const IconPlacement = meta.story({
  render: (args) => (
    <LiveEditor {...args} initial={SpiceAsset.parse({ ...publishingSpiceCard, iconScale: 1, iconOffset: [7, 0] })} />
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const scale = canvas.getByRole('slider', { name: 'Icon scale slider' });
    scale.focus();
    await userEvent.keyboard('{End}');
    await expect(args.patch).toHaveBeenLastCalledWith({ iconScale: 2 });
    const vertical = canvas.getByRole('slider', { name: 'Vertical icon offset slider' });
    vertical.focus();
    await userEvent.keyboard('{End}');
    await expect(args.patch).toHaveBeenLastCalledWith({ iconOffset: [7, 60] });
    const icon = canvasElement.querySelector<HTMLImageElement>(
      '[class*="proofFrame"] img[src="/vector/icon/spice.svg"]'
    )!;
    await expect(getComputedStyle(icon).width).toBe('170px');
    await expect(icon.style.marginTop).toBe('120px');
  },
});

/** A fresh card warns about its missing name and territory rather than refusing to draw. */
export const Blank = meta.story({
  args: { draft: INITIAL_SPICE_DRAFT, nameField: <TextInput aria-label="Name" readOnly value="" /> },
  play: async () => {
    await expect(spiceDraftWarnings(INITIAL_SPICE_DRAFT).map(({ missing }) => missing)).toEqual([
      'a name',
      'a highlighted territory',
    ]);
  },
});

const onStrongholds: SpiceDraft = {
  ...onBoard,
  board: {
    ...spiceBoardLink,
    tints: [{ id: 'highlights', name: 'Strongholds', color: '#9e5f00', territories: [], types: ['stronghold'] }],
  },
};

/** A tint carried over from a classic card's region covers a territory type; the brush can still take one of its territories away. */
export const CarriedRegion = meta.story({
  args: { chapter: 'map' as const, draft: onStrongholds },
  render: (args) => <LiveEditor {...args} initial={onStrongholds} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const covered = () => proofOf(canvasElement).querySelectorAll('[data-tint="highlights"] > g');
    await expect(covered()).toHaveLength(5);
    await userEvent.click(canvas.getByRole('button', { name: 'Paint Strongholds' }));
    const { x, y } = territoryOnScreen(canvasElement, 'arrakeen');
    const surface = canvasElement.querySelector('[data-brush]')!;
    await userEvent.pointer({ keys: '[MouseLeft]', target: surface, coords: { clientX: x, clientY: y } });
    await waitFor(() => expect(covered()).toHaveLength(4));
    const tint = (args.patch as ReturnType<typeof fn>).mock.lastCall![0].board.tints[0];
    await expect(tint.types).toBeUndefined();
    await expect(tint.territories).not.toContain('arrakeen');
  },
});
