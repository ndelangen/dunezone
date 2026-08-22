import preview from '@sb/preview';
import {
  CheckCircle2,
  CircleHelp,
  Coins,
  FileText,
  Layers3,
  MessageCircleReply,
  Shield,
  Swords,
  UsersRound,
} from 'lucide-react';

import { Stats } from './Stats';

const RULESET_STATS = [
  { key: 'factions', icon: <Layers3 size={17} aria-hidden />, value: 3, label: '3 factions' },
  {
    key: 'questions',
    icon: <CircleHelp size={17} aria-hidden />,
    value: 12,
    label: '12 questions',
  },
  {
    key: 'answered',
    icon: <CheckCircle2 size={17} aria-hidden />,
    value: 9,
    label: '9 answered questions',
  },
];

const PROFILE_STATS = [
  {
    key: 'factions',
    icon: <Shield size={18} aria-hidden />,
    value: 3,
    name: 'Factions',
    label: '3 factions',
  },
  {
    key: 'groups',
    icon: <UsersRound size={18} aria-hidden />,
    value: 2,
    name: 'Groups',
    label: '2 groups',
  },
  {
    key: 'answers',
    icon: <MessageCircleReply size={18} aria-hidden />,
    value: 24,
    name: 'Answers',
    label: '24 answers',
  },
  {
    key: 'picked',
    icon: <CheckCircle2 size={18} aria-hidden />,
    value: 7,
    name: 'Picked answers',
    label: '7 picked answers',
  },
];

const meta = preview.meta({
  component: Stats,
  parameters: { layout: 'padded' },
  args: { items: RULESET_STATS },
});

/** The compact shape. Hover any stat to see the phrase the number stands for. */
export const Row = meta.story({});

/** The labelled shape, for a sidebar panel with room to spell each fact out. */
export const Column = meta.story({
  args: { orientation: 'column', items: PROFILE_STATS },
});

export const SingleStat = meta.story({
  args: { items: [RULESET_STATS[0]!] },
});

/** Not every fact is a count: an unset version renders as an em dash. */
export const NonNumericValue = meta.story({
  args: {
    items: [
      ...RULESET_STATS,
      {
        key: 'version',
        icon: <FileText size={17} aria-hidden />,
        value: '—',
        label: 'Version not specified',
      },
    ],
  },
});

/** A row wraps rather than overflowing once the strip runs out of width. */
export const RowWraps = meta.story({
  args: {
    items: [
      ...RULESET_STATS,
      { key: 'spice', icon: <Coins size={17} aria-hidden />, value: 5, label: '5 spice' },
      { key: 'troops', icon: <Swords size={17} aria-hidden />, value: 20, label: '20 troops' },
    ],
  },
  globals: { viewport: { value: 'contentNarrow' } },
});

/** Long labels keep their own column and wrap instead of pushing the number around. */
export const LongLabelsInColumn = meta.story({
  args: {
    orientation: 'column',
    items: [
      {
        key: 'picked',
        icon: <CheckCircle2 size={18} aria-hidden />,
        value: 7,
        name: 'Answers picked by the person who asked',
        label: '7 picked answers',
      },
      ...PROFILE_STATS.slice(0, 2),
    ],
  },
  globals: { viewport: { value: 'contentNarrow' } },
});
