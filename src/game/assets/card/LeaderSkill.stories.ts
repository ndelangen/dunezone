import preview from '@sb/preview';
import { GF9_LEADER_SKILLS } from '@shared/assets/gf9LeaderSkills';
import { expect } from 'storybook/test';

import { LeaderSkillCard } from './LeaderSkill';

const meta = preview.meta({
  component: LeaderSkillCard,
  globals: { viewport: { value: 'card' } },
  args: GF9_LEADER_SKILLS[0]!,
});
async function checkFit(canvasElement: HTMLElement) {
  await document.fonts.ready;
  const card = canvasElement.firstElementChild!.getBoundingClientRect();
  const battle = Array.from(canvasElement.querySelectorAll<HTMLElement>('div')).find(
    (node) => node.textContent?.startsWith('This leader in battle:') && node.children.length === 1
  )!;
  await expect(battle.getBoundingClientRect().bottom).toBeLessThanOrEqual(card.bottom - 70);
  const general = battle.parentElement!.firstElementChild!;
  await expect(general.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    general.nextElementSibling!.getBoundingClientRect().top
  );
}
export const Bureaucrat = meta.story({
  args: GF9_LEADER_SKILLS[0]!,
  play: async ({ canvasElement }) => checkFit(canvasElement),
});
export const Diplomat = meta.story({
  args: GF9_LEADER_SKILLS[1]!,
  play: async ({ canvasElement }) => checkFit(canvasElement),
});
export const KillerMedic = meta.story({
  args: GF9_LEADER_SKILLS[2]!,
  play: async ({ canvasElement }) => checkFit(canvasElement),
});
export const MasterOfAssassins = meta.story({
  args: GF9_LEADER_SKILLS[3]!,
  play: async ({ canvasElement }) => checkFit(canvasElement),
});
export const Mentat = meta.story({
  args: GF9_LEADER_SKILLS[4]!,
  play: async ({ canvasElement }) => checkFit(canvasElement),
});
export const Planetologist = meta.story({
  args: GF9_LEADER_SKILLS[5]!,
  play: async ({ canvasElement }) => checkFit(canvasElement),
});
export const PranaBinduAdept = meta.story({
  args: GF9_LEADER_SKILLS[6]!,
  play: async ({ canvasElement }) => checkFit(canvasElement),
});
export const RihaniDecipherer = meta.story({
  args: GF9_LEADER_SKILLS[7]!,
  play: async ({ canvasElement }) => checkFit(canvasElement),
});
export const Sandmaster = meta.story({
  args: GF9_LEADER_SKILLS[8]!,
  play: async ({ canvasElement }) => checkFit(canvasElement),
});
export const Smuggler = meta.story({
  args: GF9_LEADER_SKILLS[9]!,
  play: async ({ canvasElement }) => checkFit(canvasElement),
});
export const SpiceBanker = meta.story({
  args: GF9_LEADER_SKILLS[10]!,
  play: async ({ canvasElement }) => checkFit(canvasElement),
});
export const SukGraduate = meta.story({
  args: GF9_LEADER_SKILLS[11]!,
  play: async ({ canvasElement }) => checkFit(canvasElement),
});
export const SwordmasterOfGinaz = meta.story({
  args: GF9_LEADER_SKILLS[12]!,
  play: async ({ canvasElement }) => checkFit(canvasElement),
});
export const Warmaster = meta.story({
  args: GF9_LEADER_SKILLS[13]!,
  play: async ({ canvasElement }) => checkFit(canvasElement),
});
