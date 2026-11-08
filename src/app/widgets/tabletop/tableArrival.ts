/*
 * Whether a table plays its arrival: the moons circling the waiting frame and the table opening out of the planet.
 * The product always plays it. Storybook turns it off for every story that is not about the arrival, because each story
 * mounts its page afresh and would otherwise replay the whole opening before showing the state it is about.
 * It is read once per mount, so it is set before a story renders (the preview's `beforeEach`).
 */
let played = true;

/** Storybook's switch; the product never calls it. */
export function setTableArrivalPlayed(next: boolean) {
  played = next;
}

/** Whether the table's arrival plays; when it does not, the table shows as it does without motion: at once, and the waiting frame still. */
export function tableArrivalPlayed() {
  return played;
}
