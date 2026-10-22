import preview from '@sb/preview';
import { GF9_LEADER_SKILLS } from '@shared/assets/gf9LeaderSkills';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { expect, fn, userEvent, within } from 'storybook/test';

import { LeaderSkillCardEditor, INITIAL_LEADER_SKILL_MEMORY } from './LeaderSkillCardEditor';

const meta = preview.meta({
  component: LeaderSkillCardEditor,
  parameters: { layout: 'padded' },
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

/** The decal chapter lists the skill's one decal; adding a row and flipping a switch each patch the draft's decals. */
export const Artwork = meta.story({
  args: { chapter: 'decals' as const },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Decal 1')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Add decal' }));
    await expect(args.patch).toHaveBeenLastCalledWith({
      decals: [args.draft.decals[0], expect.objectContaining({ muted: false, offset: [0, 0] })],
    });
    await userEvent.click(canvas.getByRole('switch', { name: 'Muted treatment for decal 1' }));
    await expect(args.patch).toHaveBeenLastCalledWith({ decals: [{ ...args.draft.decals[0], muted: true }] });
  },
});
export const Abilities = meta.story({
  args: { chapter: 'abilities' as const },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('spinbutton', { name: 'Text size' })).toBeNull();
    await expect(canvas.getByRole('textbox', { name: 'General ability' })).toBeVisible();
  },
});
export const About = meta.story({
  args: { chapter: 'about' as const },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'About' })).toHaveValue(args.draft.about);
    await expect(canvas.queryByRole('textbox', { name: 'Type' })).toBeNull();
  },
});
