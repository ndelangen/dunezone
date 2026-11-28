import { createContext } from 'react';

/** How long a soft notice shows before it is gone. */
const LIFETIME_MS = 6000;

/**
 * How long a notice shows;
 * a story holds its notices with an endless one, so a slow runner never loses them before it looks.
 * It lives apart from the lazily loaded notices, so the table's own toasts read it without loading them.
 */
export const NoticeLifetime = createContext(LIFETIME_MS);
