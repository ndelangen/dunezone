import preview from '@sb/preview';
import { Link } from '@tanstack/react-router';

import { Surface } from './Surface';
import { SurfaceFiller } from './SurfaceFiller.stories.fixture';

const meta = preview.meta({
  title: 'Surface',
  component: Surface,
  parameters: { layout: 'padded' },
  args: { children: <SurfaceFiller height={96} /> },
});

/**
 * The bare pane.
 * Note the grid showing through: the infill is translucent and blurred, which is what lets the desert artwork read behind it in the app.
 */
export const Default = meta.story({});

/** For content that needs a gutter — the common case for prose and controls. */
export const PaddingMd = meta.story({
  args: { padding: 'md' },
});

/** A tighter gutter, for toolbars and single-line rows. */
export const PaddingSm = meta.story({
  args: { padding: 'sm' },
});

/** Hover and focus it: lifts and brightens. Only for a pane that is itself the click target. */
export const Interactive = meta.story({
  args: {
    padding: 'sm',
    interactive: true,
    renderRoot: ({ className, children }) => (
      <Link to="/rulesets" className={className}>
        {children}
      </Link>
    ),
  },
});

/** Tall content: the pane grows with it rather than scrolling or clipping. */
export const TallContent = meta.story({
  args: {
    padding: 'md',
    children: <SurfaceFiller height={352} />,
  },
});

/** The pane holds its treatment when squeezed; the radius and border do not scale away. */
export const Narrow = meta.story({
  args: { padding: 'md' },
  globals: { viewport: { value: 'contentNarrow' } },
});
