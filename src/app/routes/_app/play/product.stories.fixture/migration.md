# Play story migration

The stories render the product lobby, creation and game routes. The temporary runtime routes stay
until their verifier and tooling consumers move under #1296.

| Previous file | Story | Destination or retained behavior |
| --- | --- | --- |
| `$gameId.route.stories.tsx` | NotForMembers | Create/NotForMembers |
| `$gameId.route.stories.tsx` | Preparing | Create/Preparing |
| `$gameId.route.stories.tsx` | CatalogueRefused | Create/CatalogueRefused |
| `$gameId.route.stories.tsx` | ProvisionTimedOut | Create/ProvisionTimedOut |
| `$gameId.route.stories.tsx` | Drafting | Drafting/WaitingForPlayers |
| `$gameId.route.stories.tsx` | DraftingMidway | Drafting/ChoosingFactions |
| `$gameId.route.stories.tsx` | DraftingSpectator | Drafting/Observer |
| `$gameId.route.stories.tsx` | DraftingPoolTooShort | Drafting/InsufficientFactionPool |
| `$gameId.route.stories.tsx` | SpectatorAsksForASeat | Drafting/SpectatorAsksForASeat |
| `$gameId.route.stories.tsx` | WaitingForApproval | Drafting/WaitingForApproval |
| `$gameId.route.stories.tsx` | PlayerApprovesARequest | Drafting/PlayerApprovesARequest |
| `$gameId.route.stories.tsx` | PlayerLeavesTheGame | Drafting/PlayerLeavesTheGame |
| `$gameId.route.stories.tsx` | SpectatorGameMenu | Drafting/SpectatorGameMenu |
| `$gameId.route.stories.tsx` | Discarded | Drafting/Discarded |
| `$gameId.route.stories.tsx` | Swapping | Swapping/Swapping |
| `$gameId.route.stories.tsx` | TradingOffers | Swapping/TradingOffers |
| `$gameId.route.stories.tsx` | TradingEndedWithVacancy | Swapping/TradingEndedWithVacancy |
| `$gameId.route.stories.tsx` | Setup | Setup/TraitorSelection |
| `$gameId.route.stories.tsx` | SetupForces | Setup/StartingForces |
| `$gameId.route.stories.tsx` | SetupPrediction | Setup/Prediction |
| `$gameId.route.stories.tsx` | SetupPredictionLocked | Setup/LockedPrediction |
| `$gameId.route.stories.tsx` | RemovalVoting | Playing/RemovalVoting |
| `$gameId.route.stories.tsx` | LogGame | Playing/LogGame |
| `$gameId.route.stories.tsx` | LogAudit | Playing/LogAudit |
| `$gameId.route.stories.tsx` | LogPagination | Playing/LogPagination |
| `$gameId.route.stories.tsx` | RemovalResolution | Playing/RemovalResolution |
| `$gameId.route.stories.tsx` | RemovalRejected | Playing/RemovalRejected |
| `$gameId.route.stories.tsx` | ConversationHistory | Playing/ConversationHistory |
| `$gameId.route.stories.tsx` | ConversationDelivery | Playing/ConversationDelivery |
| `$gameId.route.stories.tsx` | ConversationOffline | Playing/ConversationOffline |
| `hosted.route.stories.tsx` | SignedOut | Lobby / Signed out and Create / Signed out retain product access checks. The hosted login launcher is temporary. |
| `hosted.route.stories.tsx` | SignedInBeforeProvisioning | Create / Administrator and Create / Preparing retain catalogue and provisioning states. |
| `hosted.route.stories.tsx` | Connecting | Playing/Connecting |
| `hosted.route.stories.tsx` | ConnectingStill | Playing/ConnectingStill |
| `hosted.route.stories.tsx` | SharedPhaseControls | Playing/SharedPhaseControls |
| `hosted.route.stories.tsx` | ObserverPhaseControls | Playing/ObserverPhaseControls |
| `hosted.route.stories.tsx` | PlaybackKeepsLivePhaseSeparate | Playing/PlaybackKeepsLivePhaseSeparate |
| `hosted.route.stories.tsx` | MentatReadiness | Playing/MentatReadiness |
| `hosted.route.stories.tsx` | PhaseCooldown | Playing/PhaseCooldown |
| `hosted.route.stories.tsx` | SharedInventoryRequests | Playing/SharedInventoryRequests |
| `hosted.route.stories.tsx` | SharedInventoryNarrow | Playing/SharedInventoryNarrow |
| `hosted.route.stories.tsx` | ControlsPanelTabs | Playing/ControlsPanelTabs |
| `hosted.route.stories.tsx` | PanelSchemeIsland | Playing/PanelSchemeIsland |
| `hosted.route.stories.tsx` | CatalogueAdmission | Create / Administrator and Create / Catalogue refused retain readiness failures. The fixture-specific hosted launcher retires. |
| `hosted.route.stories.tsx` | PrivateFactionBank | Playing/Controls |
| `hosted.route.stories.tsx` | PublicSpiceHistory | Playing / Log game retains public spice history through the product log. |
| `hosted.route.stories.tsx` | PrivateBankNarrow | Playing/ControlsNarrow |
| `hosted.route.stories.tsx` | DreamrulesTreacheryDeck | Playing/TreacheryDeck |
| `hosted.route.stories.tsx` | HiddenDeckBacks | Playing/HiddenDeckBacks |
| `hosted.route.stories.tsx` | BattleCalloutBelowNorthernTerritory | Playing/Battles/BattleCalloutBelowNorthernTerritory |
| `hosted.route.stories.tsx` | BattleCalloutAboveSouthernTerritory | Playing/Battles/BattleCalloutAboveSouthernTerritory |
| `hosted.route.stories.tsx` | BattleUnclaimed | Playing/Battles/BattleUnclaimed |
| `hosted.route.stories.tsx` | BattleOneClaimed | Playing/Battles/BattleOneClaimed |
| `hosted.route.stories.tsx` | BattleReadiness | Playing/Battles/BattleReadiness |
| `hosted.route.stories.tsx` | BattlePlanner | Playing/Battles/BattlePlanner |
| `hosted.route.stories.tsx` | BattleReady | Playing/Battles/BattleReady |
| `hosted.route.stories.tsx` | BattleSpiceBound | Playing/Battles/BattleSpiceBound |
| `hosted.route.stories.tsx` | BattleCustomSpiceBound | Playing/Battles/BattleCustomSpiceBound |
| `hosted.route.stories.tsx` | BattleCountdown | Playing/Battles/BattleCountdown |
| `hosted.route.stories.tsx` | BattleObserver | Playing/Battles/BattleObserver |
| `hosted.route.stories.tsx` | BattleRevealedPieces | Playing/Battles/BattleRevealedPieces |
| `hosted.route.stories.tsx` | BattleNumericDraft | Playing/Battles/BattleNumericDraft |
| `hosted.route.stories.tsx` | BattleResolved | Playing/Battles/BattleResolved |
| `hosted.route.stories.tsx` | EighteenSeats | `Play/Drafting/Eighteen seats`: an eighteen-seat table with six real players and twelve vacancies retains the crowded-layout check. |
| `hosted.route.stories.tsx` | PrivateDrawAndDeal | Playing/PrivateDrawAndDeal |
| `demo.route.stories.tsx` | OpensThroughAnIris | Playing / Opens through an iris |
| `demo.route.stories.tsx` | OpensStill | Playing / Opens still |
| `demo.route.stories.tsx` | TableControls | Playing / Table controls |

The existing lobby and creation stories retain their access and directory checks with the common
production-derived fixtures. Battle page stories retain planning, privacy, controls, readiness,
countdown and placement checks; the BattleWheel component stories continue to own its visual matrix.

The demo SignedOut story folds into Playing / TableControls for the table shell and the Lobby / SignedOut access story. The phase story retains navigation and history checks; its fixture-only Flip debug control is absent from real-game phase panels.
