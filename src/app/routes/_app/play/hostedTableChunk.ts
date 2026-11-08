/*
 * The hosted table's bundle and its own lazy parts, fetched together so the parts do not wait for the table to render.
 * Their list is fetched too, rather than imported, since the game route's loader is part of every page's entry.
 * The create page loads it while idle, so the bundle's evaluation (three.js among it) does not stall the planet rising on Create.
 */
export const loadHostedTable = () => {
  import('@app/widgets/tabletop/tableChunks').then(
    ({ preloadTableChunks }) => preloadTableChunks(),
    () => {}
  );
  return import('./multiplayer/HostedTable');
};
