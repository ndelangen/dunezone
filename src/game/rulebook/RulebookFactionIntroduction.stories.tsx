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
  args: { narrow: boolean; block: { flipped?: boolean } };
}) {
  const block = canvasElement.querySelector<HTMLElement>('.rulebookFactionIntroduction')!;
  const identity = block.querySelector<HTMLElement>('.rulebookFactionIdentity')!;
  const summary = block.querySelector<HTMLElement>('.rulebookFactionSummary')!;
  const roster = block.querySelector<HTMLElement>('.rulebookFactionRoster')!;
  await waitFor(
    () => {
      for (const image of block.querySelectorAll('img')) {
        expect(image.complete && image.naturalWidth > 0).toBe(true);
        expect(new URL(image.src).pathname).toMatch(/^\/published\/(faction-tokens|leaders)\//);
      }
    },
    { timeout: 15_000 }
  );
  const leaderTokens = [...block.querySelectorAll('.rulebookFactionLeaders figure')].map((token) =>
    token.getBoundingClientRect()
  );
  expect(leaderTokens[0].top).toBeCloseTo(leaderTokens[1].top, 0);
  expect(leaderTokens[2].top).toBeGreaterThan(leaderTokens[0].top);
  expect(leaderTokens[2].top).toBeCloseTo(leaderTokens[4].top, 0);
  expect(leaderTokens[0].left).toBeGreaterThan(leaderTokens[2].left);
  expect(getComputedStyle(summary.querySelector('h3')!).display).toBe(args.narrow ? 'none' : 'block');
  const initial = block.getBoundingClientRect();
  if (args.narrow) {
    expect(summary.getBoundingClientRect().top).toBeGreaterThan(identity.getBoundingClientRect().bottom);
    expect(roster.getBoundingClientRect().top).toBeGreaterThan(summary.getBoundingClientRect().bottom);
  } else if (args.block.flipped) {
    expect(identity.getBoundingClientRect().left).toBeGreaterThanOrEqual(summary.getBoundingClientRect().right);
    expect(block.querySelector('.rulebookFactionLeaderGroup')!.getBoundingClientRect().right).toBeLessThan(
      summary.getBoundingClientRect().left
    );
  } else {
    expect(summary.getBoundingClientRect().left).toBeGreaterThanOrEqual(identity.getBoundingClientRect().right);
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

const unavailableTokenBlock = factionIntroductionFixture();
export const UnavailableToken = meta.story({
  args: {
    block: {
      ...unavailableTokenBlock,
      faction:
        unavailableTokenBlock.faction.status === 'ready'
          ? { ...unavailableTokenBlock.faction, tokenImageUrl: undefined }
          : unavailableTokenBlock.faction,
    },
  },
});

export const Flipped = meta.story({
  args: { block: { ...factionIntroductionFixture(), flipped: true } },
  play: expectResponsiveFaction,
});
export const FlippedNarrow = meta.story({
  args: { narrow: true, block: { ...factionIntroductionFixture(), flipped: true } },
  play: expectResponsiveFaction,
});
export const ShortIntroduction = meta.story({
  args: { block: { ...factionIntroductionFixture(), text: 'The Atreides use knowledge to choose their battles.' } },
  play: async (context) => {
    await expectResponsiveFaction(context);
    const body = context.canvasElement.querySelector('.rulebookFactionBody')!.getBoundingClientRect();
    /* The printed reference's short row is about 22% as tall as it is wide. */
    expect(body.height / body.width).toBeGreaterThan(0.2);
    expect(body.height / body.width).toBeLessThan(0.23);
  },
});
