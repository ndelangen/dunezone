import { publishedHref } from '@shared/asset-publishing/publicationTargets';
import type { RulebookRenderBlockV1 } from '@shared/rulebooks/renderDocument';
import { expect, waitFor } from 'storybook/test';

import { RulebookBlockRenderer } from './RulebookBlockRenderer';

/* The examples use the same published faction and member images as the live Rulebook. */
export function factionIntroductionFixture(): Extract<RulebookRenderBlockV1, { kind: 'faction-introduction' }> {
  const factionId = 'k17ag3gr1h60n7mmh88kj56avs8a1j7x';
  const members = [
    {
      name: 'Paul Atreides',
      memberId: '08bbac42-960c-476c-a46c-2b904edf2fe4',
      imageUrl:
        '/published/leaders/k17ag3gr1h60n7mmh88kj56avs8a1j7x.08bbac42-960c-476c-a46c-2b904edf2fe4/leader.jpg?v=81a96484-b616-447c-b3c4-1373e457e74c',
    },
    {
      name: 'Lady Jessica',
      memberId: 'c537e132-7b96-4d9a-8140-61854961a70f',
      imageUrl:
        '/published/leaders/k17ag3gr1h60n7mmh88kj56avs8a1j7x.c537e132-7b96-4d9a-8140-61854961a70f/leader.jpg?v=2c01df80-d66a-4335-9b3e-5a0c1152bcc5',
    },
    {
      name: 'Thufir Hawat',
      memberId: 'efd456e6-2374-4a9c-a033-e700d3896c47',
      imageUrl:
        '/published/leaders/k17ag3gr1h60n7mmh88kj56avs8a1j7x.efd456e6-2374-4a9c-a033-e700d3896c47/leader.jpg?v=2e3c1a8a-6960-46c4-8c8c-df4c433c5c08',
    },
    {
      name: 'Gurney Halleck',
      memberId: '01f1cf94-2df1-4b96-9fbf-dd757afef27b',
      imageUrl:
        '/published/leaders/k17ag3gr1h60n7mmh88kj56avs8a1j7x.01f1cf94-2df1-4b96-9fbf-dd757afef27b/leader.jpg?v=fca62d74-7a13-4d83-9725-3f248085ea22',
    },
    {
      name: 'Duncan Idaho',
      memberId: 'f81ee425-dc09-4a89-a256-6946a97fe4de',
      imageUrl:
        '/published/leaders/k17ag3gr1h60n7mmh88kj56avs8a1j7x.f81ee425-dc09-4a89-a256-6946a97fe4de/leader.jpg?v=01434f4a-8656-4e79-846e-d80970a70aba',
    },
    {
      name: 'Doctor Yueh',
      memberId: 'a3711dc6-b2b9-4826-b7f9-1feb95c0629c',
      imageUrl:
        '/published/leaders/k17ag3gr1h60n7mmh88kj56avs8a1j7x.a3711dc6-b2b9-4826-b7f9-1feb95c0629c/leader.jpg?v=4550c0c6-dac2-4468-8eb5-46dffbcbdbf5',
    },
  ].map(({ name, memberId, imageUrl }) => ({
    name,
    imageUrl: `https://dune.zone${imageUrl}`,
    status: 'ready' as const,
    reference: { kind: 'faction-member' as const, factionId, memberId },
  }));
  return {
    id: 'FACT',
    kind: 'faction-introduction',
    text: 'The Atreides rely on knowledge to choose their battles. Their limited prescience reveals information about the cards and plans of their opponents.\n\nLed by Paul Atreides, they turn this knowledge into an advantage on Arrakis.',
    faction: {
      status: 'ready',
      factionId,
      name: 'Atreides',
      color: '#4b4c0d',
      tokenImageUrl: `https://dune.zone${publishedHref('faction-token', factionId)}`,
      ruler: members[0],
      leaders: members.slice(1),
    },
  };
}

export function FactionIntroductionStory({
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

export async function expectResponsiveFaction({
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
    async () => {
      for (const image of block.querySelectorAll('img')) {
        await expect(image.complete && image.naturalWidth > 0).toBe(true);
        await expect(new URL(image.src).pathname).toMatch(/^\/published\/(faction-tokens|leaders)\//);
      }
    },
    { timeout: 15_000 }
  );
  const leaderTokens = [...block.querySelectorAll('.rulebookFactionLeaders figure')].map((token) =>
    token.getBoundingClientRect()
  );
  await expect(leaderTokens[0].top).toBeCloseTo(leaderTokens[1].top, 0);
  await expect(leaderTokens[2].top).toBeGreaterThan(leaderTokens[0].top);
  await expect(leaderTokens[2].top).toBeCloseTo(leaderTokens[4].top, 0);
  await expect(leaderTokens[0].left).toBeGreaterThan(leaderTokens[2].left);
  await expect(getComputedStyle(summary.querySelector('h3')!).display).toBe(args.narrow ? 'none' : 'block');
  const initial = block.getBoundingClientRect();
  if (args.narrow) {
    await expect(summary.getBoundingClientRect().top).toBeGreaterThan(identity.getBoundingClientRect().bottom);
    await expect(roster.getBoundingClientRect().top).toBeGreaterThan(summary.getBoundingClientRect().bottom);
  } else if (args.block.flipped) {
    await expect(identity.getBoundingClientRect().left).toBeGreaterThanOrEqual(summary.getBoundingClientRect().right);
    await expect(block.querySelector('.rulebookFactionLeaderGroup')!.getBoundingClientRect().right).toBeLessThan(
      summary.getBoundingClientRect().left
    );
  } else {
    await expect(summary.getBoundingClientRect().left).toBeGreaterThanOrEqual(identity.getBoundingClientRect().right);
  }
  for (const image of block.querySelectorAll('img')) {
    await expect(image.getBoundingClientRect().right).toBeLessThanOrEqual(initial.right + 1);
  }
  /* Reflow is driven by the containing region while the viewport stays unchanged. */
  const region = block.parentElement!;
  const width = region.style.width;
  region.style.width = args.narrow ? '100%' : '48%';
  await waitFor(async () => {
    await expect(getComputedStyle(roster).display).toBe(args.narrow ? 'contents' : 'flex');
  });
  region.style.width = width;
}
