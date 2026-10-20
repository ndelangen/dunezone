import preview from '@sb/preview';
import { expect, spyOn, userEvent, within } from 'storybook/test';

import { ChangingCardTitle, titleCases } from './CardTitle.stories.fixture';
import { settleCardTitles, singleLineTitle } from './cardTitleFit';

const meta = preview.meta({
  component: ChangingCardTitle,
  args: { path: 'custom', scale: 1 },
});

async function verifySvgTitle(title: SVGSVGElement, name: string) {
  for (const glyph of title.querySelectorAll('text')) {
    await expect(glyph.textContent).toBe(singleLineTitle(name));
    if (!singleLineTitle(name)) {
      continue;
    }
    const bounds = glyph.getBBox();
    await expect(glyph.getComputedTextLength()).toBeLessThanOrEqual(680.01);
    await expect(bounds.x).toBeGreaterThanOrEqual(109.99);
    await expect(bounds.x + bounds.width).toBeLessThanOrEqual(790.01);
    await expect(bounds.y).toBeGreaterThanOrEqual(962.99);
    await expect(bounds.y + bounds.height).toBeLessThanOrEqual(1063.01);
  }
}

async function verifyHtmlLabel(label: HTMLDivElement) {
  const span = label.firstElementChild as HTMLSpanElement;
  const bounds = label.getBoundingClientRect();
  const scale = bounds.width / label.clientWidth;
  const text = span.getBoundingClientRect();
  await expect(text.width / scale).toBeLessThanOrEqual(label.clientWidth + 0.02);
  await expect(span.style.whiteSpace).toBe('pre');
  await expect(getComputedStyle(label).overflow).toBe('visible');
  const range = document.createRange();
  range.selectNodeContents(span);
  await expect(range.getClientRects().length).toBeLessThanOrEqual(1);
  const font = getComputedStyle(span);
  const context = document.createElement('canvas').getContext('2d')!;
  context.font = `${font.fontStyle} ${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
  const ink = context.measureText(span.textContent!);
  const baseline =
    (text.top - bounds.top) / scale +
    (Number.parseFloat(font.lineHeight) + ink.fontBoundingBoxAscent - ink.fontBoundingBoxDescent) / 2;
  await expect(baseline - ink.actualBoundingBoxAscent).toBeGreaterThanOrEqual(-0.02);
  await expect(baseline + ink.actualBoundingBoxDescent).toBeLessThanOrEqual(label.clientHeight + 0.02);
}

async function verifyIconClearance(canvasElement: HTMLElement, title: Element) {
  const icon = Array.from(canvasElement.querySelectorAll<HTMLDivElement>('div')).find(
    (element) => getComputedStyle(element).borderRadius === '50%' && element.clientWidth === 125
  );
  await expect(icon).toBeDefined();
  const picture = canvasElement.querySelector<HTMLImageElement>('img[class*="picture"]');
  const iconLeft = Math.min(icon!.getBoundingClientRect().left, picture?.getBoundingClientRect().left ?? Infinity);
  await expect(
    (iconLeft - title.getBoundingClientRect().right) /
      (title.getBoundingClientRect().width / (title as HTMLElement).clientWidth)
  ).toBeGreaterThanOrEqual(9.98);
}

async function verifyHtmlTitle(canvasElement: HTMLElement, title: Element, expected: string) {
  const labels = Array.from(canvasElement.querySelectorAll<HTMLDivElement>('div[aria-label]')).filter(
    (element) => element.firstElementChild instanceof HTMLSpanElement
  );
  await expect(labels).toHaveLength(2);
  for (const label of labels) {
    await verifyHtmlLabel(label);
  }
  await expect(title.firstElementChild!.textContent).toBe(singleLineTitle(expected));
  await verifyIconClearance(canvasElement, title);
}

function expectedTitle(path: string, index: number, name: string) {
  if (path !== 'storm') {
    return name;
  }
  return index === 0 || index === titleCases.length - 1 ? '1 Sector' : '6 Sectors';
}

async function verifyTitleSize(title: Element, index: number, name: string, path: string) {
  if (title instanceof SVGSVGElement) {
    return;
  }
  if (index === 0 || index === titleCases.length - 1) {
    await expect(getComputedStyle(title.firstElementChild!).fontSize).toBe('60px');
  }
  if (name.length === 1024 && path !== 'storm') {
    await expect(Number.parseFloat(getComputedStyle(title.firstElementChild!).fontSize)).toBeLessThan(1);
  }
}

/** Geometry is checked immediately after settlement, at the same point publication is allowed. */
async function verifyTitles({ canvasElement, args }: { canvasElement: HTMLElement; args: { path: string } }) {
  let firstTitle: Element | null = null;
  for (const [index, name] of titleCases.entries()) {
    await settleCardTitles(canvasElement);
    const expected = expectedTitle(args.path, index, name);
    const title = Array.from(canvasElement.querySelectorAll('[aria-label]')).find(
      (element) => element.getAttribute('aria-label') === expected
    )!;
    await expect(title).toBeDefined();
    if (firstTitle) {
      await expect(title).toBe(firstTitle);
    }
    firstTitle = title;
    if (title instanceof SVGSVGElement) {
      await verifySvgTitle(title, name);
    } else {
      await verifyHtmlTitle(canvasElement, title, expected);
    }
    await verifyTitleSize(title, index, name, args.path);
    if (index < titleCases.length - 1) {
      await userEvent.click(within(canvasElement).getByRole('button', { name: 'Next title' }));
    }
  }
}

export const Treachery = meta.story({ args: { path: 'treachery' }, play: verifyTitles });
export const Custom = meta.story({ args: { path: 'custom' }, play: verifyTitles });
export const LeaderSkill = meta.story({ args: { path: 'leader-skill' }, play: verifyTitles });
export const Stronghold = meta.story({ args: { path: 'stronghold' }, play: verifyTitles });
export const Storm = meta.story({ args: { path: 'storm' }, play: verifyTitles });
export const Nexus = meta.story({ args: { path: 'nexus' }, play: verifyTitles });
export const Homeworld = meta.story({ args: { path: 'homeworld' }, play: verifyTitles });
export const ScaledHomeworldImage = meta.story({ args: { path: 'homeworld', iconScale: 2 }, play: verifyTitles });
export const Spice = meta.story({ args: { path: 'spice' }, play: verifyTitles });
export const Traitor = meta.story({ args: { path: 'traitor' }, play: verifyTitles });
export const Alliance = meta.story({ args: { path: 'alliance' }, play: verifyTitles });
export const Back = meta.story({ args: { path: 'back' }, play: verifyTitles });
export const ScaledPreview = meta.story({ args: { path: 'traitor', scale: 0.25 }, play: verifyTitles });

export const FontSettlement = meta.story({
  args: { path: 'custom' },
  play: async ({ canvasElement }) => {
    await settleCardTitles(canvasElement);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Next title' }));
    await settleCardTitles(canvasElement);
    const title = canvasElement.querySelector<HTMLDivElement>('div[aria-label="Rock Outcroppings"]')!;
    const span = title.firstElementChild as HTMLSpanElement;
    const originalLoad = document.fonts.load.bind(document.fonts);
    let release!: () => void;
    const pendingFont = new Promise<void>((resolve) => {
      release = resolve;
    });
    const load = spyOn(document.fonts, 'load').mockImplementation(async (...args) => {
      await pendingFont;
      return originalLoad(...args);
    });
    try {
      span.style.fontSize = '60px';
      let settled = false;
      const pending = settleCardTitles(canvasElement).then(() => {
        settled = true;
      });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await expect(settled).toBe(false);
      const controller = new AbortController();
      const cancelled = settleCardTitles(canvasElement, controller.signal);
      controller.abort(new Error('Capture unmounted'));
      await expect(cancelled).rejects.toThrow('Capture unmounted');
      release();
      await pending;
      await expect(settled).toBe(true);
      await expect(Number.parseFloat(span.style.fontSize)).toBeLessThan(60);
      await expect(span.getBoundingClientRect().width).toBeLessThanOrEqual(title.clientWidth);
      load.mockImplementation(async () => []);
      await expect(settleCardTitles(canvasElement)).rejects.toThrow('Required publisher font failed to load exactly');
    } finally {
      release();
      load.mockRestore();
    }
  },
});
