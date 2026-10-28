import snapshot from './players.json';

/** Public profiles captured for the tutorials and stories, in the recorded seat order. */
export const TUTORIAL_PLAYERS = snapshot.profiles.map(({ username, slug, image }) => ({
  name: username,
  slug,
  avatar: new URL(image).pathname,
}));
export type TutorialPlayer = (typeof TUTORIAL_PLAYERS)[number];
