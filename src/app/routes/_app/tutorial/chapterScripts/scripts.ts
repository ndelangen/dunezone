import { alliancesAndTalking } from './alliancesAndTalking';
import { battle } from './battle';
import { bidding } from './bidding';
import { bringYourOwnPieces } from './bringYourOwnPieces';
import type { ChapterScript, LobbyChapterScript } from './chapterScript';
import { decksAndDealing } from './decksAndDealing';
import { draftAndTrade } from './draftAndTrade';
import { endingAGame } from './endingAGame';
import { findOrCreate } from './findOrCreate';
import { lookingAround } from './lookingAround';
import { moderation } from './moderation';
import { movingPieces } from './movingPieces';
import { phasesAndTurns } from './phasesAndTurns';
import { setup } from './setup';
import { takeASeat } from './takeASeat';
import { thePrivateSideTable } from './thePrivateSideTable';
import { welcome } from './welcome';
import { whatGoesWhere } from './whatGoesWhere';
import { windows } from './windows';
import { yourHandAndSpice } from './yourHandAndSpice';

/** The chapters built so far, by slug; every other chapter shows as coming soon. */
export const CHAPTER_SCRIPTS: Readonly<Record<string, ChapterScript | LobbyChapterScript>> = {
  [welcome.slug]: welcome,
  [findOrCreate.slug]: findOrCreate,
  [takeASeat.slug]: takeASeat,
  [draftAndTrade.slug]: draftAndTrade,
  [whatGoesWhere.slug]: whatGoesWhere,
  [lookingAround.slug]: lookingAround,
  [movingPieces.slug]: movingPieces,
  [decksAndDealing.slug]: decksAndDealing,
  [windows.slug]: windows,
  [yourHandAndSpice.slug]: yourHandAndSpice,
  [thePrivateSideTable.slug]: thePrivateSideTable,
  [setup.slug]: setup,
  [phasesAndTurns.slug]: phasesAndTurns,
  [bidding.slug]: bidding,
  [battle.slug]: battle,
  [alliancesAndTalking.slug]: alliancesAndTalking,
  [bringYourOwnPieces.slug]: bringYourOwnPieces,
  [endingAGame.slug]: endingAGame,
  [moderation.slug]: moderation,
};
