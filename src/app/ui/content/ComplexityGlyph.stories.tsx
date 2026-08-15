import preview from '@sb/preview';

import { ComplexityGlyph } from './ComplexityGlyph';

const meta = preview.meta({
  component: ComplexityGlyph,
  parameters: { layout: 'centered' },
});

export const Novice = meta.story({ args: { score: 0.1 } });

export const MasterWithValue = meta.story({ args: { score: 0.9, showValue: true } });
