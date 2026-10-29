import preview from '@sb/preview';
import { publishingCustomCard } from '@shared/assets/fixtures/publishingCustomCard';

import { InteractiveEditor } from './CustomCardEditor.stories.fixture';

const meta = preview.meta({
  parameters: { layout: 'padded' },
  title: 'Custom Card Editor',
  component: InteractiveEditor,
  args: { preset: 'treachery' },
});
export const Treachery = meta.story({});
export const Layered = meta.story({
  args: { preset: 'full-text', name: publishingCustomCard.name, layers: publishingCustomCard.layers },
});
export const Blank = meta.story({ args: { preset: 'blank-plain' } });
export const LongTitle = meta.story({ args: { name: 'A very long custom card title that must stay inside the Head' } });
