import preview from '@sb/preview';
import { GF9_LEADER_SKILLS } from '@shared/assets/gf9LeaderSkills';
import { expect, waitFor } from 'storybook/test';

import headStyles from './CardHead.module.css';
import { LeaderSkillCard } from './LeaderSkill';
import leaderStyles from './LeaderSkill.module.css';

const meta = preview.meta({
  component: LeaderSkillCard,
  globals: { viewport: { value: 'card' } },
  args: GF9_LEADER_SKILLS[0]!,
});
async function checkFit(canvasElement: HTMLElement) {
  await document.fonts.ready;
  const title = canvasElement.querySelector<HTMLElement>(`.${headStyles.title}`)!;
  const titleText = title.firstElementChild!;
  const titleRange = document.createRange();
  titleRange.selectNodeContents(titleText);
  await expect(titleRange.getClientRects()).toHaveLength(1);
  await expect(titleText.getBoundingClientRect().width).toBeLessThanOrEqual(title.clientWidth);
  const decals = Array.from(canvasElement.querySelectorAll<SVGUseElement>('use'));
  await waitFor(() => expect(decals[0]!.getBoundingClientRect().height).toBeGreaterThan(0));
  const window = decals[0]!.ownerSVGElement!.parentElement!.getBoundingClientRect();
  await Promise.all(
    decals.map(async (decal) => {
      const bounds = decal.getBoundingClientRect();
      await expect(bounds.top).toBeGreaterThanOrEqual(window.top);
      await expect(bounds.bottom).toBeLessThanOrEqual(window.bottom);
      await expect(bounds.left).toBeGreaterThanOrEqual(window.left);
      await expect(bounds.right).toBeLessThanOrEqual(window.right);
    })
  );
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

export const ForegroundOverMuted = meta.story({
  args: {
    decals: [
      { id: '/vector/generic/star.svg', scale: 0.5, offset: [0, 0], muted: false, outline: false },
      { id: '/vector/decal/suk-graduate.svg', scale: 1, offset: [0, 0], muted: true, outline: false },
    ],
  },
  play: async ({ canvasElement }) => {
    const foreground = Array.from(canvasElement.querySelectorAll<SVGUseElement>('use')).at(-1)!;
    await waitFor(() => expect(foreground.getBoundingClientRect().height).toBeGreaterThan(0));
    const bounds = foreground.getBoundingClientRect();
    await expect(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)).toBe(foreground);
  },
});

export const RasterIllustration = meta.story({
  args: {
    decals: [
      { id: '/image/decal/gf9-stronghold-arrakeen.png', scale: 1, offset: [0, 0], muted: false, outline: false },
    ],
  },
  play: async ({ canvasElement }) => {
    const illustration = canvasElement.querySelector<SVGImageElement>(`.${leaderStyles.art} svg image`)!;
    const image = new Image();
    image.src = illustration.href.baseVal;
    await image.decode();
    await waitFor(() => expect(illustration.getBoundingClientRect().height).toBeGreaterThan(0));
    const box = illustration.getBoundingClientRect();
    const fit = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
    const width = image.naturalWidth * fit;
    const height = image.naturalHeight * fit;
    const left = box.left + (box.width - width) / 2;
    const top = box.top + (box.height - height) / 2;
    const window = illustration.ownerSVGElement!.parentElement!.getBoundingClientRect();
    await expect(left).toBeGreaterThanOrEqual(window.left);
    await expect(left + width).toBeLessThanOrEqual(window.right);
    await expect(top).toBeGreaterThanOrEqual(window.top);
    await expect(top + height).toBeLessThanOrEqual(window.bottom);
  },
});

export const FixedIdentity = meta.story({
  args: {
    ...GF9_LEADER_SKILLS[0]!,
    head: { ...GF9_LEADER_SKILLS[0]!.head, colors: ['#ff0000', '#00ff00'] },
    icon: [GF9_LEADER_SKILLS[0]!.icon[0], '/vector/icon/projectile.svg'],
    iconScale: 2,
    iconOffset: [80, 80],
    iconOpacity: 0,
    subName: 'Weapon',
    textSize: 24,
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector(`.${leaderStyles.body}`)).toHaveStyle({ fontSize: '36px' });
    await expect(canvasElement.querySelector('rect[fill="#6B328E"]')).not.toBeNull();
    await expect(canvasElement.querySelector('img[src="/vector/icon/projectile.svg"]')).toBeNull();
    await expect(canvasElement.querySelector('img[src="/vector/generic/leader-skills.svg"]')).toHaveStyle({
      width: '85px',
      opacity: '1',
    });
    await checkFit(canvasElement);
  },
});
