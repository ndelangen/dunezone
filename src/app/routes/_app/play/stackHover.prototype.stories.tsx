import preview from '@sb/preview';
import { within } from 'storybook/test';

import { forgetAltUsed, setStackHoverLook } from '../../../widgets/tabletop/stackHoverPrototype';
import type { StackHoverLook } from '../../../widgets/tabletop/stackHoverPrototype';
import { gameMeta, install } from './game.stories.fixture';
import { chapter, journeyViewers, JourneyPage } from './journey.stories.fixture';
import { sandboxReady, sandboxTransport } from './sandbox.stories.fixture';

/*
 * PROTOTYPE (#2988): what hovering a troop stack, a deck or a spice pile shows, one look per story.
 * The live table in Shipment and Movement, seen as seat 1: hover any stack on the board, in a reserve, or a deck.
 */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Prototypes/Stack hover',
  component: JourneyPage,
  args: { ...gameMeta.args, step: chapter('Shipment and Movement'), seat: 'seat-1' },
  argTypes: { seat: { control: 'select', options: journeyViewers() } },
  parameters: { ...gameMeta.parameters, chromatic: { disableSnapshot: true } },
  globals: { motion: 'on' },
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

function lookStory(look: StackHoverLook) {
  return {
    beforeEach: ({ args }: { args: { step?: number; seat?: string } }) => {
      setStackHoverLook(look);
      if (look === 'hint-until-alt') {
        forgetAltUsed();
      }
      const cleanup = install(() =>
        sandboxTransport({ start: Number(args.step ?? 1) - 1, seat: String(args.seat ?? 'seat-1') })
      )();
      return () => {
        setStackHoverLook('today');
        cleanup();
      };
    },
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
      await sandboxReady(within(canvasElement.ownerDocument.body));
    },
  };
}

/** Today: hovering shows nothing; Alt shows every count and Ctrl every name. */
export const Today = meta.story(lookStory('today'));

/** The stack's own count pill, the one Alt shows, appears on the hovered stack only. */
export const CountOnly = meta.story(lookStory('count'));

/** The hovered stack shows its count pill and its name tag, as Alt and Ctrl together would, for that stack only. */
export const NameAndCount = meta.story(lookStory('name-and-count'));

/** The issue's proposal: a small tip, "7 troops", with a muted "Hold Alt to see every count" line under it. */
export const CountWithHint = meta.story(lookStory('count-with-hint'));

/** The count shows at once; the Alt hint joins it only when the pointer rests on the stack for a moment. */
export const HintAfterPause = meta.story(lookStory('hint-after-pause'));

/** The count with the Alt hint, until you have held Alt once; after that the tip is the count alone. Reload the story to see the hint again. */
export const HintUntilAltUsed = meta.story(lookStory('hint-until-alt'));

/** One line: "7 troops" with an Alt key cap and "all" beside it. */
export const CountWithKey = meta.story(lookStory('count-with-key'));
