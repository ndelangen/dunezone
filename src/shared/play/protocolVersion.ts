/**
 * The version of the messages a Play page and the game Worker exchange.
 * The two deploy separately, so a tab opened before a deploy can meet a newer Worker: it names this version when it asks to be admitted, and a Worker on another version turns it away before it sees the table.
 * Bump it in any change after which an older page could misread a message or send one the Worker now reads differently, even when every message still parses.
 * It lives in a module of its own, with no imports, so plain Node scripts such as scripts/verify-hosted-play.ts can read it.
 */
export const PLAY_PROTOCOL_VERSION = 2;
