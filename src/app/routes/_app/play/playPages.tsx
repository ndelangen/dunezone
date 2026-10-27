import { Link, useNavigate } from '@tanstack/react-router';
import { createContext, use } from 'react';
import type { ReactNode } from 'react';

import { useCreatableRulesets, useCreateGame, useGameNameAvailability, useLobbyGames } from '@db/play';

/*
 * Where the lobby and the create page read their games and rulesets, create a game, and lead on to:
 * Convex and the app's routes in the app, while the tutorial gives them sample answers and keeps the player on its page.
 * Each member is a hook, called once per render in the same place, so a page reads one source for its whole life.
 */

type RootLink = (rootProps: object) => ReactNode;

export type PlayPages = Readonly<{
  useLobbyGames: typeof useLobbyGames;
  useCreatableRulesets: typeof useCreatableRulesets;
  useGameNameAvailability: typeof useGameNameAvailability;
  useCreateGame: typeof useCreateGame;
  /** What opens a game once it is created, by its address. */
  useOpenGame: () => (address: string) => void;
  /** The links the pages lead on with, as a button's root. */
  createLink: RootLink;
  tutorialLink: RootLink;
  gameLink: (address: string) => RootLink;
}>;

const appPlayPages: PlayPages = {
  useLobbyGames,
  useCreatableRulesets,
  useGameNameAvailability,
  useCreateGame,
  useOpenGame: () => {
    const navigate = useNavigate();
    return (address) => void navigate({ to: '/play/$gameId', params: { gameId: address } });
  },
  createLink: (rootProps) => <Link {...rootProps} to="/play/create" />,
  tutorialLink: (rootProps) => <Link {...rootProps} to="/tutorial" />,
  gameLink: (address) => (rootProps) => <Link {...rootProps} to="/play/$gameId" params={{ gameId: address }} />,
};

export const PlayPagesContext = createContext(appPlayPages);

export const usePlayPages = () => use(PlayPagesContext);
