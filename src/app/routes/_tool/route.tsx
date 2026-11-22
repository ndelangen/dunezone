import { createFileRoute } from '@tanstack/react-router';

import { TOOL_LAYOUT } from '@app/shell/toolLayout';

export const Route = createFileRoute('/_tool')(TOOL_LAYOUT);
