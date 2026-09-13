/* Throwaway faction-pair messages for the conversation layout comparison. */
import { CATALOGUE_FACTIONS } from '../drafting-prototype/catalogue.fixture';
import { PROFILES } from '../drafting-prototype/profiles.fixture';

export const VARIANTS = ['A', 'B', 'C'] as const;
export const VARIANT_NAMES = { A: 'Reading column', B: 'Conversation list', C: 'Beside the table' };
export const SCENARIOS = ['unread', 'sending', 'offline', 'failed', 'replacement', 'revoked'] as const;
export type Scenario = (typeof SCENARIOS)[number];
export const PARTNERS = [
  { slug: 'house-atreides', profile: 'twaffle' },
  { slug: 'house-harkonnen', profile: 'fectumbra' },
  { slug: 'emperor', profile: 'erickenneth' },
  { slug: 'spacing-guild', profile: 'argelius' },
  { slug: 'bene-gesserit', profile: 'ridwan' },
];
export const factionOf = (slug: string) => CATALOGUE_FACTIONS.find((faction) => faction.slug === slug)!;
export const profileOf = (slug: string) => PROFILES.find((profile) => profile.slug === slug)!;
export type Message = {
  id: string;
  author: string;
  mine: boolean;
  text: string;
  at: string;
  state: 'sent' | 'sending' | 'pending' | 'failed';
  day: string;
};
export type ConversationState = {
  key: string;
  scenario: Scenario;
  messages: Message[];
  draft: string;
  online: boolean;
  unreadFrom: string | null;
  author: string;
  sequence: number;
};
export type Action =
  | { type: 'load'; key: string; scenario: Scenario; partner: string }
  | { type: 'draft'; value: string }
  | { type: 'send'; at: string }
  | { type: 'retry'; id: string }
  | { type: 'delivered'; ids: string[] }
  | { type: 'read' }
  | { type: 'reconnect' };
const LINES = [
  'Are you planning to bid on the first card?',
  'Only if the price stays low.',
  'Then I will leave it to you.',
  'Thanks. I will sit out the next one.',
  'The storm is moving. Still the same agreement?',
  'Yes, I am keeping my forces where they are.',
  'Can you spare two spice this turn?',
  'I can put a stack on the table after bidding.',
  'That works for me.',
  'The stack is there now.',
  'Picked it up. Thank you.',
  'We should talk before the next movement phase.',
  'I am back. Do you have a minute?',
  'Yes. I can move my three forces away.',
  'I only need room for two.',
  'Then we can both stay.',
  'Are we leaving the Guild alone?',
  'For now. I want to see their next shipment.',
  'I have finished moving.',
  'Same here. I am ready to advance.',
  'There may be a battle before spice collection.',
  'I can wait until it is settled.',
  'Still interested in the same deal next turn?',
  'Yes, if the payment stays at two spice.',
  'That is fine. I will put the stack down before moving.',
  'I will leave the path clear.',
  'Agreed. Let me know when you are back.',
  'I should be back this evening.',
];
export function makeConversation(key: string, scenario: Scenario, partner: string): ConversationState {
  const other = PARTNERS.find((item) => item.slug === partner)!.profile;
  const author = scenario === 'replacement' ? 'bigdave' : 'thialfi';
  const messages: Message[] = LINES.map((text, index) => ({
    id: `m${index}`,
    text,
    mine: index % 2 === 1,
    author: index % 2 ? (scenario === 'replacement' && index >= 24 ? author : 'thialfi') : other,
    at: `${index < 12 ? '20' : '14'}:${String(10 + index).padStart(2, '0')}`,
    day: index < 12 ? '12 September' : '13 September',
    state: 'sent',
  }));
  if (scenario === 'sending' || scenario === 'offline' || scenario === 'failed') {
    messages.push({
      id: 'fixture-last',
      mine: true,
      author,
      text: 'I can wait until after the battle.',
      at: '14:40',
      day: '13 September',
      state: scenario === 'sending' ? 'sending' : scenario === 'offline' ? 'pending' : 'failed',
    });
  }
  return {
    key,
    scenario,
    messages,
    draft: '',
    online: scenario !== 'offline',
    unreadFrom: scenario === 'unread' ? 'm24' : null,
    author,
    sequence: 0,
  };
}
export function reduceConversation(state: ConversationState, action: Action): ConversationState {
  switch (action.type) {
    case 'load':
      return makeConversation(action.key, action.scenario, action.partner);
    case 'draft':
      return { ...state, draft: action.value };
    case 'read':
      return { ...state, unreadFrom: null };
    case 'send': {
      if (!state.draft.trim() || state.scenario === 'revoked') {
        return state;
      }
      return {
        ...state,
        sequence: state.sequence + 1,
        draft: '',
        messages: [
          ...state.messages,
          {
            id: `new${state.sequence}`,
            mine: true,
            author: state.author,
            text: state.draft.trim(),
            at: action.at,
            day: '13 September',
            state: state.online ? 'sending' : 'pending',
          },
        ],
      };
    }
    case 'retry':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.id
            ? { ...message, id: `retry-${message.id}`, state: state.online ? 'sending' : 'pending' }
            : message
        ),
      };
    case 'reconnect':
      return {
        ...state,
        online: true,
        messages: state.messages.map((message) =>
          message.state === 'pending' ? { ...message, id: `retry-${message.id}`, state: 'sending' } : message
        ),
      };
    case 'delivered':
      return {
        ...state,
        messages: state.messages.map((message) =>
          action.ids.includes(message.id) ? { ...message, state: 'sent' } : message
        ),
      };
  }
}
