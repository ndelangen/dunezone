/* The browser remembers the provider it last finished signing in with, so the story plants that memory before the page reads it. */
export const lastSignedInWithDiscord = () => {
  localStorage.setItem('dunezone-last-sign-in', 'discord');
  return () => localStorage.removeItem('dunezone-last-sign-in');
};
