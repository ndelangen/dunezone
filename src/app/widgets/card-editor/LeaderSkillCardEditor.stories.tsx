import preview from '@sb/preview';
import { GF9_LEADER_SKILLS } from '@shared/assets/gf9LeaderSkills';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { expect, fn, within } from 'storybook/test';

import { LeaderSkillCardEditor, INITIAL_LEADER_SKILL_MEMORY } from './LeaderSkillCardEditor';

const meta = preview.meta({
  component: LeaderSkillCardEditor,
  parameters: { layout: 'padded' },
  globals: { colorScheme: 'dark' },
  render: (args) => (
    <WorkbenchLayout>
      <LeaderSkillCardEditor {...args} />
    </WorkbenchLayout>
  ),
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
export const Head = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText('Head background')).toBeNull();
    await expect(canvas.getByRole('textbox', { name: 'Type' })).toHaveAttribute('readonly');
    await expect(canvas.getByRole('textbox', { name: 'Type' })).toHaveValue('Leader skill');
  },
});

export const Artwork = meta.story({ args: { chapter: 'decals' as const } });
export const Abilities = meta.story({
  args: { chapter: 'abilities' as const },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('spinbutton', { name: 'Text size' })).toBeNull();
    await expect(canvas.getByRole('textbox', { name: 'General ability' })).toBeVisible();
  },
});
export const About = meta.story({ args: { chapter: 'about' as const } });
