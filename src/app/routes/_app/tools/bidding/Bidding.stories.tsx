import preview from '@sb/preview';
import { expect, userEvent } from 'storybook/test';

import { freshAuction, midAuction, STORY_FACTIONS } from './auction.stories.fixture';
import { GavelClock as GavelClockTool } from './GavelClock';
import { PassThePhone as PassThePhoneTool } from './PassThePhone';
import { BidderPhone, PhonesAtTheTable } from './PhonesAtTheTable';
import { RefereeScript } from './RefereeScript';
import { RoundTable } from './RoundTable';
import { ListeningTablet, SoundRemote, SoundRemotes as SoundRemotesTool } from './SoundRemotes';
import { useAuctionGame } from './useAuctionGame';
import { VoiceAuctioneer as VoiceAuctioneerTool } from './VoiceAuctioneer';

/*
 * Prototypes for a bidding tool at a real table (Norbert, 2026-11-09): the Treachery cards stay physical, the auction
 * goes digital. Every one is live on the same auction engine (Play's own bidder) and keeps its auction in this
 * browser's storage. Each story starts in turn 2, mid-auction: Harkonnen won the first card for 3, and on the second
 * Fremen bid 2 and the Spacing Guild has the floor. The Emperor's hand is full, so five cards came up.
 */
const meta = preview.meta({
  title: 'Tools/Bidding prototypes',
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'appMobile' }, motion: 'on' },
  /* Each visit starts from the story's auction, not whatever was bid last time. */
  beforeEach: () => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('bidding-story-')) {
        window.localStorage.removeItem(key);
      }
    }
  },
});

/** A. The round table: a phone flat in the middle; each faction bids at its own edge, turned to face it, and the card turns to whoever's bid it is. */
export const RoundTablePhone = meta.story({
  render: () => <RoundTable storageKey="bidding-story-round" initial={midAuction()} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('group', { name: 'Quick bids for Spacing Guild' })).toBeVisible();
  },
});

/** A. The round table on a tablet lying in the middle of the table, where every edge has room. */
export const RoundTableTablet = meta.story({
  globals: { viewport: { value: 'appTablet' } },
  render: () => <RoundTable storageKey="bidding-story-round-tablet" initial={midAuction()} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: '3' }));
    await expect(canvas.getByRole('group', { name: 'Quick bids for Fremen' })).toBeVisible();
  },
});

/** B. A phone for every player and a table screen for everyone: shown side by side on one auction, as the real thing would sync them. */
export const PhonesAndTableScreen = meta.story({
  globals: { viewport: { value: undefined } },
  render: () => <PhonesAtTheTable storageKey="bidding-story-phones" initial={midAuction()} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Spacing Guild to bid')).toBeVisible();
  },
});

/* One player's phone, on its own: the auction it would share with the table. */
function GuildPhone() {
  const session = useAuctionGame('bidding-story-guild-phone', midAuction());
  return (
    <div style={{ height: '100dvh' }}>
      <BidderPhone session={session} factionId="spacing-guild" />
    </div>
  );
}

/** B. The Spacing Guild's own phone when the auction reaches it: its bid, in private. */
export const PlayersPhone = meta.story({
  render: () => <GuildPhone />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Your bid')).toBeVisible();
  },
});

/** C. The voice auctioneer: it calls the bid aloud and hears the answer. Without a microphone, tap a phrase to say it. */
export const VoiceAuctioneer = meta.story({
  render: () => <VoiceAuctioneerTool storageKey="bidding-story-voice" initial={midAuction()} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: '“four”' }));
    await expect(canvas.getByText('Fremen?')).toBeVisible();
  },
});

/** D. Pass the phone: one phone goes round with the bidding; whoever holds it bids. */
export const PassThePhone = meta.story({
  render: () => <PassThePhoneTool storageKey="bidding-story-pass" initial={midAuction()} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: /tap to bid/ }));
    await expect(canvas.getByText('Spacing Guild, your bid')).toBeVisible();
  },
});

/** E. The gavel clock: the table bids out loud; the phone keeps 15 seconds per bid and remembers what was said. */
export const GavelClock = meta.story({
  render: () => <GavelClockTool storageKey="bidding-story-clock" initial={midAuction()} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('timer')).toBeVisible();
  },
});

/** F. The referee: the Bidding phase as a script, so the table plays it by the rules. A fresh turn, before the first bid. */
export const Referee = meta.story({
  render: () => <RefereeScript storageKey="bidding-story-referee" initial={freshAuction()} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Deal 5 Treachery cards face down in a row')).toBeVisible();
  },
});

/**
 * G.
 * Sound remotes: the tablet in the middle listens, and each phone's remote plays a short tune saying who bids what.
 * The remotes play through this computer's speaker;
 * the tablet hears them directly, and through the microphone once it is on.
 */
export const SoundRemotes = meta.story({
  globals: { viewport: { value: undefined } },
  render: () => <SoundRemotesTool storageKey="bidding-story-sound" initial={midAuction()} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('meter', { name: 'What the tablet hears' })).toBeVisible();
  },
});

/* The tablet on its own, hearing remotes on other phones through its microphone. */
function Tablet() {
  const session = useAuctionGame('bidding-story-sound-tablet', midAuction());
  return <ListeningTablet session={session} />;
}

/** G. The listening tablet on its own: turn the microphone on and play a remote from a phone. */
export const SoundRemotesTablet = meta.story({
  globals: { viewport: { value: 'appTablet' } },
  render: () => <Tablet />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Spacing Guild to bid')).toBeVisible();
  },
});

/** G. A player's remote as their phone opens it from the tablet's code: first, which faction they are. */
export const SoundRemotePhone = meta.story({
  render: () => (
    <div style={{ height: '100dvh' }}>
      <SoundRemote factions={STORY_FACTIONS} />
    </div>
  ),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Spacing Guild' }));
    await expect(canvas.getByRole('button', { name: 'Pass' })).toBeVisible();
  },
});
