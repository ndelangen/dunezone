import preview from '@sb/preview';
import { GF9_LEADER_SKILLS } from '@shared/assets/gf9LeaderSkills';
import { fn } from 'storybook/test';

import { LeaderSkillCardEditor, INITIAL_LEADER_SKILL_MEMORY } from './LeaderSkillCardEditor';

const meta = preview.meta({
  component: LeaderSkillCardEditor,
  args: {
    nameField: <input aria-label="Name" readOnly value="Planetologist" />,
    draft: GF9_LEADER_SKILLS[5]!,
    patch: fn(),
    memory: INITIAL_LEADER_SKILL_MEMORY,
    remember: fn(),
    chapter: 'head' as const,
    onChapterChange: fn(),
    onSettle: fn(),
    onOverflow: fn(),
  },
});
export const Head = meta.story({});
export const SymbolChapter = meta.story({ name: 'Symbol', args: { chapter: 'icon' as const } });
export const Artwork = meta.story({ args: { chapter: 'decals' as const } });
export const Abilities = meta.story({ args: { chapter: 'abilities' as const } });
export const About = meta.story({ args: { chapter: 'about' as const } });
