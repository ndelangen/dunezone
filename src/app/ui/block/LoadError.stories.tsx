import preview from '@sb/preview';

import { LoadError } from './LoadError';

const meta = preview.meta({
  component: LoadError,
  parameters: { layout: 'padded' },
  args: { title: 'Faction could not be loaded', children: 'Faction data could not be read.' },
});

/** A page that failed for its own reasons: the caller's sentence, then the error's. */
export const Failed = meta.story({});

/** An error carrying no message of its own still says something rather than showing an empty alert. */
export const FailedWithoutAMessage = meta.story({ args: { children: '' } });

/**
 * The stale-tab case, which is the one the five routes used to swallow.
 * The reason is beside the point here: this tab is running an older bundle than the data it was sent, so the only thing worth offering is the reload.
 */
export const Stale = meta.story({ args: { stale: true } });
