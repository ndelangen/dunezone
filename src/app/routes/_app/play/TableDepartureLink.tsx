import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';

import { useMotionAllowed } from '@app/styles/motion';
import { DepartureCover } from '@app/widgets/voyage/DepartureCover';
import { beginDeparture, cancelDeparture, leaveDeparture, openDeparture } from '@app/widgets/voyage/voyage';

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
  const opening = useRef<number | undefined>(undefined);
  /* The departure this link started, if any: a lobby holds many links, and only the one that departed hands the planet on or calls it off. */
  const started = useRef<number | undefined>(undefined);
  /*
   * A page left during the departure (Back, another link) calls the departure off at once;
   * a page left by the departure itself hands the planet on to the table's frame.
   */
  useEffect(
    () => () => {
      const token = started.current;
      if (token === undefined) {
        return;
      }
      if (opening.current === undefined) {
        leaveDeparture(token);
      } else {
        window.clearTimeout(opening.current);
        cancelDeparture(token);
      }
    },
    []
  );
  /* The table loads as the pointer reaches the link, so its first evaluation lands before the departure, not during the planet's rise. */
  const preload = () => {
    loadHostedTable().catch(() => {});
  };
  /*
   * The departure takes the click before the link does: once it is prevented, the link leaves the navigation to the departure's own timer.
   * It listens in the capture phase so a link that owns its click handler (Storybook's router mock) still departs.
   * A second press while departing (Enter on the focused link) does nothing.
   */
  const depart = (event: MouseEvent<HTMLAnchorElement>) => {
    if (departing) {
      event.preventDefault();
      return;
    }
    if (!motion || !isPlainClick(event)) {
      return;
    }
    event.preventDefault();
    const token = beginDeparture();
    started.current = token;
    setDeparting(true);
    opening.current = window.setTimeout(() => {
      opening.current = undefined;
      /* A newer departure (another link pressed meanwhile) owns the planet now; this one stays put. */
      if (!openDeparture(token)) {
        setDeparting(false);
        return;
      }
      void navigate({ to: '/play/$gameId', params: { gameId } });
    }, DEPARTURE_MS);
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

/* A primary click with no modifier that nothing else has taken: one that would follow the link in this tab. */
function isPlainClick(event: MouseEvent<HTMLAnchorElement>) {
  const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  return !event.defaultPrevented && event.button === 0 && !modified;
}
