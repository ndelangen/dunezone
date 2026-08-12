import preview from '@sb/preview';

import { HexColorPicker } from './HexColorPicker';

const meta = preview.meta({
  component: HexColorPicker,
});

export const SolidHex = meta.story({
  args: {
    pickerId: 'story-hex-picker-swatch',
    textId: 'story-hex-picker-text',
    value: '#c78346',
    onChange: (_next: string) => {},
    pickerAriaLabel: 'Pick background color',
  },
});
