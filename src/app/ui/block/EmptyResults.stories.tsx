import preview from '@sb/preview';
import { Link } from '@tanstack/react-router';
import { RotateCcw } from 'lucide-react';

import { LabeledAction } from '../control/LabeledAction';
import { Surface } from '../surface';
import { EmptyResults, PastTheEnd } from './EmptyResults';

const meta = preview.meta({
  component: EmptyResults,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <Surface padding="xl">
        <Story />
      </Surface>
    ),
  ],
  args: { title: 'Nothing matches', children: 'No ruleset matches this search.' },
});

/** A search that matched nothing among everything it checked. */
export const NothingMatches = meta.story({});

/** A capped search: it stopped before checking everything, so another word may still find one. */
export const Capped = meta.story({ args: { capped: true } });

/** With the way on, as the faction catalogue offers it while filters are set. */
export const WithAction = meta.story({
  args: {
    children: 'No faction matches this search and these filters.',
    action: (
      <LabeledAction icon={<RotateCcw size={16} />} onClick={() => {}}>
        Reset filters and search
      </LabeledAction>
    ),
  },
});

/** A page number past the end of a list that has several pages. */
export const PastTheLastPage = meta.story({
  render: () => (
    <PastTheEnd
      pageCount={4}
      noun="factions"
      pageLinkProps={(page) => ({ component: Link, to: '/factions', search: { page } })}
    />
  ),
});

/** A page number past a list that fits on one page. */
export const PastTheOnlyPage = meta.story({
  render: () => (
    <PastTheEnd pageCount={1} noun="rulesets" pageLinkProps={() => ({ component: Link, to: '/rulesets' })} />
  ),
});
