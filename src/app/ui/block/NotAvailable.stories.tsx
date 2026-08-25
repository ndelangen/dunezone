import preview from '@sb/preview';

import { NotAvailable } from './NotAvailable';

const meta = preview.meta({
  component: NotAvailable,
  parameters: { layout: 'padded' },
  args: { title: 'Ruleset not found', children: 'This ruleset does not exist or was deleted.' },
});

/** The thing is not there. The page deliberately does not distinguish "never existed" from "deleted", so a deleted row leaks nothing by its absence. */
export const Absent = meta.story({});

/** The thing is there and is not the reader's. The heading says what they cannot do, the sentence says who can. */
export const NotYours = meta.story({
  args: {
    title: 'You cannot edit this ruleset',
    children: 'Only the ruleset owner or an active member of its group can edit this ruleset.',
  },
});
