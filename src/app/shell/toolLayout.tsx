import { Outlet } from '@tanstack/react-router';

import { MOTION_BEFORE_HYDRATION } from './motionScript';
import { ToolChrome } from './ToolChrome';

/**
 * The options of the `_tool` layout route, `src/app/routes/_tool/route.tsx`.
 * Each built tool lives below it at `_tool/tools/<slug>/route.tsx`, so `/tools/<slug>` renders without the app's header, navigation or footer (Norbert, 2026-11-09).
 * The catalogue at /tools and the placeholders of tools not yet built stay in the app, under `_app/tools`.
 * Server-rendered, so crawlers and the first paint get the tool's frame and its head, and a tool's game state starts in the browser.
 */
export const TOOL_LAYOUT = {
  ssr: true,
  head: () => ({ scripts: [MOTION_BEFORE_HYDRATION] }),
  component: ToolLayout,
} as const;

function ToolLayout() {
  return (
    <ToolChrome>
      <Outlet />
    </ToolChrome>
  );
}
