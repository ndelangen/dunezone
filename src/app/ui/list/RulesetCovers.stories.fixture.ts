import { expect } from 'storybook/test';

/* A ruleset cover drawn in place, so it shows wherever the Storybook is hosted. */
export function drawnCover(sky: string, dune: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${sky}"/><circle cx="44" cy="20" r="9" fill="#f4e3b1"/><path d="M0 46 Q20 30 38 44 T64 40 V64 H0Z" fill="${dune}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/* Eight rulesets as a card cites them: most with a cover, the third and the sixth without, as most rulesets start out. */
export const citedRulesets = [
  { id: 'ruleset-advanced', slug: 'advanced', name: 'Advanced Dune', coverThumbUrl: drawnCover('#27445c', '#c98a3c') },
  { id: 'ruleset-classic', slug: 'classic', name: 'Classic Dune', coverThumbUrl: drawnCover('#4a2d5e', '#d9a15a') },
  { id: 'ruleset-tournament', slug: 'tournament', name: 'Tournament Dune', coverThumbUrl: null },
  { id: 'ruleset-spring-cup', slug: 'spring-cup', name: 'Spring Cup', coverThumbUrl: drawnCover('#2f5a3f', '#e0c06a') },
  { id: 'ruleset-dreamrules', slug: 'dreamrules', name: 'Dreamrules', coverThumbUrl: drawnCover('#5c2a27', '#e2b36b') },
  { id: 'ruleset-sietch', slug: 'sietch-house-rules', name: 'Sietch house rules', coverThumbUrl: null },
  { id: 'ruleset-landsraad', slug: 'landsraad', name: 'Landsraad', coverThumbUrl: drawnCover('#1f4f55', '#d2a24c') },
  {
    id: 'ruleset-two-players',
    slug: 'two-players',
    name: 'Two players',
    coverThumbUrl: drawnCover('#3b3f6b', '#caa15c'),
  },
];

/** The names of the discs in a row of ruleset covers, in the order they stand, the count of the rest as it is printed. */
export function coverNames(covers: HTMLElement) {
  return [...covers.children].map((disc) => disc.getAttribute('aria-label') ?? disc.textContent);
}

/** The count of the rest is whole: its text, measured as drawn, is no wider than the ring it stands in. */
export async function expectCountFits(covers: HTMLElement) {
  const disc = covers.lastElementChild!;
  await expect(disc.textContent).toMatch(/^\+\d+$/);
  const text = disc.ownerDocument.createRange();
  text.selectNodeContents(disc);
  await expect(text.getBoundingClientRect().width).toBeGreaterThan(0);
  await expect(text.getBoundingClientRect().width).toBeLessThanOrEqual(disc.clientWidth);
}
