import { viewerChoice } from '../../../../widgets/tabletop/viewerPreference';

/*
 * Whether chat messages raise soft notices for this viewer (#2981): a mention of their faction in the table chat, and a private chat message.
 * On unless they turn it off in the game menu; kept per browser beside the board's look.
 */
const chatNotices = viewerChoice<boolean>('dunezone-chat-notices', {
  parse: (stored) => stored !== 'off',
  serialize: (on) => (on ? 'on' : 'off'),
  fallback: true,
});

export const setChatNotices = chatNotices.set;
/** Whether chat messages raise soft notices for this viewer. */
export const useChatNotices = chatNotices.use;
