import preview from '@sb/preview';
import { LoadError } from '@ui/block/LoadError';
import { PageState } from '@ui/block/PageState';
import { expect, within } from 'storybook/test';

import { LoginGate } from './LoginGate';
import { PageMessage } from './PageMessage';

const meta = preview.meta({
  component: PageMessage,
  parameters: { layout: 'fullscreen' },
  args: {
    title: 'Faction',
    back: <PageMessage.Back to="/factions">Back to factions</PageMessage.Back>,
    children: (
      <PageState kind="pending" title="Loading faction">
        The faction details are still loading.
      </PageState>
    ),
  },
});

/** Waiting for the route's data. The band carries the name the loaded page will carry, so nothing moves when it arrives. */
export const Loading = meta.story({});

/** The slug resolves to nothing, or to something the reader may not open. */
export const Absent = meta.story({
  args: {
    children: (
      <PageState kind="absent" title="Faction not found">
        This faction does not exist or was deleted.
      </PageState>
    ),
  },
});

/** The load failed for its own reasons. The body brings its own alert colour and live region; the frame is unchanged. */
export const Failed = meta.story({
  args: {
    children: (
      <LoadError title="Faction could not be loaded" stale={false}>
        Faction data could not be read.
      </LoadError>
    ),
  },
});

/** A page that works and is not for this reader yet. The way back is still offered, since signing in is not the only thing they might want to do. */
export const SignedOut = meta.story({
  args: {
    title: 'Create faction',
    size: 'compact',
    children: <LoginGate action="create a faction" />,
  },
});

/** A catalogue at the top of its own branch has nowhere to send anyone back to, so it omits the way back rather than pointing at itself. */
export const NoWayBack = meta.story({
  args: {
    title: 'Factions',
    back: undefined,
    children: (
      <PageState kind="pending" title="Loading factions">
        The faction catalogue is still loading.
      </PageState>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Factions' })).toBeVisible();
    await expect(canvas.queryByRole('link')).toBeNull();
  },
});
