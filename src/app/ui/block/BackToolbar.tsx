import { IconAction } from '@ui/control/IconAction';
import type { RenderRoot } from '@ui/renderRoot';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * A toolbar whose one action is the way back: on a page with no band, such as a create form, and on pages that lead back to one parent.
 * The band is collapsed on these pages (Norbert, 2026-11-08), so the breadcrumb above the title cannot be seen there;
 * the back arrow in this toolbar is the way up instead.
 * Render it inside `PageLayout.Toolbar`.
 * A page whose toolbar has more to offer (a gallery's search, say) passes it as `center`, so the way back stays one spelling.
 * `right` takes the actions on the far edge.
 */
export function BackToolbar({
  label,
  renderRoot,
  center,
  right,
}: Readonly<{ label: string; renderRoot: RenderRoot; center?: ReactNode; right?: ReactNode }>) {
  return (
    <Toolbar>
      <Toolbar.Left label="Navigation">
        <IconAction
          label={label}
          emphasis="standard"
          intent="neutral"
          size="lg"
          renderRoot={renderRoot}
          icon={<ArrowLeft size={17} aria-hidden />}
        />
      </Toolbar.Left>
      {center === undefined ? null : <Toolbar.Center>{center}</Toolbar.Center>}
      {right ?? null}
    </Toolbar>
  );
}
