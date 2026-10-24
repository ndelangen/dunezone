import { commands } from 'vite-plus/test/browser';

declare module 'vite-plus/test/browser' {
  interface BrowserCommands {
    emulateReducedMotion: (reduce: boolean) => Promise<void>;
  }
}

/* Components that read `prefers-reduced-motion` directly ignore the motion cookie, so the story run sets the media feature itself. */
export async function emulateReducedMotion(reduce: boolean): Promise<void> {
  await commands.emulateReducedMotion(reduce);
}
