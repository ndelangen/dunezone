import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';

import { DepartureCover } from '@app/shell/DepartureCover';
import { beginDeparture, leaveDeparture } from '@app/shell/voyage';
import { useMotionAllowed } from '@app/styles/motion';

import { loadHostedTable } from './hostedTableChunk';

/* As long as the page's fade on departure takes (AppRoot's stylesheet); the planet keeps rising into the game page. */
export const DEPARTURE_MS = 700;

/**
 * A link into a game's table that departs the way Create game does: the page fades away while the app's planet rises, then the table's waiting frame takes it over.
 * A click that opens a new tab, or any click with motion off, is left to the link as it is.
 */
export function TableDepartureLink({ gameId, ...rootProps }: Readonly<{ gameId: string }>) {
  const navigate = useNavigate();
  const motion = useMotionAllowed();
  const [departing, setDeparting] = useState(false);
  useEffect(() => leaveDeparture, []);
  /*
   * The departure takes the click before the link does: once it is prevented, the link leaves the navigation to the departure's own timer.
   * It listens in the capture phase so a link that owns its click handler (Storybook's router mock) still departs.
   */
  /* The table loads as the pointer reaches the link, so its first evaluation lands before the departure, not during the planet's rise. */
  const preload = () => {
    loadHostedTable().catch(() => {});
  };
  const depart = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      !motion ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    beginDeparture();
    setDeparting(true);
    window.setTimeout(() => void navigate({ to: '/play/$gameId', params: { gameId } }), DEPARTURE_MS);
  };
  return (
    <>
      <Link
        {...rootProps}
        to="/play/$gameId"
        params={{ gameId }}
        onClickCapture={depart}
        onPointerEnter={preload}
        onFocus={preload}
      />
      {departing ? <DepartureCover /> : null}
    </>
  );
}
