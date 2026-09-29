import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

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

/** In a toolbar the unready file is the same action, disabled, saying why on hover. */
export const PreparingInAToolbar = meta.story({
  args: { size: 'lg' as const },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const action = page.getByRole('button', { name: 'Open Edition HTML' });
    await expect(action).toHaveAttribute('aria-disabled', 'true');
    await expect(action).toHaveAccessibleDescription('The HTML is still being prepared.');
  },
});

/** A ready file in a toolbar wears the same tile as every other toolbar action. */
export const ReadyInAToolbar = meta.story({
  args: {
    size: 'lg' as const,
    artifact: { status: 'ready' as const, href: '/published/rulebooks/example/editions/2/rulebook.html' },
  },
});
