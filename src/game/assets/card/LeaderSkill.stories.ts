import preview from '@sb/preview';
import { GF9_LEADER_SKILLS } from '@shared/assets/gf9LeaderSkills';
import { expect, waitFor } from 'storybook/test';

import { LeaderSkillCard } from './LeaderSkill';
import leaderStyles from './LeaderSkill.module.css';

const meta = preview.meta({
  component: LeaderSkillCard,
  globals: { viewport: { value: 'card' } },
  args: GF9_LEADER_SKILLS[0]!,
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
