import preview from '@sb/preview';
import { Link } from '@tanstack/react-router';

import { CallToAction } from './CallToAction';

const toFactionCreate = (rootProps: Record<string, unknown>) => <Link {...rootProps} to="/factions/create" />;

const meta = preview.meta({
  component: CallToAction,
  parameters: { layout: 'centered' },
  args: {
    children: 'Create your own faction',
    renderRoot: toFactionCreate,
  },
});

/** Creating something new: a leading plus. */
export const Start = meta.story({});

/** Continuing a journey already begun: a trailing arrow. */
export const Forward = meta.story({
  args: { direction: 'forward', children: 'Start creating' },
});

/** A jump to a part of this same page, on the sandy header art: the artwork tone and a downward arrow, as the homepage's sneak peek. */
export const DownOnArtwork = meta.story({
  args: {
    direction: 'down',
    tone: 'artwork',
    children: 'Take a sneak peek',
    /* The meta's router link gives way to a plain hash anchor. */
    renderRoot: undefined,
    href: '#play-preview',
  },
});

/** The compact size. The icon scales down with the button. */
export const Small = meta.story({
  args: { size: 'sm' },
});

/** Long labels keep the icon pinned to the edge rather than centring with the text. */
export const LongLabel = meta.story({
  args: { children: 'Create a faction nobody has seen before' },
  parameters: { layout: 'padded' },
  globals: { viewport: { value: 'contentNarrow' } },
});

/** Not open yet: disabled, but hovering still says why, and it leads nowhere. */
export const Disabled = meta.story({
  args: { disabledReason: 'You’ll create a faction in a later step' },
});

/** A journey that starts by sending its form, Create game, while the form is on its way: the plus gives way to a spinner. */
export const SubmitBusy = meta.story({
  args: { renderRoot: undefined, submit: true, busy: true, children: 'Create game', size: 'lg' },
});
