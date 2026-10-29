import snapshot from './players.json';

/** Public profiles shared by the tutorials and stories. */
export const TUTORIAL_PLAYERS = snapshot.profiles.map(({ username, slug, image }) => ({
  name: username,
  slug,
  avatar: new URL(image).pathname,
}));
export type TutorialPlayer = (typeof TUTORIAL_PLAYERS)[number];
