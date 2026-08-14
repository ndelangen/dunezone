import preview from '@sb/preview';

import { HeroTitle } from './HeroTitle';

const meta = preview.meta({
  component: HeroTitle,
  parameters: { layout: 'padded' },
  args: {
    children: 'Make Dune your own',
  },
});

/** The shields' Desdemona face, uppercase like the shields set it, fluid against the viewport. */
export const Default = meta.story({});

/** Long names wrap balanced rather than leaving a one-word last line. */
export const LongTitleWraps = meta.story({
  args: { children: 'A game of conquest, diplomacy and betrayal on Arrakis' },
});
