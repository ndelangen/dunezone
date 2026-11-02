import { configure, getConfig } from 'storybook/test';

/*
 * Storybook's React renderer wraps every user-event dispatch in React's act().
 * A dispatch can start another one while React is still committing the first: when a commit removes the
 * focused input that a story typed into, the browser blurs it during the removal, and user-event's own blur
 * listener dispatches that input's `change` event, wrapped in act() again. React ends the act scope when that
 * inner act() returns, so the rest of the outer act's work runs outside any scope while the act environment is
 * still switched on, and every state update in it prints "not wrapped in act(...)" (the tutorial stories that
 * submit the compass search printed 232 of them per run).
 * A dispatch that starts inside another one runs inside that act() instead of opening its own.
 */
export function keepNestedEventsInOneActScope() {
  const config = getConfig();
  let depth = 0;
  configure({
    eventWrapper: (dispatch) => {
      if (depth > 0) {
        return dispatch();
      }
      depth += 1;
      try {
        return config.eventWrapper(dispatch);
      } finally {
        depth -= 1;
      }
    },
  });
}
