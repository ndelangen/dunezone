import preview from '@sb/preview';
import { Link } from '@tanstack/react-router';

import { BackToolbar } from './BackToolbar';

const meta = preview.meta({
  component: BackToolbar,
  parameters: { layout: 'padded' },
});

/** A page with no band: its one way back, named after where it leads. */
export const Default = meta.story({
  args: {
    label: 'Back to ClassicRules FAQ',
    renderRoot: (props) => <Link {...props} to="/faq" />,
  },
});
