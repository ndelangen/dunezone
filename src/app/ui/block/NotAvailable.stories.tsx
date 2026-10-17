import preview from '@sb/preview';

import { NotAvailable } from './NotAvailable';

const meta = preview.meta({
  component: NotAvailable,
  parameters: { layout: 'padded' },
  args: { title: 'Ruleset not found', children: 'This ruleset does not exist or was deleted.' },
});

/** The thing is not there. The page deliberately does not distinguish "never existed" from "deleted", so a deleted row leaks nothing by its absence. */
export const Absent = meta.story({});
