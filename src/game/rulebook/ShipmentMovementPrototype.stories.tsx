import preview from '@sb/preview';

import { ShipmentMovementPrototype } from './ShipmentMovementPrototype.stories.fixture';

const meta = preview.meta({
  title: 'Prototypes/Shipment and movement',
  component: ShipmentMovementPrototype,
  args: { outline: 'turn', page: 0 },
  argTypes: {
    outline: { table: { disable: true } },
    page: {
      control: { type: 'range', min: 0, max: 7, step: 1 },
      description: '0 shows the complete outline. Select a page for closer inspection.',
    },
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          "Four isolated chapter outlines using registered rulebook blocks. A now uses board routes, width-filling maps and piece transfers. Sources: GF9 rulebook Shipment and Movement; the recovered JSX Phases chapter; Dreamrules v0.8 changes; recovered Dreamrules faction texts. The ally transit rule and Hajr own-turn timing follow the product owner's corrections on 5 October 2026. These are layout proposals, not a published rules revision. The block review documents the inputs now implemented.",
      },
    },
  },
});
export const FollowOneTurn = meta.story({ name: 'A: Follow one turn', args: { outline: 'turn' } });
export const CompareTwoActions = meta.story({ name: 'B: Compare two actions', args: { outline: 'actions' } });
export const MapAtlas = meta.story({ name: 'C: Map atlas', args: { outline: 'atlas' } });
export const DecisionGuide = meta.story({ name: 'D: Decision guide', args: { outline: 'decisions' } });
export const BlockReview = meta.story({ name: 'Block review: inputs in use', args: { outline: 'blocks' } });
