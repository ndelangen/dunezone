import assert from 'node:assert/strict';

import { phaseAt } from '../src/shared/play/phases.ts';
import { describeResult } from '../src/shared/play/result.ts';

/**
 * A real game played to a declared result and continued, through ordinary browser controls.
 * The native journeys prove the rules.
 * This flow proves the lobby, the decision bars and Continue playing in signed-in browsers.
 */
export async function verifyResults({
  seated,
  factionOf,
  spectator,
  button,
  act,
  converged,
  openTab,
  capture,
  until,
  passed,
  origin,
  currentGameId,
}) {
  const { a, b, observer } = await seated();
  const everyone = [a, b, observer];
  const stage = (who) => who.view().snapshot.stage;
  const bar = (who) => who.page.locator('[data-decision-bar]');
  const winner = factionOf(a);
  const gameId = currentGameId();

  for (const who of everyone) {
    await openTab(who, 'Phase');
  }
  /* Determine winner is offered only during Mentat pause, where the turn's phases end. */
  while (phaseAt(a.view().snapshot.phase).id !== 'mentat-pause') {
    assert.equal(await button(a, 'Determine winner').count(), 0);
    await act(a, 'Next phase');
  }
  await converged(everyone);
  await button(a, 'Determine winner').waitFor();
  await button(b, 'Determine winner').waitFor();
  assert.equal(await button(observer, 'Determine winner').count(), 0);
  passed('Determine winner appears for both players at Mentat pause and never for a spectator');

  await act(a, 'Determine winner');
  await converged(everyone);
  assert.equal(a.view().snapshot.ending?.by.seat, a.view().viewer.viewerSeat);
  const declared = bar(a);
  await declared.getByText('Declare the result', { exact: true }).waitFor();
  const name = a.view().snapshot.ending.by.name;
  for (const who of [b, observer]) {
    await bar(who).getByText(`${name} is determining the winner`, { exact: true }).waitFor();
    assert.equal(await bar(who).getByRole('button', { name: 'Declare', exact: true }).count(), 0);
  }
  assert.equal(await button(b, 'Determine winner').count(), 0);
  assert.equal(await declared.getByRole('button', { name: 'Declare', exact: true }).isDisabled(), true);
  await capture(a, 'after-declare-bar-1440x1000');
  passed('Opening the sequence gives its player the Declare bar and names them on every other panel');

  await declared.getByRole('combobox', { name: 'Winning faction', exact: true }).click();
  await a.page.getByRole('option', { name: winner.name, exact: true }).click();
  await act(a, 'Declare');
  await until(() => everyone.every((who) => stage(who) === 'finished'), 'The declared result did not finish the game.');
  await converged(everyone);
  const result = a.view().snapshot.result;
  assert.equal(result.kind, 'faction');
  assert.deepEqual(result.factionIds, [winner.id]);
  const title = describeResult('faction', [winner.name]);
  for (const who of everyone) {
    await bar(who).getByText(title, { exact: true }).waitFor();
    await bar(who).getByText(`Declared by ${name}.`).waitFor();
  }
  await bar(a).getByRole('button', { name: 'Continue playing', exact: true }).waitFor();
  await bar(b).getByRole('button', { name: 'Continue playing', exact: true }).waitFor();
  assert.equal(await bar(observer).getByRole('button', { name: 'Continue playing', exact: true }).count(), 0);
  await bar(observer)
    .getByText(/The table stays as it was\.$/u)
    .waitFor();
  assert.equal(observer.view().viewer.viewerSeat, spectator);
  await capture(b, 'after-finished-1440x1000');
  passed('Declaring a faction finishes the game for every panel; players may continue and the spectator may not');

  /* A reload re-admits into the finished game from the room's stored state, not from anything the page kept. */
  const reloadedFrom = b.view().viewer.connectionId;
  await b.page.reload({ waitUntil: 'domcontentloaded' });
  await until(() => b.view().viewer.connectionId !== reloadedFrom, 'The reload did not get a fresh connection.');
  await b.page.locator('[data-connection="authorized"]').waitFor();
  assert.equal(stage(b), 'finished');
  await bar(b).getByText(title, { exact: true }).waitFor();
  /* The reloaded panel opens on its default tab, so the Phase tab is chosen again for the checks after Continue playing. */
  await openTab(b, 'Phase');
  passed('A reloaded player re-enters the finished game with its declared result');

  /* The lobby shows one view at a time: its toolbar picks Ongoing, Yours or Finished, and each game is a card holding its Open link. */
  const lobbyCard = (page) =>
    page
      .getByRole('list', { name: 'Games' })
      .getByRole('listitem')
      .filter({ has: page.locator(`a[href$="/play/${gameId}"]`) });
  const showGames = async (page, view) => {
    await page.locator('input[aria-label="Show games"]:visible').first().click();
    await page.getByRole('option', { name: new RegExp(`^${view}`) }).click();
  };
  const observerLeft = observer.view().viewer.connectionId;
  await observer.page.goto(`${origin}/play`, { waitUntil: 'domcontentloaded' });
  await observer.page.getByRole('heading', { name: 'Game lobby' }).waitFor();
  await showGames(observer.page, 'Finished');
  await lobbyCard(observer.page).getByText(`${winner.name} won`).waitFor({ timeout: 20_000 });
  assert.equal(await lobbyCard(observer.page).getByRole('link').getAttribute('href'), `/play/${gameId}`);
  await capture(observer, 'after-lobby-past-1440x1000');
  await showGames(observer.page, 'Ongoing');
  assert.equal(await lobbyCard(observer.page).count(), 0);
  passed('The lobby lists the finished game under Finished with its winner, and not under Ongoing');

  await act(b, 'Continue playing');
  await until(() => [a, b].every((who) => stage(who) === 'play'), 'Continue playing did not resume play.');
  await converged([a, b]);
  assert.equal(a.view().snapshot.result ?? null, null);
  assert.equal(phaseAt(a.view().snapshot.phase).id, 'mentat-pause');
  for (const who of [a, b]) {
    assert.equal(await bar(who).getByText(title, { exact: true }).count(), 0);
    await button(who, 'Determine winner').waitFor();
  }
  passed('Continue playing drops the result and resumes the same turn at Mentat pause');

  /* The observer's lobby still shows Ongoing, so the game returns to it live, without its result. */
  await lobbyCard(observer.page).waitFor({ timeout: 20_000 });
  assert.equal(await lobbyCard(observer.page).getByText(`${winner.name} won`).count(), 0);
  /* The observer still holds the finished game's frames, so its return waits for a fresh connection before reading the stage. */
  await observer.page.goto(`${origin}/play/${gameId}`, { waitUntil: 'domcontentloaded' });
  await until(
    () => observer.view().viewer.connectionId !== observerLeft,
    'The observer did not get a fresh connection.'
  );
  await observer.page.locator('[data-connection="authorized"]').waitFor();
  assert.equal(stage(observer), 'play');
  await observer.page.getByRole('group', { name: 'Table view' }).waitFor();
  await capture(observer, 'after-continue-1440x1000');
  passed('The continued game moves back to Ongoing in the lobby and opens in play');
}
