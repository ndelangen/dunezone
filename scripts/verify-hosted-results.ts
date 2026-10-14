import assert from 'node:assert/strict';

import type { Page } from 'playwright';

import { phaseAt } from '../src/shared/play/phases.ts';
import { describeResult } from '../src/shared/play/result.ts';
import type { HostedToolkit } from './verify-hosted-play-browser.ts';
import { required } from './verify-hosted-types.ts';
import type { HostedPeer } from './verify-hosted-types.ts';

/**
 * A real game played to a declared result and continued, through ordinary browser controls.
 * The native journeys prove the rules.
 * This flow proves the lobby, the Result tab and Continue playing in signed-in browsers.
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
}: HostedToolkit) {
  const { a, b, observer } = await seated();
  const everyone: HostedPeer[] = [a, b, observer];
  const stage = (who: HostedPeer) => required(who.view(), 'authorized view').snapshot.stage;
  /* The end of the game opens the Result tab once for every panel; the finished result also heads the phase chip. */
  const bar = (who: HostedPeer) =>
    who.page.getByRole('tabpanel').filter({ has: who.page.getByText(/^(Determine winner|Finished)$/u) });
  const header = (who: HostedPeer) => who.page.locator('.seated-header');
  const winner = factionOf(a);
  const gameId = currentGameId();
  const gamePath = new URL(a.page.url()).pathname;
  assert.notEqual(gamePath, `/play/${gameId}`);

  for (const who of everyone) {
    await openTab(who, 'Phase');
  }
  /* Determine winner is offered only during Mentat pause, where the turn's phases end. */
  while (phaseAt(required(a.view(), 'authorized view').snapshot.phase).id !== 'mentat-pause') {
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
  assert.equal(
    required(a.view(), 'authorized view').snapshot.ending?.by.seat,
    required(a.view(), 'authorized view').viewer.viewerSeat
  );
  const declared = bar(a);
  await declared.getByText('Declare the result', { exact: true }).waitFor();
  const name = required(required(a.view(), 'authorized view').snapshot.ending, 'ending').by.name;
  for (const who of [b, observer]) {
    await bar(who).getByText(`${name} is determining the winner`, { exact: true }).waitFor();
    assert.equal(await bar(who).getByRole('button', { name: 'Declare', exact: true }).count(), 0);
  }
  assert.equal(await button(b, 'Determine winner').count(), 0);
  assert.equal(await declared.getByRole('button', { name: 'Declare', exact: true }).isDisabled(), true);
  await capture(a, 'after-declare-result-tab-1440x1000');
  passed('Opening the sequence opens the Result tab: Declare for its player, their name on every other panel');

  await declared.getByRole('combobox', { name: 'Winning faction', exact: true }).click();
  await a.page.getByRole('option', { name: winner.name, exact: true }).click();
  await act(a, 'Declare');
  await until(
    () => everyone.every((who: HostedPeer) => stage(who) === 'finished'),
    'The declared result did not finish the game.'
  );
  await converged(everyone);
  const result = required(required(a.view(), 'authorized view').snapshot.result, 'game result');
  assert.equal(result.kind, 'faction');
  assert.deepEqual(result.factionIds, [winner.id]);
  const title = describeResult('faction', [winner.name]);
  for (const who of everyone) {
    await bar(who).getByText(title, { exact: true }).waitFor();
    await bar(who).getByText(`Declared by ${name}.`).waitFor();
  }
  for (const who of everyone) {
    await header(who).getByText(title, { exact: true }).waitFor();
  }
  /* Continue playing sits in the header where Next phase did. */
  await header(a).getByRole('button', { name: 'Continue playing', exact: true }).waitFor();
  await header(b).getByRole('button', { name: 'Continue playing', exact: true }).waitFor();
  assert.equal(await observer.page.getByRole('button', { name: 'Continue playing', exact: true }).count(), 0);
  await bar(observer)
    .getByText(/The table stays as it was\.$/u)
    .waitFor();
  assert.equal(required(observer.view(), 'authorized view').viewer.viewerSeat, spectator);
  await capture(b, 'after-finished-1440x1000');
  passed('Declaring a faction finishes the game for every panel; players may continue and the spectator may not');

  /* A reload re-admits into the finished game from the room's stored state, not from anything the page kept. */
  const reloadedFrom = required(b.view(), 'authorized view').viewer.connectionId;
  await b.page.reload({ waitUntil: 'domcontentloaded' });
  await until(
    () => required(b.view(), 'authorized view').viewer.connectionId !== reloadedFrom,
    'The reload did not get a fresh connection.'
  );
  await b.page.locator('[data-connection="authorized"]').waitFor();
  assert.equal(stage(b), 'finished');
  await bar(b).getByText(title, { exact: true }).waitFor();
  /* The reloaded panel opens on its default tab, so the Phase tab is chosen again for the checks after Continue playing. */
  await openTab(b, 'Phase');
  passed('A reloaded player re-enters the finished game with its declared result');

  /* The lobby shows one view at a time: its toolbar picks Ongoing, Yours or Finished, and each game is a card holding its Open link. */
  const lobbyCard = (page: Page) =>
    page
      .getByRole('list', { name: 'Games' })
      .getByRole('listitem')
      .filter({ has: page.locator(`a[href="${gamePath}"]`) });
  const showGames = async (page: Page, view: string) => {
    await page.locator('input[aria-label="Show games"]:visible').first().click();
    await page.getByRole('option', { name: new RegExp(`^${view}`) }).click();
  };
  const observerLeft = required(observer.view(), 'authorized view').viewer.connectionId;
  await observer.page.goto(`${origin}/play`, { waitUntil: 'domcontentloaded' });
  await observer.page.getByRole('heading', { name: 'Play Dune!' }).waitFor();
  await showGames(observer.page, 'Finished');
  await lobbyCard(observer.page).getByText(`${winner.name} won`).waitFor({ timeout: 20_000 });
  assert.equal(await lobbyCard(observer.page).getByRole('link').getAttribute('href'), gamePath);
  await capture(observer, 'after-lobby-past-1440x1000');
  await showGames(observer.page, 'Ongoing');
  assert.equal(await lobbyCard(observer.page).count(), 0);
  passed('The lobby lists the finished game under Finished with its winner, and not under Ongoing');

  await act(b, 'Continue playing');
  await until(() => [a, b].every((who: HostedPeer) => stage(who) === 'play'), 'Continue playing did not resume play.');
  await converged([a, b]);
  assert.equal(required(a.view(), 'authorized view').snapshot.result ?? null, null);
  assert.equal(phaseAt(required(a.view(), 'authorized view').snapshot.phase).id, 'mentat-pause');
  for (const who of [a, b]) {
    assert.equal(await header(who).getByText(title, { exact: true }).count(), 0);
    /* The Result tab closes with the result and the panel returns to the tab it opened over; Phase is chosen again so the check does not depend on which. */
    await openTab(who, 'Phase');
    await button(who, 'Determine winner').waitFor();
  }
  passed('Continue playing drops the result and resumes the same turn at Mentat pause');

  /* The observer's lobby still shows Ongoing, so the game returns to it live, without its result. */
  await lobbyCard(observer.page).waitFor({ timeout: 20_000 });
  assert.equal(await lobbyCard(observer.page).getByText(`${winner.name} won`).count(), 0);
  /* The observer still holds the finished game's frames, so its return waits for a fresh connection before reading the stage. */
  await lobbyCard(observer.page).getByRole('link').click();
  await until(
    () => required(observer.view(), 'authorized view').viewer.connectionId !== observerLeft,
    'The observer did not get a fresh connection.'
  );
  await observer.page.locator('[data-connection="authorized"]').waitFor();
  assert.equal(stage(observer), 'play');
  await observer.page.getByRole('group', { name: 'Table view' }).waitFor();
  await capture(observer, 'after-continue-1440x1000');
  passed('The continued game moves back to Ongoing in the lobby and opens in play');
}
