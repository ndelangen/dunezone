import preview from '@sb/preview';

import { EditionArtifactLink } from './EditionArtifactLink';

const meta = preview.meta({
  component: EditionArtifactLink,
  parameters: { layout: 'centered' },
  args: { kind: 'html' as const, artifact: { status: 'preparing' as const, href: null } },
});

/** Generation has started and nothing can be opened yet. */
export const Preparing = meta.story({});

/** The permanent file exists, so the words give way to a link that opens it in its own tab. */
export const Ready = meta.story({
  args: { artifact: { status: 'ready' as const, href: '/published/rulebooks/example/editions/2/rulebook.html' } },
});

/** Generation failed; the Edition itself is unaffected, so this stays a status beside it. */
export const Failed = meta.story({
  args: { kind: 'pdf' as const, artifact: { status: 'failed' as const, href: null } },
});
