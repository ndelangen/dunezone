import preview from '@sb/preview';

import { InteractiveEditor } from './StormCardEditor.stories.fixture';

const meta = preview.meta({
  title: 'Storm Card Editor',
  component: InteractiveEditor,
  parameters: { layout: 'padded' },
});
export const One = meta.story({});
