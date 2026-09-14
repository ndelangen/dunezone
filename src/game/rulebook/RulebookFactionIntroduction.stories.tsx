import preview from '@sb/preview';
import type { RulebookRenderBlockV1 } from '@shared/rulebooks/renderDocument';
import { expect, waitFor } from 'storybook/test';

import { RulebookBlockRenderer } from './RulebookBlockRenderer';
import { factionIntroductionFixture } from './RulebookFactionIntroduction.stories.fixture';

function FactionIntroductionStory({
  width,
  narrow,
  block,
}: Readonly<{
  width: number;
  narrow: boolean;
  block: Extract<RulebookRenderBlockV1, { kind: 'faction-introduction' }>;
}>) {
  return (
    <div style={{ width, maxWidth: '100%' }}>
      <div className="rulebookBlockCanvas">
        <div className="rulebookBlockCanvasContent">
          <div style={{ width: narrow ? '48%' : '100%' }}>
            <RulebookBlockRenderer block={block} />
          </div>
        </div>
      </div>
    </div>
  );
}

const meta = preview.meta({
  title: 'Blocks/Faction introduction',
  component: FactionIntroductionStory,
  args: { width: 1000, narrow: false, block: factionIntroductionFixture() },
  parameters: { layout: 'centered' },
});

async function expectResponsiveFaction({
  canvasElement,
  args,
}: {
  canvasElement: HTMLElement;
  args: { narrow: boolean };
}) {
  const block = canvasElement.querySelector<HTMLElement>('.rulebookFactionIntroduction')!;
  const identity = block.querySelector<HTMLElement>('.rulebookFactionIdentity')!;
  const summary = block.querySelector<HTMLElement>('.rulebookFactionSummary')!;
  const roster = block.querySelector<HTMLElement>('.rulebookFactionRoster')!;
  await waitFor(() => {
    for (const image of block.querySelectorAll('img')) {
      expect(image.complete && image.naturalWidth > 0).toBe(true);
      expect(new URL(image.src).pathname).toMatch(/^\/published\/(faction-tokens|leaders)\//);
    }
  });
  const initial = block.getBoundingClientRect();
  if (args.narrow) {
    expect(summary.getBoundingClientRect().top).toBeGreaterThan(identity.getBoundingClientRect().bottom);
    expect(roster.getBoundingClientRect().top).toBeGreaterThan(summary.getBoundingClientRect().bottom);
  } else {
    expect(summary.getBoundingClientRect().left).toBeGreaterThan(identity.getBoundingClientRect().right);
  }
  for (const image of block.querySelectorAll('img')) {
    expect(image.getBoundingClientRect().right).toBeLessThanOrEqual(initial.right + 1);
  }
  /* Reflow is driven by the containing region while the viewport stays unchanged. */
  const region = block.parentElement!;
  const width = region.style.width;
  region.style.width = args.narrow ? '100%' : '48%';
  await waitFor(() => {
    expect(getComputedStyle(roster).display).toBe(args.narrow ? 'contents' : 'flex');
  });
  region.style.width = width;
}

export const Wide = meta.story({ play: expectResponsiveFaction });
export const Narrow = meta.story({ args: { narrow: true }, play: expectResponsiveFaction });
export const ScaledPreview = meta.story({ args: { width: 600 }, play: expectResponsiveFaction });
