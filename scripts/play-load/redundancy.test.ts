import assert from 'node:assert/strict';

import { expect, test } from 'vitest';
import { z } from 'zod';

import type { PublicCarry, PublicPointer, SnapshotChange, ActivityChange } from '../../src/shared/play/protocol.ts';
import type { UpdateMessage, ViewMessage } from './types.ts';

type TablePiece = ReturnType<typeof tablePieceSchema.parse>;

import { tablePieceSchema } from '../../src/shared/play/schema.ts';
import { applyRoomUpdate, frameChange } from '../../src/shared/play/updates.ts';
import { sizeUpdate, updateLedger } from './redundancy.ts';

const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
const item = (id: string, faceUp = false) => ({
  id,
  faceUp,
  artwork: {
    front: `https://cdn.example.invalid/${id}-front.png`,
    back: 'https://cdn.example.invalid/back.png',
    type: 'card',
  },
});
const piece = (id: string, extra = {}) =>
  tablePieceSchema.parse({
    id,
    label: `Piece ${id}`,
    owner: 'shared',
    color: '#123456',
    accent: '#abcdef',
    items: [item(`${id}-1`), item(`${id}-2`)],
    stackKey: null,
    position: [0.1, 0.2, 0],
    orientation: 0,
    zoneId: null,
    locked: false,
    kind: 'card',
    ...extra,
  });
const event = (id: string) => ({ id, command: 'move', message: `Moved ${id}`, status: 'accepted' as const });
const identity = (connectionId: string) => ({ connectionId, viewerSeat: 'seat-1', displayName: 'Paul', color: '#0f0' });
const pointer = (connectionId: string, x: number): PublicPointer => ({
  ...identity(connectionId),
  position: [x, 0.5, 0],
  updatedAt: 10,
});
const carry = (id: string, held: TablePiece): PublicCarry => ({
  ...identity(`${id}-conn`),
  id,
  held,
  withdrawnCounts: {},
  reservedIds: [],
  expiresAt: 1000,
  sourceSeq: 3,
});
const events = Array.from({ length: 8 }, (_, index) => event(`e${index + 1}`));
const view = (): ViewMessage => ({
  type: 'view',
  epoch: 'e1',
  sequence: 4,
  viewer: { ...identity('viewer'), userId: 'u1' },
  snapshot: {
    revision: 7,
    phase: 2,
    versions: { a: 1, b: 1, c: 1 },
    table: {
      stormSectorIndex: 3,
      pieces: [piece('a'), piece('b'), piece('c')],
      events,
      nextEventNumber: 9,
    },
  },
  carries: [carry('c1', piece('held'))],
  pointers: [pointer('p1', 0.1), pointer('p2', 0.2)],
});
const noActivity = (): ActivityChange => ({
  carries: [],
  carryMoves: [],
  removedCarries: [],
  pointers: [],
  pointerMoves: [],
  removedPointers: [],
});
const noSnapshot = (): SnapshotChange => ({
  baseRevision: 7,
  revision: 8,
  phase: 2,
  table: {},
  pieces: [],
  removedPieces: [],
  versions: {},
  removedVersions: [],
});
const update = (extra: Partial<UpdateMessage> = {}): UpdateMessage => ({
  type: 'update',
  epoch: 'e1',
  baseSequence: 4,
  sequence: 5,
  activity: noActivity(),
  ...extra,
  phaseCooldownMs: 0,
  battleCountdownMs: 0,
});
/** The envelope a patch message would carry: what the room sent without the two changes, plus the revisions. */
const envelope = (message: UpdateMessage) => {
  const { snapshot, activity: _activity, ...sent } = message;
  return { ...sent, ...(snapshot ? { baseRevision: snapshot.baseRevision, revision: snapshot.revision } : {}) };
};
const KEY = 12;
const sized = (message: {
  type: 'update';
  epoch: string;
  baseSequence: number;
  sequence: number;
  activity: {
    carries: {
      connectionId: string;
      viewerSeat: string;
      displayName: string;
      color: string;
      id: string;
      held: {
        id: string;
        label: string;
        owner: string;
        color: string;
        accent: string;
        stackKey: string | null;
        position: [number, number, number];
        orientation: number;
        zoneId: string | null;
        locked: boolean;
        kind: 'card' | 'force' | 'marker';
        items: {
          id: string;
          faceUp: boolean;
          peekedBy?: string[] | undefined;
          artwork?:
            | {
                back: string;
                type: string;
                front?: string | undefined;
                backName?: string | undefined;
                name?: string | undefined;
                size?: number | undefined;
                prediction?: { stepId: string; factionId: string; turn: number } | undefined;
              }
            | {
                back: string;
                backName?: string | undefined;
                front?: undefined;
                name?: undefined;
                type?: undefined;
                size?: undefined;
                prediction?: undefined;
              }
            | undefined;
        }[];
        inventory?: 'shared' | undefined;
        hiddenZone?: { x: number; y: number } | undefined;
        battleOverlay?: string | undefined;
        flipRevision?: number | undefined;
        shuffleRevision?: number | undefined;
      };
      withdrawnCounts: Record<string, number>;
      reservedIds: string[];
      expiresAt: number;
      avatarUrl?: string | null | undefined;
      sourceSeq?: number | undefined;
    }[];
    carryMoves: {
      id: string;
      position: [number, number, number];
      orientation: number;
      expiresAt: number;
      sourceSeq?: number | undefined;
    }[];
    removedCarries: string[];
    pointers: {
      connectionId: string;
      viewerSeat: string;
      displayName: string;
      color: string;
      position: [number, number, number];
      updatedAt: number;
      avatarUrl?: string | null | undefined;
      sourceSeq?: number | undefined;
    }[];
    pointerMoves: {
      connectionId: string;
      position: [number, number, number];
      updatedAt: number;
      sourceSeq?: number | undefined;
    }[];
    removedPointers: string[];
  };
  phaseCooldownMs?: number | undefined;
  battleCountdownMs?: number | undefined;
  historySteps?: number | undefined;
  snapshot?:
    | {
        table: {
          stormSectorIndex?: number | undefined;
          nextEventNumber?: number | undefined;
          events?: { id: string; command: string; message: string; status: 'accepted' | 'rejected' }[] | undefined;
        };
        pieces: {
          id: string;
          label: string;
          owner: string;
          color: string;
          accent: string;
          stackKey: string | null;
          position: [number, number, number];
          orientation: number;
          zoneId: string | null;
          locked: boolean;
          kind: 'card' | 'force' | 'marker';
          items: {
            id: string;
            faceUp: boolean;
            peekedBy?: string[] | undefined;
            artwork?:
              | {
                  back: string;
                  type: string;
                  front?: string | undefined;
                  backName?: string | undefined;
                  name?: string | undefined;
                  size?: number | undefined;
                  prediction?: { stepId: string; factionId: string; turn: number } | undefined;
                }
              | {
                  back: string;
                  backName?: string | undefined;
                  front?: undefined;
                  name?: undefined;
                  type?: undefined;
                  size?: undefined;
                  prediction?: undefined;
                }
              | undefined;
          }[];
          inventory?: 'shared' | undefined;
          hiddenZone?: { x: number; y: number } | undefined;
          battleOverlay?: string | undefined;
          flipRevision?: number | undefined;
          shuffleRevision?: number | undefined;
        }[];
        removedPieces: string[];
        versions: Record<string, number>;
        removedVersions: string[];
        baseRevision: number;
        revision: number;
        phase: number;
        pieceMoves?:
          | {
              id: string;
              position: [number, number, number];
              orientation: number;
              zoneId: string | null;
              flipRevision: number | null;
            }[]
          | undefined;
        pieceOrder?: string[] | undefined;
        battle?:
          | {
              id: string;
              anchor: [number, number, number];
              territory: string;
              stage: 'preparing' | 'countdown' | 'revealed';
              sides: [
                { factionId: string; ready: boolean; choice: 'none' | 'left' | 'right' | null } | null,
                { factionId: string; ready: boolean; choice: 'none' | 'left' | 'right' | null } | null,
              ];
              deadline: number | null;
              revealed?:
                | [
                    {
                      mode: 'custom' | 'max';
                      troops: { faceId: string; undialed: number; dialed: number }[];
                      spice: number;
                      adjustment: number;
                      leaderId: string | null;
                      cardIds: string[];
                      strength: number;
                      pieces: {
                        id: string;
                        label: string;
                        owner: string;
                        color: string;
                        accent: string;
                        stackKey: string | null;
                        position: [number, number, number];
                        orientation: number;
                        zoneId: string | null;
                        locked: boolean;
                        kind: 'card' | 'force' | 'marker';
                        items: {
                          id: string;
                          faceUp: boolean;
                          peekedBy?: string[] | undefined;
                          artwork?:
                            | {
                                back: string;
                                type: string;
                                front?: string | undefined;
                                backName?: string | undefined;
                                name?: string | undefined;
                                size?: number | undefined;
                                prediction?: { stepId: string; factionId: string; turn: number } | undefined;
                              }
                            | {
                                back: string;
                                backName?: string | undefined;
                                front?: undefined;
                                name?: undefined;
                                type?: undefined;
                                size?: undefined;
                                prediction?: undefined;
                              }
                            | undefined;
                        }[];
                        inventory?: 'shared' | undefined;
                        hiddenZone?: { x: number; y: number } | undefined;
                        battleOverlay?: string | undefined;
                        flipRevision?: number | undefined;
                        shuffleRevision?: number | undefined;
                      }[];
                      faces: {
                        id: string;
                        name: string;
                        capable: boolean;
                        strength: number;
                        supportedStrength: number;
                        supportCost: number;
                        image?: string | undefined;
                      }[];
                      disclosed: { leader: boolean; dial: boolean; cardIds: string[] };
                    },
                    {
                      mode: 'custom' | 'max';
                      troops: { faceId: string; undialed: number; dialed: number }[];
                      spice: number;
                      adjustment: number;
                      leaderId: string | null;
                      cardIds: string[];
                      strength: number;
                      pieces: {
                        id: string;
                        label: string;
                        owner: string;
                        color: string;
                        accent: string;
                        stackKey: string | null;
                        position: [number, number, number];
                        orientation: number;
                        zoneId: string | null;
                        locked: boolean;
                        kind: 'card' | 'force' | 'marker';
                        items: {
                          id: string;
                          faceUp: boolean;
                          peekedBy?: string[] | undefined;
                          artwork?:
                            | {
                                back: string;
                                type: string;
                                front?: string | undefined;
                                backName?: string | undefined;
                                name?: string | undefined;
                                size?: number | undefined;
                                prediction?: { stepId: string; factionId: string; turn: number } | undefined;
                              }
                            | {
                                back: string;
                                backName?: string | undefined;
                                front?: undefined;
                                name?: undefined;
                                type?: undefined;
                                size?: undefined;
                                prediction?: undefined;
                              }
                            | undefined;
                        }[];
                        inventory?: 'shared' | undefined;
                        hiddenZone?: { x: number; y: number } | undefined;
                        battleOverlay?: string | undefined;
                        flipRevision?: number | undefined;
                        shuffleRevision?: number | undefined;
                      }[];
                      faces: {
                        id: string;
                        name: string;
                        capable: boolean;
                        strength: number;
                        supportedStrength: number;
                        supportCost: number;
                        image?: string | undefined;
                      }[];
                      disclosed: { leader: boolean; dial: boolean; cardIds: string[] };
                    },
                  ]
                | undefined;
              disclosed?:
                | [
                    {
                      cards: {
                        id: string;
                        label: string;
                        owner: string;
                        color: string;
                        accent: string;
                        stackKey: string | null;
                        position: [number, number, number];
                        orientation: number;
                        zoneId: string | null;
                        locked: boolean;
                        kind: 'card' | 'force' | 'marker';
                        items: {
                          id: string;
                          faceUp: boolean;
                          peekedBy?: string[] | undefined;
                          artwork?:
                            | {
                                back: string;
                                type: string;
                                front?: string | undefined;
                                backName?: string | undefined;
                                name?: string | undefined;
                                size?: number | undefined;
                                prediction?: { stepId: string; factionId: string; turn: number } | undefined;
                              }
                            | {
                                back: string;
                                backName?: string | undefined;
                                front?: undefined;
                                name?: undefined;
                                type?: undefined;
                                size?: undefined;
                                prediction?: undefined;
                              }
                            | undefined;
                        }[];
                        inventory?: 'shared' | undefined;
                        hiddenZone?: { x: number; y: number } | undefined;
                        battleOverlay?: string | undefined;
                        flipRevision?: number | undefined;
                        shuffleRevision?: number | undefined;
                      }[];
                      leader?:
                        | {
                            id: string;
                            label: string;
                            owner: string;
                            color: string;
                            accent: string;
                            stackKey: string | null;
                            position: [number, number, number];
                            orientation: number;
                            zoneId: string | null;
                            locked: boolean;
                            kind: 'card' | 'force' | 'marker';
                            items: {
                              id: string;
                              faceUp: boolean;
                              peekedBy?: string[] | undefined;
                              artwork?:
                                | {
                                    back: string;
                                    type: string;
                                    front?: string | undefined;
                                    backName?: string | undefined;
                                    name?: string | undefined;
                                    size?: number | undefined;
                                    prediction?: { stepId: string; factionId: string; turn: number } | undefined;
                                  }
                                | {
                                    back: string;
                                    backName?: string | undefined;
                                    front?: undefined;
                                    name?: undefined;
                                    type?: undefined;
                                    size?: undefined;
                                    prediction?: undefined;
                                  }
                                | undefined;
                            }[];
                            inventory?: 'shared' | undefined;
                            hiddenZone?: { x: number; y: number } | undefined;
                            battleOverlay?: string | undefined;
                            flipRevision?: number | undefined;
                            shuffleRevision?: number | undefined;
                          }
                        | undefined;
                      dial?: { strength: number } | undefined;
                    } | null,
                    {
                      cards: {
                        id: string;
                        label: string;
                        owner: string;
                        color: string;
                        accent: string;
                        stackKey: string | null;
                        position: [number, number, number];
                        orientation: number;
                        zoneId: string | null;
                        locked: boolean;
                        kind: 'card' | 'force' | 'marker';
                        items: {
                          id: string;
                          faceUp: boolean;
                          peekedBy?: string[] | undefined;
                          artwork?:
                            | {
                                back: string;
                                type: string;
                                front?: string | undefined;
                                backName?: string | undefined;
                                name?: string | undefined;
                                size?: number | undefined;
                                prediction?: { stepId: string; factionId: string; turn: number } | undefined;
                              }
                            | {
                                back: string;
                                backName?: string | undefined;
                                front?: undefined;
                                name?: undefined;
                                type?: undefined;
                                size?: undefined;
                                prediction?: undefined;
                              }
                            | undefined;
                        }[];
                        inventory?: 'shared' | undefined;
                        hiddenZone?: { x: number; y: number } | undefined;
                        battleOverlay?: string | undefined;
                        flipRevision?: number | undefined;
                        shuffleRevision?: number | undefined;
                      }[];
                      leader?:
                        | {
                            id: string;
                            label: string;
                            owner: string;
                            color: string;
                            accent: string;
                            stackKey: string | null;
                            position: [number, number, number];
                            orientation: number;
                            zoneId: string | null;
                            locked: boolean;
                            kind: 'card' | 'force' | 'marker';
                            items: {
                              id: string;
                              faceUp: boolean;
                              peekedBy?: string[] | undefined;
                              artwork?:
                                | {
                                    back: string;
                                    type: string;
                                    front?: string | undefined;
                                    backName?: string | undefined;
                                    name?: string | undefined;
                                    size?: number | undefined;
                                    prediction?: { stepId: string; factionId: string; turn: number } | undefined;
                                  }
                                | {
                                    back: string;
                                    backName?: string | undefined;
                                    front?: undefined;
                                    name?: undefined;
                                    type?: undefined;
                                    size?: undefined;
                                    prediction?: undefined;
                                  }
                                | undefined;
                            }[];
                            inventory?: 'shared' | undefined;
                            hiddenZone?: { x: number; y: number } | undefined;
                            battleOverlay?: string | undefined;
                            flipRevision?: number | undefined;
                            shuffleRevision?: number | undefined;
                          }
                        | undefined;
                      dial?: { strength: number } | undefined;
                    } | null,
                  ]
                | undefined;
            }
          | null
          | undefined;
        bidding?:
          | {
              seconds: number;
              timed: boolean;
              started: boolean;
              stage: 'idle' | 'open' | 'won' | 'unclaimed';
              round: number;
              opener: string | null;
              turn: string | null;
              bid: { factionId: string; amount: number } | null;
              passed: string[];
              deadline: number | null;
            }
          | null
          | undefined;
        draft?:
          | {
              minimum: number;
              factions: {
                id: string;
                slug: string;
                name: string;
                logo:
                  | '/vector/logo/antler-tower.svg'
                  | '/vector/logo/atreides.svg'
                  | '/vector/logo/bene-gesserit.svg'
                  | '/vector/logo/bene-tleilaxu.svg'
                  | '/vector/logo/blade-bridge.svg'
                  | '/vector/logo/broken-spear.svg'
                  | '/vector/logo/caravan-arch.svg'
                  | '/vector/logo/carryall-wing.svg'
                  | '/vector/logo/choam.svg'
                  | '/vector/logo/cinder-phoenix.svg'
                  | '/vector/logo/closed-helm.svg'
                  | '/vector/logo/cog-sun.svg'
                  | '/vector/logo/coil-viper.svg'
                  | '/vector/logo/crescent-blade.svg'
                  | '/vector/logo/crown-anvil.svg'
                  | '/vector/logo/crowned-ibex.svg'
                  | '/vector/logo/desert-hare.svg'
                  | '/vector/logo/dew-cistern.svg'
                  | '/vector/logo/dune-crab.svg'
                  | '/vector/logo/dune-jackal.svg'
                  | '/vector/logo/ecaz.svg'
                  | '/vector/logo/eclipse-lotus.svg'
                  | '/vector/logo/emperor.svg'
                  | '/vector/logo/falcon-gauntlet.svg'
                  | '/vector/logo/foldspace-knot.svg'
                  | '/vector/logo/fremen.svg'
                  | '/vector/logo/ginaz.svg'
                  | '/vector/logo/glass-owl.svg'
                  | '/vector/logo/guild.svg'
                  | '/vector/logo/gyroscope-seal.svg'
                  | '/vector/logo/hagal.svg'
                  | '/vector/logo/harkonnen.svg'
                  | '/vector/logo/heighliner-gate.svg'
                  | '/vector/logo/hooded-raven.svg'
                  | '/vector/logo/horned-bat.svg'
                  | '/vector/logo/iduali.svg'
                  | '/vector/logo/iron-tortoise.svg'
                  | '/vector/logo/ixian.svg'
                  | '/vector/logo/memory-tree.svg'
                  | '/vector/logo/merchant-seal.svg'
                  | '/vector/logo/mirror-array.svg'
                  | '/vector/logo/moon-moth.svg'
                  | '/vector/logo/moritani.svg'
                  | '/vector/logo/mountain-throne.svg'
                  | '/vector/logo/null-vault.svg'
                  | '/vector/logo/oath-chain.svg'
                  | '/vector/logo/obsidian-mantis.svg'
                  | '/vector/logo/oracle-eye.svg'
                  | '/vector/logo/orbital-spindle.svg'
                  | '/vector/logo/pilgrim-lantern.svg'
                  | '/vector/logo/prism-engine.svg'
                  | '/vector/logo/reed-crane.svg'
                  | '/vector/logo/richese.svg'
                  | '/vector/logo/root-reservoir.svg'
                  | '/vector/logo/sabre-cat.svg'
                  | '/vector/logo/sail-fin.svg'
                  | '/vector/logo/salt-crystal.svg'
                  | '/vector/logo/salt-scarab.svg'
                  | '/vector/logo/sand-hourglass.svg'
                  | '/vector/logo/sand-ray.svg'
                  | '/vector/logo/sentinel-key.svg'
                  | '/vector/logo/sietch-well.svg'
                  | '/vector/logo/signal-fork.svg'
                  | '/vector/logo/sirocco-raptor.svg'
                  | '/vector/logo/spice-chalice.svg'
                  | '/vector/logo/spice-fox.svg'
                  | '/vector/logo/spice-refinery.svg'
                  | '/vector/logo/stone-bison.svg'
                  | '/vector/logo/storm-compass.svg'
                  | '/vector/logo/sun-bastion.svg'
                  | '/vector/logo/sun-cobra.svg'
                  | '/vector/logo/sun-shutter.svg'
                  | '/vector/logo/thorn-bloom.svg'
                  | '/vector/logo/thorn-cactus.svg'
                  | '/vector/logo/thorn-frog.svg'
                  | '/vector/logo/triple-axe.svg'
                  | '/vector/logo/twin-flame.svg'
                  | '/vector/logo/twin-moons.svg'
                  | '/vector/logo/veiled-mask.svg'
                  | '/vector/logo/water-clasp.svg'
                  | '/vector/logo/whisper-hand.svg'
                  | '/vector/logo/worm-crown.svg'
                  | '/vector/logo/worm-hook.svg'
                  | '/vector/generic/6star.svg'
                  | '/vector/generic/8472.svg'
                  | '/vector/generic/8point.svg'
                  | '/vector/generic/alliance.svg'
                  | '/vector/generic/ancient.svg'
                  | '/vector/generic/apophis.svg'
                  | '/vector/generic/argos.svg'
                  | '/vector/generic/arrowbox.svg'
                  | '/vector/generic/arrows.svg'
                  | '/vector/generic/asterisk.svg'
                  | '/vector/generic/atreiblock.svg'
                  | '/vector/generic/axes.svg'
                  | '/vector/generic/balance.svg'
                  | '/vector/generic/ball.svg'
                  | '/vector/generic/barge.svg'
                  | '/vector/generic/biggle.svg'
                  | '/vector/generic/biohazard.svg'
                  | '/vector/generic/bird.svg'
                  | '/vector/generic/birdban.svg'
                  | '/vector/generic/blad.svg'
                  | '/vector/generic/blades.svg'
                  | '/vector/generic/blob.svg'
                  | '/vector/generic/bluks.svg'
                  | '/vector/generic/bones.svg'
                  | '/vector/generic/borg.svg'
                  | '/vector/generic/bows.svg'
                  | '/vector/generic/box.svg'
                  | '/vector/generic/breen.svg'
                  | '/vector/generic/broke.svg'
                  | '/vector/generic/bug.svg'
                  | '/vector/generic/bull.svg'
                  | '/vector/generic/ceasar.svg'
                  | '/vector/generic/cerberus.svg'
                  | '/vector/generic/chaom.svg'
                  | '/vector/generic/chip.svg'
                  | '/vector/generic/choppers.svg'
                  | '/vector/generic/clover.svg'
                  | '/vector/generic/community.svg'
                  | '/vector/generic/connect.svg'
                  | '/vector/generic/corrino.svg'
                  | '/vector/generic/council.svg'
                  | '/vector/generic/cpu.svg'
                  | '/vector/generic/crift.svg'
                  | '/vector/generic/cross.svg'
                  | '/vector/generic/crosstripes.svg'
                  | '/vector/generic/cyclo.svg'
                  | '/vector/generic/da7.svg'
                  | '/vector/generic/daggers.svg'
                  | '/vector/generic/def.svg'
                  | '/vector/generic/dello.svg'
                  | '/vector/generic/denobula.svg'
                  | '/vector/generic/detector.svg'
                  | '/vector/generic/deteis.svg'
                  | '/vector/generic/diamond.svg'
                  | '/vector/generic/diode.svg'
                  | '/vector/generic/dominion.svg'
                  | '/vector/generic/dp.svg'
                  | '/vector/generic/effect.svg'
                  | '/vector/generic/egg.svg'
                  | '/vector/generic/elaurian.svg'
                  | '/vector/generic/electronic.svg'
                  | '/vector/generic/emiron.svg'
                  | '/vector/generic/emperiskull.svg'
                  | '/vector/generic/encircl.svg'
                  | '/vector/generic/entor.svg'
                  | '/vector/generic/exclamation.svg'
                  | '/vector/generic/fear.svg'
                  | '/vector/generic/federation.svg'
                  | '/vector/generic/ferengi.svg'
                  | '/vector/generic/fire.svg'
                  | '/vector/generic/fishspeekers.svg'
                  | '/vector/generic/flauqre.svg'
                  | '/vector/generic/fly.svg'
                  | '/vector/generic/force.svg'
                  | '/vector/generic/fremball.svg'
                  | '/vector/generic/gate.svg'
                  | '/vector/generic/gdi1.svg'
                  | '/vector/generic/gdi2.svg'
                  | '/vector/generic/gdi3.svg'
                  | '/vector/generic/gdi4.svg'
                  | '/vector/generic/gdi6.svg'
                  | '/vector/generic/gear.svg'
                  | '/vector/generic/gearos.svg'
                  | '/vector/generic/glimmer.svg'
                  | '/vector/generic/goededag.svg'
                  | '/vector/generic/graph.svg'
                  | '/vector/generic/gring.svg'
                  | '/vector/generic/guard.svg'
                  | '/vector/generic/guildeyes.svg'
                  | '/vector/generic/hammer.svg'
                  | '/vector/generic/harkoring.svg'
                  | '/vector/generic/here.svg'
                  | '/vector/generic/hex.svg'
                  | '/vector/generic/hexes.svg'
                  | '/vector/generic/hirogen.svg'
                  | '/vector/generic/horse.svg'
                  | '/vector/generic/hurus.svg'
                  | '/vector/generic/ice.svg'
                  | '/vector/generic/infiniguild.svg'
                  | '/vector/generic/info.svg'
                  | '/vector/generic/inter.svg'
                  | '/vector/generic/jarje.svg'
                  | '/vector/generic/keys.svg'
                  | '/vector/generic/klingon.svg'
                  | '/vector/generic/krenim.svg'
                  | '/vector/generic/landsraad.svg'
                  | '/vector/generic/lantern.svg'
                  | '/vector/generic/laser.svg'
                  | '/vector/generic/leader-skills.svg'
                  | '/vector/generic/league.svg'
                  | '/vector/generic/lifting.svg'
                  | '/vector/generic/lishen.svg'
                  | '/vector/generic/llc1.svg'
                  | '/vector/generic/llc10.svg'
                  | '/vector/generic/llc11.svg'
                  | '/vector/generic/llc12.svg'
                  | '/vector/generic/llc13.svg'
                  | '/vector/generic/llc2.svg'
                  | '/vector/generic/llc4.svg'
                  | '/vector/generic/llc5.svg'
                  | '/vector/generic/llc6.svg'
                  | '/vector/generic/llc7.svg'
                  | '/vector/generic/llc8.svg'
                  | '/vector/generic/llc9.svg'
                  | '/vector/generic/magnet.svg'
                  | '/vector/generic/malon.svg'
                  | '/vector/generic/marker.svg'
                  | '/vector/generic/matres.svg'
                  | '/vector/generic/memory.svg'
                  | '/vector/generic/mercenaries.svg'
                  | '/vector/generic/mesh.svg'
                  | '/vector/generic/microblock.svg'
                  | '/vector/generic/moritani.svg'
                  | '/vector/generic/mortal.svg'
                  | '/vector/generic/mural1.svg'
                  | '/vector/generic/mural2.svg'
                  | '/vector/generic/mural3.svg'
                  | '/vector/generic/mural4.svg'
                  | '/vector/generic/nightsky.svg'
                  | '/vector/generic/nobles.svg'
                  | '/vector/generic/nod.svg'
                  | '/vector/generic/nuke.svg'
                  | '/vector/generic/ocampa.svg'
                  | '/vector/generic/ocro.svg'
                  | '/vector/generic/orbital.svg'
                  | '/vector/generic/orbits.svg'
                  | '/vector/generic/orbs.svg'
                  | '/vector/generic/orbsword.svg'
                  | '/vector/generic/ori.svg'
                  | '/vector/generic/outcast.svg'
                  | '/vector/generic/peddlers.svg'
                  | '/vector/generic/pele.svg'
                  | '/vector/generic/petala.svg'
                  | '/vector/generic/petalb.svg'
                  | '/vector/generic/petalfan.svg'
                  | '/vector/generic/petorbid.svg'
                  | '/vector/generic/pickup.svg'
                  | '/vector/generic/pirate.svg'
                  | '/vector/generic/plus.svg'
                  | '/vector/generic/promise.svg'
                  | '/vector/generic/protectorate.svg'
                  | '/vector/generic/psycorp.svg'
                  | '/vector/generic/pyramid.svg'
                  | '/vector/generic/quizarate.svg'
                  | '/vector/generic/raider.svg'
                  | '/vector/generic/rebels.svg'
                  | '/vector/generic/reman.svg'
                  | '/vector/generic/richese.svg'
                  | '/vector/generic/rift.svg'
                  | '/vector/generic/ringworld.svg'
                  | '/vector/generic/risa.svg'
                  | '/vector/generic/romulan.svg'
                  | '/vector/generic/saudarkar.svg'
                  | '/vector/generic/sca.svg'
                  | '/vector/generic/schema.svg'
                  | '/vector/generic/scout.svg'
                  | '/vector/generic/scrin.svg'
                  | '/vector/generic/shade.svg'
                  | '/vector/generic/shar.svg'
                  | '/vector/generic/sharky.svg'
                  | '/vector/generic/sheddle.svg'
                  | '/vector/generic/shell.svg'
                  | '/vector/generic/sherl.svg'
                  | '/vector/generic/shiegle.svg'
                  | '/vector/generic/shim.svg'
                  | '/vector/generic/shine.svg'
                  | '/vector/generic/ship.svg'
                  | '/vector/generic/singer.svg'
                  | '/vector/generic/sisterhood.svg'
                  | '/vector/generic/sith.svg'
                  | '/vector/generic/slange.svg'
                  | '/vector/generic/slechtedag.svg'
                  | '/vector/generic/smugglers.svg'
                  | '/vector/generic/snow.svg'
                  | '/vector/generic/solaris.svg'
                  | '/vector/generic/soviet.svg'
                  | '/vector/generic/spears.svg'
                  | '/vector/generic/spiderette.svg'
                  | '/vector/generic/spikes.svg'
                  | '/vector/generic/splat.svg'
                  | '/vector/generic/spots.svg'
                  | '/vector/generic/spycore.svg'
                  | '/vector/generic/squidle.svg'
                  | '/vector/generic/stackle.svg'
                  | '/vector/generic/staergle.svg'
                  | '/vector/generic/star.svg'
                  | '/vector/generic/starase.svg'
                  | '/vector/generic/stars.svg'
                  | '/vector/generic/startag.svg'
                  | '/vector/generic/static.svg'
                  | '/vector/generic/stellar.svg'
                  | '/vector/generic/stormworld.svg'
                  | '/vector/generic/suliban.svg'
                  | '/vector/generic/summer.svg'
                  | '/vector/generic/sun.svg'
                  | '/vector/generic/sunny.svg'
                  | '/vector/generic/swave.svg'
                  | '/vector/generic/swirl.svg'
                  | '/vector/generic/swordrock.svg'
                  | '/vector/generic/swords.svg'
                  | '/vector/generic/tan.svg'
                  | '/vector/generic/tantor.svg'
                  | '/vector/generic/tech.svg'
                  | '/vector/generic/tecky.svg'
                  | '/vector/generic/tellerite.svg'
                  | '/vector/generic/terran.svg'
                  | '/vector/generic/tleilax.svg'
                  | '/vector/generic/tornado.svg'
                  | '/vector/generic/torp.svg'
                  | '/vector/generic/trian.svg'
                  | '/vector/generic/triangle.svg'
                  | '/vector/generic/trimanos.svg'
                  | '/vector/generic/trispear.svg'
                  | '/vector/generic/triswords.svg'
                  | '/vector/generic/tritant.svg'
                  | '/vector/generic/trix.svg'
                  | '/vector/generic/vaudaur.svg'
                  | '/vector/generic/ve.svg'
                  | '/vector/generic/vernius.svg'
                  | '/vector/generic/vertex.svg'
                  | '/vector/generic/viode.svg'
                  | '/vector/generic/vortex.svg'
                  | '/vector/generic/voth.svg'
                  | '/vector/generic/vp.svg'
                  | '/vector/generic/vulcan.svg'
                  | '/vector/generic/waiku.svg'
                  | '/vector/generic/why.svg'
                  | '/vector/generic/wuurm.svg'
                  | '/vector/generic/x.svg'
                  | '/vector/generic/zap.svg';
                background: {
                  image:
                    | '/image/texture/001.jpg'
                    | '/image/texture/002.jpg'
                    | '/image/texture/003.jpg'
                    | '/image/texture/004.jpg'
                    | '/image/texture/005.jpg'
                    | '/image/texture/006.jpg'
                    | '/image/texture/007.jpg'
                    | '/image/texture/008.jpg'
                    | '/image/texture/009.jpg'
                    | '/image/texture/010.jpg'
                    | '/image/texture/011.jpg'
                    | '/image/texture/012.jpg'
                    | '/image/texture/013.jpg'
                    | '/image/texture/014.jpg'
                    | '/image/texture/015.jpg'
                    | '/image/texture/016.jpg'
                    | '/image/texture/017.jpg'
                    | '/image/texture/018.jpg'
                    | '/image/texture/019.jpg'
                    | '/image/texture/020.jpg'
                    | '/image/texture/021.jpg'
                    | '/image/texture/022.jpg'
                    | '/image/texture/023.jpg'
                    | '/image/texture/024.jpg'
                    | '/image/texture/025.jpg'
                    | '/image/texture/026.jpg'
                    | '/image/texture/027.jpg'
                    | '/image/texture/028.jpg'
                    | '/image/texture/029.jpg'
                    | '/image/texture/030.jpg'
                    | '/image/texture/031.jpg'
                    | '/image/texture/032.jpg'
                    | '/image/texture/033.jpg'
                    | '/image/texture/034.jpg'
                    | '/image/texture/035.jpg'
                    | '/image/texture/036.jpg'
                    | '/image/texture/037.jpg'
                    | '/image/texture/038.jpg'
                    | '/image/texture/039.jpg'
                    | '/image/texture/040.jpg'
                    | '/image/texture/041.jpg'
                    | '/image/texture/042.jpg'
                    | '/image/texture/043.jpg'
                    | '/image/texture/044.jpg'
                    | '/image/texture/045.jpg'
                    | '/image/texture/046.jpg'
                    | '/image/texture/047.jpg'
                    | '/image/texture/048.jpg'
                    | '/image/texture/049.jpg'
                    | '/image/texture/050.jpg'
                    | '/image/texture/051.jpg'
                    | '/image/texture/052.jpg'
                    | '/image/texture/053.jpg'
                    | '/image/texture/054.jpg'
                    | '/image/texture/055.jpg'
                    | '/image/texture/056.jpg'
                    | '/image/texture/057.jpg'
                    | '/image/texture/058.jpg'
                    | '/image/texture/059.jpg'
                    | '/image/texture/069.jpg'
                    | '/image/texture/070.jpg'
                    | '/image/texture/071.jpg'
                    | '/image/texture/072.jpg'
                    | '/image/texture/073.jpg'
                    | '/image/texture/074.jpg'
                    | '/image/texture/075.jpg'
                    | '/image/texture/076.jpg'
                    | '/image/texture/077.jpg'
                    | '/image/texture/078.jpg'
                    | '/image/texture/079.jpg'
                    | '/image/texture/080.jpg'
                    | '/image/texture/081.jpg'
                    | '/image/texture/082.jpg'
                    | '/vector/background/map.svg'
                    | '/vector/background/moon.svg';
                  colors: [
                    (
                      | string
                      | { type: 'linear'; angle: number; stops: [string, number][] }
                      | {
                          type: 'radial';
                          stops: [string, number][];
                          x?: number | undefined;
                          y?: number | undefined;
                          r?: number | undefined;
                        }
                    ),
                    (
                      | string
                      | { type: 'linear'; angle: number; stops: [string, number][] }
                      | {
                          type: 'radial';
                          stops: [string, number][];
                          x?: number | undefined;
                          y?: number | undefined;
                          r?: number | undefined;
                        }
                    ),
                  ];
                  invert: boolean;
                  definition: number;
                  influence: number;
                };
                color: string;
                linked: boolean;
                published: boolean;
              }[];
              catalogueAt: number;
              picks: Record<string, string[]>;
              bans: Record<string, string[]>;
              ready: string[];
              failure: string | null;
              setAside?: Record<string, string> | undefined;
            }
          | null
          | undefined;
        board?:
          | {
              asset: { id: string; slug: string; name: string };
              definition: {
                nodes: Record<string, [number, number]>;
                edges: {
                  id: string;
                  a: string;
                  b: string;
                  kind: 'line' | 'cubic' | 'arc';
                  c1?: [number, number] | undefined;
                  c2?: [number, number] | undefined;
                  arc?: [number, number, number, 0 | 1, 0 | 1] | undefined;
                  strokeWidth?: number | undefined;
                  fixed?: boolean | undefined;
                }[];
                properties: Record<
                  string,
                  {
                    name: string;
                    id: string;
                    type: 'sand' | 'rock' | 'stronghold' | 'polar';
                    insetLine: 'none' | 'solid' | 'dashed';
                    decals: {
                      id: string;
                      x: number;
                      y: number;
                      scale: number;
                      rotation: number;
                      outline: boolean;
                      artwork: string;
                    }[];
                    appearance?:
                      | {
                          role: 'band' | 'inset';
                          segments: {
                            kind: 'M' | 'L' | 'C' | 'Q' | 'A' | 'Z';
                            values: (number | { edge: string; t: number; offset: [number, number] })[];
                          }[];
                          fill: string;
                          stroke: string;
                          strokeWidth: number;
                          strokeLinecap: 'round' | 'square' | 'butt';
                          strokeLinejoin: 'round' | 'bevel' | 'miter';
                          strokeDasharray?: string | undefined;
                          strokeDashoffset?: string | undefined;
                        }[]
                      | undefined;
                    paintOrder?: number | undefined;
                    border?:
                      | { width: number; linecap: 'round' | 'square' | 'butt'; linejoin: 'round' | 'bevel' | 'miter' }
                      | undefined;
                  }
                >;
              };
            }
          | null
          | undefined;
        phases?:
          | {
              id: string;
              label: string;
              symbol: string;
              instructions: string;
              allPlayersMustBeReady: boolean;
              kind: 'faction' | 'standard';
              factionId?: string | undefined;
              before?:
                | 'battle'
                | 'storm'
                | 'spice-blow'
                | 'choam-charity'
                | 'bidding'
                | 'revival'
                | 'shipment-and-movement'
                | 'spice-collection'
                | 'mentat-pause'
                | undefined;
            }[]
          | null
          | undefined;
        roster?:
          | {
              seatCount: 8 | 12 | 2 | 4 | 6 | 3 | 10 | 7 | 9 | 5 | 11 | 13 | 14 | 15 | 16 | 17 | 18;
              seats: { id: string; position: number; faction: { id: string; name: string; color: string } | null }[];
            }
          | null
          | undefined;
        swapping?:
          | {
              round: string;
              deadline: number;
              closed: boolean;
              ready: string[];
              offers: { id: string; origin: string; target: string; order: number }[];
              nextOrder: number;
              tokens: Record<string, string>;
            }
          | null
          | undefined;
        setup?:
          | {
              steps: {
                id: string;
                kind: 'prediction' | 'instruction' | 'traitors' | 'forces';
                title: string;
                instructions: string;
                symbol: string;
                factionId?: string | undefined;
                allPlayersMustBeReady?: boolean | undefined;
              }[];
              index: number;
              visit: number;
              mapRevealed: boolean;
              completed: string[];
              instructions: { factionId: string; text: string }[];
            }
          | null
          | undefined;
        stage?: 'drafting' | 'swapping' | 'setup' | 'play' | 'finished' | 'discarded' | null | undefined;
        predictions?:
          | Record<
              string,
              {
                factionId: string;
                lockedAt: number;
                revealedAt: number | null;
                choice?: { factionId: string; turn: number } | undefined;
              }
            >
          | null
          | undefined;
        removalVotes?:
          | {
              id: string;
              target: { name: string; seat: string };
              openedAt: number;
              threshold: number;
              ballots: { name: string; seat: string; choice: 'remove' | 'keep' | null }[];
            }[]
          | null
          | undefined;
        ending?: { by: { seat: string; name: string }; startedAt: number } | null | undefined;
        result?:
          | {
              kind: 'alliance' | 'faction' | 'none';
              factionIds: string[];
              by: { seat: string; name: string };
              declaredAt: number;
            }
          | null
          | undefined;
        controls?:
          | {
              seats: string[];
              ready: string[];
              phaseChangedAt: number;
              requests: {
                id: string;
                requesterSeat: string;
                requesterName: string;
                contents: {
                  assetId: string;
                  name: string;
                  type: 'deck' | 'bundle' | 'token-disc' | 'token-tech' | 'token-plate' | 'token-enhance';
                  members: { assetId: string; count: number }[];
                  definitions: { id: string; type: string; data: unknown }[];
                  pieces: {
                    id: string;
                    label: string;
                    owner: string;
                    color: string;
                    accent: string;
                    stackKey: string | null;
                    position: [number, number, number];
                    orientation: number;
                    zoneId: string | null;
                    locked: boolean;
                    kind: 'card' | 'force' | 'marker';
                    items: {
                      id: string;
                      faceUp: boolean;
                      peekedBy?: string[] | undefined;
                      artwork?:
                        | {
                            back: string;
                            type: string;
                            front?: string | undefined;
                            backName?: string | undefined;
                            name?: string | undefined;
                            size?: number | undefined;
                            prediction?: { stepId: string; factionId: string; turn: number } | undefined;
                          }
                        | {
                            back: string;
                            backName?: string | undefined;
                            front?: undefined;
                            name?: undefined;
                            type?: undefined;
                            size?: undefined;
                            prediction?: undefined;
                          }
                        | undefined;
                    }[];
                    inventory?: 'shared' | undefined;
                    hiddenZone?: { x: number; y: number } | undefined;
                    battleOverlay?: string | undefined;
                    flipRevision?: number | undefined;
                    shuffleRevision?: number | undefined;
                  }[];
                };
              }[];
              seatRequests: { id: string; requesterName: string; seat: string | null; own?: boolean | undefined }[];
              players: { seat: string; name: string; avatar: string | null; slug: string | null }[];
            }
          | null
          | undefined;
        bank?: { factionId: string; balance: number } | null | undefined;
        alliances?:
          | {
              groups: { members: string[]; mark: number }[];
              offers: { from: string; to: string; at: number; id: number }[];
            }
          | null
          | undefined;
        lastTurn?: number | null | undefined;
        battlePlan?:
          | {
              mode: 'custom' | 'max';
              troops: { faceId: string; undialed: number; dialed: number }[];
              spice: number;
              adjustment: number;
              leaderId: string | null;
              cardIds: string[];
              strength: number;
              pieces: {
                id: string;
                label: string;
                owner: string;
                color: string;
                accent: string;
                stackKey: string | null;
                position: [number, number, number];
                orientation: number;
                zoneId: string | null;
                locked: boolean;
                kind: 'card' | 'force' | 'marker';
                items: {
                  id: string;
                  faceUp: boolean;
                  peekedBy?: string[] | undefined;
                  artwork?:
                    | {
                        back: string;
                        type: string;
                        front?: string | undefined;
                        backName?: string | undefined;
                        name?: string | undefined;
                        size?: number | undefined;
                        prediction?: { stepId: string; factionId: string; turn: number } | undefined;
                      }
                    | {
                        back: string;
                        backName?: string | undefined;
                        front?: undefined;
                        name?: undefined;
                        type?: undefined;
                        size?: undefined;
                        prediction?: undefined;
                      }
                    | undefined;
                }[];
                inventory?: 'shared' | undefined;
                hiddenZone?: { x: number; y: number } | undefined;
                battleOverlay?: string | undefined;
                flipRevision?: number | undefined;
                shuffleRevision?: number | undefined;
              }[];
              faces: {
                id: string;
                name: string;
                capable: boolean;
                strength: number;
                supportedStrength: number;
                supportCost: number;
                image?: string | undefined;
              }[];
              disclosed: { leader: boolean; dial: boolean; cardIds: string[] };
            }
          | null
          | undefined;
        hand?:
          | {
              id: string;
              label: string;
              owner: string;
              color: string;
              accent: string;
              stackKey: string | null;
              position: [number, number, number];
              orientation: number;
              zoneId: string | null;
              locked: boolean;
              kind: 'card' | 'force' | 'marker';
              items: {
                id: string;
                faceUp: boolean;
                peekedBy?: string[] | undefined;
                artwork?:
                  | {
                      back: string;
                      type: string;
                      front?: string | undefined;
                      backName?: string | undefined;
                      name?: string | undefined;
                      size?: number | undefined;
                      prediction?: { stepId: string; factionId: string; turn: number } | undefined;
                    }
                  | {
                      back: string;
                      backName?: string | undefined;
                      front?: undefined;
                      name?: undefined;
                      type?: undefined;
                      size?: undefined;
                      prediction?: undefined;
                    }
                  | undefined;
              }[];
              inventory?: 'shared' | undefined;
              hiddenZone?: { x: number; y: number } | undefined;
              battleOverlay?: string | undefined;
              flipRevision?: number | undefined;
              shuffleRevision?: number | undefined;
            }[]
          | null
          | undefined;
        handCounts?: Record<string, number> | null | undefined;
        peek?:
          | {
              piece: {
                id: string;
                label: string;
                owner: string;
                color: string;
                accent: string;
                stackKey: string | null;
                position: [number, number, number];
                orientation: number;
                zoneId: string | null;
                locked: boolean;
                kind: 'card' | 'force' | 'marker';
                items: {
                  id: string;
                  faceUp: boolean;
                  peekedBy?: string[] | undefined;
                  artwork?:
                    | {
                        back: string;
                        type: string;
                        front?: string | undefined;
                        backName?: string | undefined;
                        name?: string | undefined;
                        size?: number | undefined;
                        prediction?: { stepId: string; factionId: string; turn: number } | undefined;
                      }
                    | {
                        back: string;
                        backName?: string | undefined;
                        front?: undefined;
                        name?: undefined;
                        type?: undefined;
                        size?: undefined;
                        prediction?: undefined;
                      }
                    | undefined;
                }[];
                inventory?: 'shared' | undefined;
                hiddenZone?: { x: number; y: number } | undefined;
                battleOverlay?: string | undefined;
                flipRevision?: number | undefined;
                shuffleRevision?: number | undefined;
              };
            }
          | null
          | undefined;
        factionArtwork?:
          | Record<
              string,
              {
                logo:
                  | '/vector/logo/antler-tower.svg'
                  | '/vector/logo/atreides.svg'
                  | '/vector/logo/bene-gesserit.svg'
                  | '/vector/logo/bene-tleilaxu.svg'
                  | '/vector/logo/blade-bridge.svg'
                  | '/vector/logo/broken-spear.svg'
                  | '/vector/logo/caravan-arch.svg'
                  | '/vector/logo/carryall-wing.svg'
                  | '/vector/logo/choam.svg'
                  | '/vector/logo/cinder-phoenix.svg'
                  | '/vector/logo/closed-helm.svg'
                  | '/vector/logo/cog-sun.svg'
                  | '/vector/logo/coil-viper.svg'
                  | '/vector/logo/crescent-blade.svg'
                  | '/vector/logo/crown-anvil.svg'
                  | '/vector/logo/crowned-ibex.svg'
                  | '/vector/logo/desert-hare.svg'
                  | '/vector/logo/dew-cistern.svg'
                  | '/vector/logo/dune-crab.svg'
                  | '/vector/logo/dune-jackal.svg'
                  | '/vector/logo/ecaz.svg'
                  | '/vector/logo/eclipse-lotus.svg'
                  | '/vector/logo/emperor.svg'
                  | '/vector/logo/falcon-gauntlet.svg'
                  | '/vector/logo/foldspace-knot.svg'
                  | '/vector/logo/fremen.svg'
                  | '/vector/logo/ginaz.svg'
                  | '/vector/logo/glass-owl.svg'
                  | '/vector/logo/guild.svg'
                  | '/vector/logo/gyroscope-seal.svg'
                  | '/vector/logo/hagal.svg'
                  | '/vector/logo/harkonnen.svg'
                  | '/vector/logo/heighliner-gate.svg'
                  | '/vector/logo/hooded-raven.svg'
                  | '/vector/logo/horned-bat.svg'
                  | '/vector/logo/iduali.svg'
                  | '/vector/logo/iron-tortoise.svg'
                  | '/vector/logo/ixian.svg'
                  | '/vector/logo/memory-tree.svg'
                  | '/vector/logo/merchant-seal.svg'
                  | '/vector/logo/mirror-array.svg'
                  | '/vector/logo/moon-moth.svg'
                  | '/vector/logo/moritani.svg'
                  | '/vector/logo/mountain-throne.svg'
                  | '/vector/logo/null-vault.svg'
                  | '/vector/logo/oath-chain.svg'
                  | '/vector/logo/obsidian-mantis.svg'
                  | '/vector/logo/oracle-eye.svg'
                  | '/vector/logo/orbital-spindle.svg'
                  | '/vector/logo/pilgrim-lantern.svg'
                  | '/vector/logo/prism-engine.svg'
                  | '/vector/logo/reed-crane.svg'
                  | '/vector/logo/richese.svg'
                  | '/vector/logo/root-reservoir.svg'
                  | '/vector/logo/sabre-cat.svg'
                  | '/vector/logo/sail-fin.svg'
                  | '/vector/logo/salt-crystal.svg'
                  | '/vector/logo/salt-scarab.svg'
                  | '/vector/logo/sand-hourglass.svg'
                  | '/vector/logo/sand-ray.svg'
                  | '/vector/logo/sentinel-key.svg'
                  | '/vector/logo/sietch-well.svg'
                  | '/vector/logo/signal-fork.svg'
                  | '/vector/logo/sirocco-raptor.svg'
                  | '/vector/logo/spice-chalice.svg'
                  | '/vector/logo/spice-fox.svg'
                  | '/vector/logo/spice-refinery.svg'
                  | '/vector/logo/stone-bison.svg'
                  | '/vector/logo/storm-compass.svg'
                  | '/vector/logo/sun-bastion.svg'
                  | '/vector/logo/sun-cobra.svg'
                  | '/vector/logo/sun-shutter.svg'
                  | '/vector/logo/thorn-bloom.svg'
                  | '/vector/logo/thorn-cactus.svg'
                  | '/vector/logo/thorn-frog.svg'
                  | '/vector/logo/triple-axe.svg'
                  | '/vector/logo/twin-flame.svg'
                  | '/vector/logo/twin-moons.svg'
                  | '/vector/logo/veiled-mask.svg'
                  | '/vector/logo/water-clasp.svg'
                  | '/vector/logo/whisper-hand.svg'
                  | '/vector/logo/worm-crown.svg'
                  | '/vector/logo/worm-hook.svg'
                  | '/vector/generic/6star.svg'
                  | '/vector/generic/8472.svg'
                  | '/vector/generic/8point.svg'
                  | '/vector/generic/alliance.svg'
                  | '/vector/generic/ancient.svg'
                  | '/vector/generic/apophis.svg'
                  | '/vector/generic/argos.svg'
                  | '/vector/generic/arrowbox.svg'
                  | '/vector/generic/arrows.svg'
                  | '/vector/generic/asterisk.svg'
                  | '/vector/generic/atreiblock.svg'
                  | '/vector/generic/axes.svg'
                  | '/vector/generic/balance.svg'
                  | '/vector/generic/ball.svg'
                  | '/vector/generic/barge.svg'
                  | '/vector/generic/biggle.svg'
                  | '/vector/generic/biohazard.svg'
                  | '/vector/generic/bird.svg'
                  | '/vector/generic/birdban.svg'
                  | '/vector/generic/blad.svg'
                  | '/vector/generic/blades.svg'
                  | '/vector/generic/blob.svg'
                  | '/vector/generic/bluks.svg'
                  | '/vector/generic/bones.svg'
                  | '/vector/generic/borg.svg'
                  | '/vector/generic/bows.svg'
                  | '/vector/generic/box.svg'
                  | '/vector/generic/breen.svg'
                  | '/vector/generic/broke.svg'
                  | '/vector/generic/bug.svg'
                  | '/vector/generic/bull.svg'
                  | '/vector/generic/ceasar.svg'
                  | '/vector/generic/cerberus.svg'
                  | '/vector/generic/chaom.svg'
                  | '/vector/generic/chip.svg'
                  | '/vector/generic/choppers.svg'
                  | '/vector/generic/clover.svg'
                  | '/vector/generic/community.svg'
                  | '/vector/generic/connect.svg'
                  | '/vector/generic/corrino.svg'
                  | '/vector/generic/council.svg'
                  | '/vector/generic/cpu.svg'
                  | '/vector/generic/crift.svg'
                  | '/vector/generic/cross.svg'
                  | '/vector/generic/crosstripes.svg'
                  | '/vector/generic/cyclo.svg'
                  | '/vector/generic/da7.svg'
                  | '/vector/generic/daggers.svg'
                  | '/vector/generic/def.svg'
                  | '/vector/generic/dello.svg'
                  | '/vector/generic/denobula.svg'
                  | '/vector/generic/detector.svg'
                  | '/vector/generic/deteis.svg'
                  | '/vector/generic/diamond.svg'
                  | '/vector/generic/diode.svg'
                  | '/vector/generic/dominion.svg'
                  | '/vector/generic/dp.svg'
                  | '/vector/generic/effect.svg'
                  | '/vector/generic/egg.svg'
                  | '/vector/generic/elaurian.svg'
                  | '/vector/generic/electronic.svg'
                  | '/vector/generic/emiron.svg'
                  | '/vector/generic/emperiskull.svg'
                  | '/vector/generic/encircl.svg'
                  | '/vector/generic/entor.svg'
                  | '/vector/generic/exclamation.svg'
                  | '/vector/generic/fear.svg'
                  | '/vector/generic/federation.svg'
                  | '/vector/generic/ferengi.svg'
                  | '/vector/generic/fire.svg'
                  | '/vector/generic/fishspeekers.svg'
                  | '/vector/generic/flauqre.svg'
                  | '/vector/generic/fly.svg'
                  | '/vector/generic/force.svg'
                  | '/vector/generic/fremball.svg'
                  | '/vector/generic/gate.svg'
                  | '/vector/generic/gdi1.svg'
                  | '/vector/generic/gdi2.svg'
                  | '/vector/generic/gdi3.svg'
                  | '/vector/generic/gdi4.svg'
                  | '/vector/generic/gdi6.svg'
                  | '/vector/generic/gear.svg'
                  | '/vector/generic/gearos.svg'
                  | '/vector/generic/glimmer.svg'
                  | '/vector/generic/goededag.svg'
                  | '/vector/generic/graph.svg'
                  | '/vector/generic/gring.svg'
                  | '/vector/generic/guard.svg'
                  | '/vector/generic/guildeyes.svg'
                  | '/vector/generic/hammer.svg'
                  | '/vector/generic/harkoring.svg'
                  | '/vector/generic/here.svg'
                  | '/vector/generic/hex.svg'
                  | '/vector/generic/hexes.svg'
                  | '/vector/generic/hirogen.svg'
                  | '/vector/generic/horse.svg'
                  | '/vector/generic/hurus.svg'
                  | '/vector/generic/ice.svg'
                  | '/vector/generic/infiniguild.svg'
                  | '/vector/generic/info.svg'
                  | '/vector/generic/inter.svg'
                  | '/vector/generic/jarje.svg'
                  | '/vector/generic/keys.svg'
                  | '/vector/generic/klingon.svg'
                  | '/vector/generic/krenim.svg'
                  | '/vector/generic/landsraad.svg'
                  | '/vector/generic/lantern.svg'
                  | '/vector/generic/laser.svg'
                  | '/vector/generic/leader-skills.svg'
                  | '/vector/generic/league.svg'
                  | '/vector/generic/lifting.svg'
                  | '/vector/generic/lishen.svg'
                  | '/vector/generic/llc1.svg'
                  | '/vector/generic/llc10.svg'
                  | '/vector/generic/llc11.svg'
                  | '/vector/generic/llc12.svg'
                  | '/vector/generic/llc13.svg'
                  | '/vector/generic/llc2.svg'
                  | '/vector/generic/llc4.svg'
                  | '/vector/generic/llc5.svg'
                  | '/vector/generic/llc6.svg'
                  | '/vector/generic/llc7.svg'
                  | '/vector/generic/llc8.svg'
                  | '/vector/generic/llc9.svg'
                  | '/vector/generic/magnet.svg'
                  | '/vector/generic/malon.svg'
                  | '/vector/generic/marker.svg'
                  | '/vector/generic/matres.svg'
                  | '/vector/generic/memory.svg'
                  | '/vector/generic/mercenaries.svg'
                  | '/vector/generic/mesh.svg'
                  | '/vector/generic/microblock.svg'
                  | '/vector/generic/moritani.svg'
                  | '/vector/generic/mortal.svg'
                  | '/vector/generic/mural1.svg'
                  | '/vector/generic/mural2.svg'
                  | '/vector/generic/mural3.svg'
                  | '/vector/generic/mural4.svg'
                  | '/vector/generic/nightsky.svg'
                  | '/vector/generic/nobles.svg'
                  | '/vector/generic/nod.svg'
                  | '/vector/generic/nuke.svg'
                  | '/vector/generic/ocampa.svg'
                  | '/vector/generic/ocro.svg'
                  | '/vector/generic/orbital.svg'
                  | '/vector/generic/orbits.svg'
                  | '/vector/generic/orbs.svg'
                  | '/vector/generic/orbsword.svg'
                  | '/vector/generic/ori.svg'
                  | '/vector/generic/outcast.svg'
                  | '/vector/generic/peddlers.svg'
                  | '/vector/generic/pele.svg'
                  | '/vector/generic/petala.svg'
                  | '/vector/generic/petalb.svg'
                  | '/vector/generic/petalfan.svg'
                  | '/vector/generic/petorbid.svg'
                  | '/vector/generic/pickup.svg'
                  | '/vector/generic/pirate.svg'
                  | '/vector/generic/plus.svg'
                  | '/vector/generic/promise.svg'
                  | '/vector/generic/protectorate.svg'
                  | '/vector/generic/psycorp.svg'
                  | '/vector/generic/pyramid.svg'
                  | '/vector/generic/quizarate.svg'
                  | '/vector/generic/raider.svg'
                  | '/vector/generic/rebels.svg'
                  | '/vector/generic/reman.svg'
                  | '/vector/generic/richese.svg'
                  | '/vector/generic/rift.svg'
                  | '/vector/generic/ringworld.svg'
                  | '/vector/generic/risa.svg'
                  | '/vector/generic/romulan.svg'
                  | '/vector/generic/saudarkar.svg'
                  | '/vector/generic/sca.svg'
                  | '/vector/generic/schema.svg'
                  | '/vector/generic/scout.svg'
                  | '/vector/generic/scrin.svg'
                  | '/vector/generic/shade.svg'
                  | '/vector/generic/shar.svg'
                  | '/vector/generic/sharky.svg'
                  | '/vector/generic/sheddle.svg'
                  | '/vector/generic/shell.svg'
                  | '/vector/generic/sherl.svg'
                  | '/vector/generic/shiegle.svg'
                  | '/vector/generic/shim.svg'
                  | '/vector/generic/shine.svg'
                  | '/vector/generic/ship.svg'
                  | '/vector/generic/singer.svg'
                  | '/vector/generic/sisterhood.svg'
                  | '/vector/generic/sith.svg'
                  | '/vector/generic/slange.svg'
                  | '/vector/generic/slechtedag.svg'
                  | '/vector/generic/smugglers.svg'
                  | '/vector/generic/snow.svg'
                  | '/vector/generic/solaris.svg'
                  | '/vector/generic/soviet.svg'
                  | '/vector/generic/spears.svg'
                  | '/vector/generic/spiderette.svg'
                  | '/vector/generic/spikes.svg'
                  | '/vector/generic/splat.svg'
                  | '/vector/generic/spots.svg'
                  | '/vector/generic/spycore.svg'
                  | '/vector/generic/squidle.svg'
                  | '/vector/generic/stackle.svg'
                  | '/vector/generic/staergle.svg'
                  | '/vector/generic/star.svg'
                  | '/vector/generic/starase.svg'
                  | '/vector/generic/stars.svg'
                  | '/vector/generic/startag.svg'
                  | '/vector/generic/static.svg'
                  | '/vector/generic/stellar.svg'
                  | '/vector/generic/stormworld.svg'
                  | '/vector/generic/suliban.svg'
                  | '/vector/generic/summer.svg'
                  | '/vector/generic/sun.svg'
                  | '/vector/generic/sunny.svg'
                  | '/vector/generic/swave.svg'
                  | '/vector/generic/swirl.svg'
                  | '/vector/generic/swordrock.svg'
                  | '/vector/generic/swords.svg'
                  | '/vector/generic/tan.svg'
                  | '/vector/generic/tantor.svg'
                  | '/vector/generic/tech.svg'
                  | '/vector/generic/tecky.svg'
                  | '/vector/generic/tellerite.svg'
                  | '/vector/generic/terran.svg'
                  | '/vector/generic/tleilax.svg'
                  | '/vector/generic/tornado.svg'
                  | '/vector/generic/torp.svg'
                  | '/vector/generic/trian.svg'
                  | '/vector/generic/triangle.svg'
                  | '/vector/generic/trimanos.svg'
                  | '/vector/generic/trispear.svg'
                  | '/vector/generic/triswords.svg'
                  | '/vector/generic/tritant.svg'
                  | '/vector/generic/trix.svg'
                  | '/vector/generic/vaudaur.svg'
                  | '/vector/generic/ve.svg'
                  | '/vector/generic/vernius.svg'
                  | '/vector/generic/vertex.svg'
                  | '/vector/generic/viode.svg'
                  | '/vector/generic/vortex.svg'
                  | '/vector/generic/voth.svg'
                  | '/vector/generic/vp.svg'
                  | '/vector/generic/vulcan.svg'
                  | '/vector/generic/waiku.svg'
                  | '/vector/generic/why.svg'
                  | '/vector/generic/wuurm.svg'
                  | '/vector/generic/x.svg'
                  | '/vector/generic/zap.svg';
                background: {
                  image:
                    | '/image/texture/001.jpg'
                    | '/image/texture/002.jpg'
                    | '/image/texture/003.jpg'
                    | '/image/texture/004.jpg'
                    | '/image/texture/005.jpg'
                    | '/image/texture/006.jpg'
                    | '/image/texture/007.jpg'
                    | '/image/texture/008.jpg'
                    | '/image/texture/009.jpg'
                    | '/image/texture/010.jpg'
                    | '/image/texture/011.jpg'
                    | '/image/texture/012.jpg'
                    | '/image/texture/013.jpg'
                    | '/image/texture/014.jpg'
                    | '/image/texture/015.jpg'
                    | '/image/texture/016.jpg'
                    | '/image/texture/017.jpg'
                    | '/image/texture/018.jpg'
                    | '/image/texture/019.jpg'
                    | '/image/texture/020.jpg'
                    | '/image/texture/021.jpg'
                    | '/image/texture/022.jpg'
                    | '/image/texture/023.jpg'
                    | '/image/texture/024.jpg'
                    | '/image/texture/025.jpg'
                    | '/image/texture/026.jpg'
                    | '/image/texture/027.jpg'
                    | '/image/texture/028.jpg'
                    | '/image/texture/029.jpg'
                    | '/image/texture/030.jpg'
                    | '/image/texture/031.jpg'
                    | '/image/texture/032.jpg'
                    | '/image/texture/033.jpg'
                    | '/image/texture/034.jpg'
                    | '/image/texture/035.jpg'
                    | '/image/texture/036.jpg'
                    | '/image/texture/037.jpg'
                    | '/image/texture/038.jpg'
                    | '/image/texture/039.jpg'
                    | '/image/texture/040.jpg'
                    | '/image/texture/041.jpg'
                    | '/image/texture/042.jpg'
                    | '/image/texture/043.jpg'
                    | '/image/texture/044.jpg'
                    | '/image/texture/045.jpg'
                    | '/image/texture/046.jpg'
                    | '/image/texture/047.jpg'
                    | '/image/texture/048.jpg'
                    | '/image/texture/049.jpg'
                    | '/image/texture/050.jpg'
                    | '/image/texture/051.jpg'
                    | '/image/texture/052.jpg'
                    | '/image/texture/053.jpg'
                    | '/image/texture/054.jpg'
                    | '/image/texture/055.jpg'
                    | '/image/texture/056.jpg'
                    | '/image/texture/057.jpg'
                    | '/image/texture/058.jpg'
                    | '/image/texture/059.jpg'
                    | '/image/texture/069.jpg'
                    | '/image/texture/070.jpg'
                    | '/image/texture/071.jpg'
                    | '/image/texture/072.jpg'
                    | '/image/texture/073.jpg'
                    | '/image/texture/074.jpg'
                    | '/image/texture/075.jpg'
                    | '/image/texture/076.jpg'
                    | '/image/texture/077.jpg'
                    | '/image/texture/078.jpg'
                    | '/image/texture/079.jpg'
                    | '/image/texture/080.jpg'
                    | '/image/texture/081.jpg'
                    | '/image/texture/082.jpg'
                    | '/vector/background/map.svg'
                    | '/vector/background/moon.svg';
                  colors: [
                    (
                      | string
                      | { type: 'linear'; angle: number; stops: [string, number][] }
                      | {
                          type: 'radial';
                          stops: [string, number][];
                          x?: number | undefined;
                          y?: number | undefined;
                          r?: number | undefined;
                        }
                    ),
                    (
                      | string
                      | { type: 'linear'; angle: number; stops: [string, number][] }
                      | {
                          type: 'radial';
                          stops: [string, number][];
                          x?: number | undefined;
                          y?: number | undefined;
                          r?: number | undefined;
                        }
                    ),
                  ];
                  invert: boolean;
                  definition: number;
                  influence: number;
                };
                troops: {
                  name: string;
                  image:
                    | '/vector/troop/acolyte.svg'
                    | '/vector/troop/atreides.svg'
                    | '/vector/troop/banner-marshal.svg'
                    | '/vector/troop/bene-gesserit.svg'
                    | '/vector/troop/bene-tleilaxu.svg'
                    | '/vector/troop/blade-dancer.svg'
                    | '/vector/troop/blaster.svg'
                    | '/vector/troop/choam.svg'
                    | '/vector/troop/coat.svg'
                    | '/vector/troop/court-duelist.svg'
                    | '/vector/troop/crescent-executioner.svg'
                    | '/vector/troop/cymecs.svg'
                    | '/vector/troop/desert-pathfinder.svg'
                    | '/vector/troop/drum-herald.svg'
                    | '/vector/troop/ecaz.svg'
                    | '/vector/troop/emperor.svg'
                    | '/vector/troop/fat.svg'
                    | '/vector/troop/fremen.svg'
                    | '/vector/troop/furnace-bearer.svg'
                    | '/vector/troop/gene-forged-brute.svg'
                    | '/vector/troop/ginaz.svg'
                    | '/vector/troop/guild.svg'
                    | '/vector/troop/hagal.svg'
                    | '/vector/troop/harkonnen.svg'
                    | '/vector/troop/hook-climber.svg'
                    | '/vector/troop/house-bulwark.svg'
                    | '/vector/troop/iduali.svg'
                    | '/vector/troop/ixian-engineer.svg'
                    | '/vector/troop/ixian.svg'
                    | '/vector/troop/juggernaut.svg'
                    | '/vector/troop/landsraad.svg'
                    | '/vector/troop/mantis-guard.svg'
                    | '/vector/troop/masked-saboteur.svg'
                    | '/vector/troop/moritani.svg'
                    | '/vector/troop/needle-sniper.svg'
                    | '/vector/troop/peddler.svg'
                    | '/vector/troop/pewpew.svg'
                    | '/vector/troop/raptor-keeper.svg'
                    | '/vector/troop/resonance-adept.svg'
                    | '/vector/troop/richese.svg'
                    | '/vector/troop/salvage-warden.svg'
                    | '/vector/troop/shield-rammer.svg'
                    | '/vector/troop/siege-gunner.svg'
                    | '/vector/troop/smuggler.svg'
                    | '/vector/troop/spice-driller.svg'
                    | '/vector/troop/suspensor-lancer.svg'
                    | '/vector/troop/sword-bearer.svg'
                    | '/vector/troop/veiled-adept.svg'
                    | '/vector/troop/void-walker.svg'
                    | '/vector/troop/water-keeper.svg'
                    | '/vector/troop/wire-hunter.svg';
                  description: string;
                  count: number;
                  troopId?: string | undefined;
                  star?:
                    | '/vector/troop_modifier/star-left-red.svg'
                    | '/vector/troop_modifier/star-left.svg'
                    | '/vector/troop_modifier/star-right-red.svg'
                    | '/vector/troop_modifier/star-right.svg'
                    | undefined;
                  hue?: string | undefined;
                  striped?: boolean | undefined;
                  planet?: string | undefined;
                  back?:
                    | {
                        name: string;
                        image:
                          | '/vector/troop/acolyte.svg'
                          | '/vector/troop/atreides.svg'
                          | '/vector/troop/banner-marshal.svg'
                          | '/vector/troop/bene-gesserit.svg'
                          | '/vector/troop/bene-tleilaxu.svg'
                          | '/vector/troop/blade-dancer.svg'
                          | '/vector/troop/blaster.svg'
                          | '/vector/troop/choam.svg'
                          | '/vector/troop/coat.svg'
                          | '/vector/troop/court-duelist.svg'
                          | '/vector/troop/crescent-executioner.svg'
                          | '/vector/troop/cymecs.svg'
                          | '/vector/troop/desert-pathfinder.svg'
                          | '/vector/troop/drum-herald.svg'
                          | '/vector/troop/ecaz.svg'
                          | '/vector/troop/emperor.svg'
                          | '/vector/troop/fat.svg'
                          | '/vector/troop/fremen.svg'
                          | '/vector/troop/furnace-bearer.svg'
                          | '/vector/troop/gene-forged-brute.svg'
                          | '/vector/troop/ginaz.svg'
                          | '/vector/troop/guild.svg'
                          | '/vector/troop/hagal.svg'
                          | '/vector/troop/harkonnen.svg'
                          | '/vector/troop/hook-climber.svg'
                          | '/vector/troop/house-bulwark.svg'
                          | '/vector/troop/iduali.svg'
                          | '/vector/troop/ixian-engineer.svg'
                          | '/vector/troop/ixian.svg'
                          | '/vector/troop/juggernaut.svg'
                          | '/vector/troop/landsraad.svg'
                          | '/vector/troop/mantis-guard.svg'
                          | '/vector/troop/masked-saboteur.svg'
                          | '/vector/troop/moritani.svg'
                          | '/vector/troop/needle-sniper.svg'
                          | '/vector/troop/peddler.svg'
                          | '/vector/troop/pewpew.svg'
                          | '/vector/troop/raptor-keeper.svg'
                          | '/vector/troop/resonance-adept.svg'
                          | '/vector/troop/richese.svg'
                          | '/vector/troop/salvage-warden.svg'
                          | '/vector/troop/shield-rammer.svg'
                          | '/vector/troop/siege-gunner.svg'
                          | '/vector/troop/smuggler.svg'
                          | '/vector/troop/spice-driller.svg'
                          | '/vector/troop/suspensor-lancer.svg'
                          | '/vector/troop/sword-bearer.svg'
                          | '/vector/troop/veiled-adept.svg'
                          | '/vector/troop/void-walker.svg'
                          | '/vector/troop/water-keeper.svg'
                          | '/vector/troop/wire-hunter.svg';
                        description: string;
                        star?:
                          | '/vector/troop_modifier/star-left-red.svg'
                          | '/vector/troop_modifier/star-left.svg'
                          | '/vector/troop_modifier/star-right-red.svg'
                          | '/vector/troop_modifier/star-right.svg'
                          | undefined;
                        hue?: string | undefined;
                        striped?: boolean | undefined;
                      }
                    | undefined;
                }[];
              }
            >
          | null
          | undefined;
        cardFaces?: string[] | null | undefined;
        combatFaces?:
          | Record<
              string,
              {
                id: string;
                name: string;
                capable: boolean;
                strength: number;
                supportedStrength: number;
                supportCost: number;
                image?: string | undefined;
              }[]
            >
          | null
          | undefined;
        battleResults?:
          | {
              id: string;
              anchor: [number, number, number];
              territory: string;
              factions: [string, string];
              plans: [
                {
                  mode: 'custom' | 'max';
                  troops: { faceId: string; undialed: number; dialed: number }[];
                  spice: number;
                  adjustment: number;
                  leaderId: string | null;
                  cardIds: string[];
                  strength: number;
                  pieces: {
                    id: string;
                    label: string;
                    owner: string;
                    color: string;
                    accent: string;
                    stackKey: string | null;
                    position: [number, number, number];
                    orientation: number;
                    zoneId: string | null;
                    locked: boolean;
                    kind: 'card' | 'force' | 'marker';
                    items: {
                      id: string;
                      faceUp: boolean;
                      peekedBy?: string[] | undefined;
                      artwork?:
                        | {
                            back: string;
                            type: string;
                            front?: string | undefined;
                            backName?: string | undefined;
                            name?: string | undefined;
                            size?: number | undefined;
                            prediction?: { stepId: string; factionId: string; turn: number } | undefined;
                          }
                        | {
                            back: string;
                            backName?: string | undefined;
                            front?: undefined;
                            name?: undefined;
                            type?: undefined;
                            size?: undefined;
                            prediction?: undefined;
                          }
                        | undefined;
                    }[];
                    inventory?: 'shared' | undefined;
                    hiddenZone?: { x: number; y: number } | undefined;
                    battleOverlay?: string | undefined;
                    flipRevision?: number | undefined;
                    shuffleRevision?: number | undefined;
                  }[];
                  faces: {
                    id: string;
                    name: string;
                    capable: boolean;
                    strength: number;
                    supportedStrength: number;
                    supportCost: number;
                    image?: string | undefined;
                  }[];
                  disclosed: { leader: boolean; dial: boolean; cardIds: string[] };
                },
                {
                  mode: 'custom' | 'max';
                  troops: { faceId: string; undialed: number; dialed: number }[];
                  spice: number;
                  adjustment: number;
                  leaderId: string | null;
                  cardIds: string[];
                  strength: number;
                  pieces: {
                    id: string;
                    label: string;
                    owner: string;
                    color: string;
                    accent: string;
                    stackKey: string | null;
                    position: [number, number, number];
                    orientation: number;
                    zoneId: string | null;
                    locked: boolean;
                    kind: 'card' | 'force' | 'marker';
                    items: {
                      id: string;
                      faceUp: boolean;
                      peekedBy?: string[] | undefined;
                      artwork?:
                        | {
                            back: string;
                            type: string;
                            front?: string | undefined;
                            backName?: string | undefined;
                            name?: string | undefined;
                            size?: number | undefined;
                            prediction?: { stepId: string; factionId: string; turn: number } | undefined;
                          }
                        | {
                            back: string;
                            backName?: string | undefined;
                            front?: undefined;
                            name?: undefined;
                            type?: undefined;
                            size?: undefined;
                            prediction?: undefined;
                          }
                        | undefined;
                    }[];
                    inventory?: 'shared' | undefined;
                    hiddenZone?: { x: number; y: number } | undefined;
                    battleOverlay?: string | undefined;
                    flipRevision?: number | undefined;
                    shuffleRevision?: number | undefined;
                  }[];
                  faces: {
                    id: string;
                    name: string;
                    capable: boolean;
                    strength: number;
                    supportedStrength: number;
                    supportCost: number;
                    image?: string | undefined;
                  }[];
                  disclosed: { leader: boolean; dial: boolean; cardIds: string[] };
                },
              ];
              outcome: 'none' | 'left' | 'right';
              revision: number;
            }[]
          | null
          | undefined;
        spiceTransfers?:
          | {
              revision: number;
              kind: 'withdrawal' | 'collection' | 'supply' | 'disposal';
              actor: string;
              amount: number;
              source: string;
              destination?: string | undefined;
            }[]
          | null
          | undefined;
      }
    | undefined;
  completedCommandId?: string | undefined;
}) => {
  const before = view();
  const after = applyRoomUpdate(before, message);
  assert.ok(after);
  expect(after).not.toBeNull();
  assert.ok(after);
  const sizing = sizeUpdate(before, after, message, size(message));
  expect(sizing.activityBytes).toBe(size(message.activity));
  expect(sizing.snapshotBytes).toBe(message.snapshot ? size(message.snapshot) : 0);
  expect(sizing.pieceBytes).toBe(
    message.snapshot
      ? size(message.snapshot.pieces) +
          (message.snapshot.pieceMoves ? size(message.snapshot.pieceMoves) : 0) +
          (message.snapshot.removedPieces.length ? size(message.snapshot.removedPieces) : 0) +
          (message.snapshot.pieceOrder ? size(message.snapshot.pieceOrder) : 0)
      : 0
  );
  return sizing;
};

test('a pointer move is activity and its minimal patch holds the moved leaves only', () => {
  const message = update({
    activity: { ...noActivity(), pointerMoves: [{ connectionId: 'p2', position: [0.3, 0.5, 0], updatedAt: 11 }] },
  });
  const sizing = sized(message);
  expect(sizing.kind).toBe('activity');
  expect(sizing.acknowledged).toBe(false);
  expect(sizing.minimalSnapshotBytes).toBe(0);
  expect(sizing.minimalActivityBytes).toBe(size({ pointers: { p2: { position: [0.3, 0.5, 0], updatedAt: 11 } } }));
  expect(sizing.minimalBytes).toBe(size(envelope(message)) + KEY + sizing.minimalActivityBytes);
});

test('a moved piece and a new event are durable: one leaf per piece, the event by id, the rest of the table untouched', () => {
  const message = update({
    completedCommandId: 'cmd-1',
    snapshot: {
      ...noSnapshot(),
      table: { events: [event('e9'), ...events.slice(0, 7)], nextEventNumber: 10 },
      pieces: [piece('b', { position: [0.4, 0.2, 0] })],
      versions: { b: 2 },
    },
  });
  const sizing = sized(message);
  expect(sizing.kind).toBe('durable');
  expect(sizing.acknowledged).toBe(true);
  expect(sizing.minimalPieceBytes).toBe(size({ b: { position: [0.4, 0.2, 0] } }));
  expect(sizing.minimalSnapshotBytes).toBe(
    size({
      versions: { b: 2 },
      table: {
        pieces: { b: { position: [0.4, 0.2, 0] } },
        events: { e9: event('e9'), e8: null, order: ['e9', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'] },
        nextEventNumber: 10,
      },
    })
  );
  expect(sizing.minimalActivityBytes).toBe(0);
  expect(sizing.minimalBytes).toBe(size(envelope(message)) + KEY + sizing.minimalSnapshotBytes);
});

test('a move the room sends as a piece move counts as piece bytes, and its largest patch shows it', () => {
  const move: NonNullable<SnapshotChange['pieceMoves']>[number] = {
    id: 'b',
    position: [0.4, 0.2, 0],
    orientation: 0,
    zoneId: null,
    flipRevision: null,
  };
  const message = update({ snapshot: { ...noSnapshot(), pieceMoves: [move], versions: { b: 2 } } });
  const sizing = sized(message);
  expect(sizing.kind).toBe('durable');
  /* The room still sends the empty list of whole pieces beside the move. */
  expect(sizing.pieceBytes).toBe(size([]) + size([move]));
  expect(sizing.minimalPieceBytes).toBe(size({ b: { position: [0.4, 0.2, 0] } }));
  const ledger = updateLedger();
  ledger.add('protocol-player', sizing, message);
  const [largest] = ledger.summary().byRecipientClass['protocol-player'].largestPiecePatches;
  expect(largest.pieceBytes).toBe(sizing.pieceBytes);
  assert.ok(largest.sent);
  const excerpt = z.object({ pieceMoves: z.unknown() }).parse(JSON.parse(largest.sent));
  expect(excerpt.pieceMoves).toEqual([move]);
});

test('a flipped item inside a piece is addressed by its id', () => {
  const flipped = piece('b', { items: [item('b-1', true), item('b-2')] });
  const sizing = sized(update({ snapshot: { ...noSnapshot(), pieces: [flipped], versions: { b: 2 } } }));
  expect(sizing.kind).toBe('durable');
  expect(sizing.minimalPieceBytes).toBe(size({ b: { items: { 'b-1': { faceUp: true } } } }));
});

test('a deck flip reverses the stack, so the whole item list beats a patch by id that must carry the order', () => {
  const deck = piece('deck', {
    items: Array.from({ length: 40 }, (_, n) => ({ id: `card-${'0'.repeat(60)}${n}`, faceUp: true })),
  });
  const before = view();
  before.snapshot.table.pieces.push(deck);
  before.snapshot.versions.deck = 1;
  const flipped = { ...deck, items: deck.items.map((card) => ({ ...card, faceUp: false })).reverse() };
  const message = update({ snapshot: { ...noSnapshot(), pieces: [flipped], versions: { deck: 2 } } });
  const after = applyRoomUpdate(before, message);
  assert.ok(after);
  const sizing = sizeUpdate(before, after, message, size(message));
  expect(sizing.kind).toBe('durable');
  expect(sizing.minimalPieceBytes).toBe(size({ deck: { items: flipped.items } }));
  expect(sizing.minimalPieceBytes).toBeLessThan(sizing.pieceBytes);
  const byId: { items: Record<string, { faceUp: boolean } | string[]> } = {
    items: Object.fromEntries(flipped.items.map((card) => [card.id, { faceUp: false }])),
  };
  byId.items.order = flipped.items.map((card) => card.id);
  expect(size({ deck: byId })).toBeGreaterThan(sizing.minimalPieceBytes);
});

test('a split shrinks the deck and appends a piece as the room sends it, with no order and no whole array', () => {
  const before = view();
  const deck = piece('deck', { items: Array.from({ length: 6 }, (_, n) => item(`deck-${n}`)) });
  before.snapshot.table.pieces.push(deck);
  before.snapshot.versions.deck = 1;
  const kept = { ...deck, items: deck.items.slice(0, 4) };
  const taken = piece('taken', { items: deck.items.slice(4) });
  const next = {
    ...before,
    sequence: 5,
    snapshot: {
      ...before.snapshot,
      revision: 8,
      versions: { ...before.snapshot.versions, deck: 2, taken: 1 },
      table: { ...before.snapshot.table, pieces: [...before.snapshot.table.pieces.slice(0, 3), kept, taken] },
    },
  };
  const message = { ...update({}), ...frameChange(before, next) };
  /* The room sends the whole order whenever the id list changes, an appended piece included. */
  expect(message.snapshot!.pieceOrder).toEqual(['a', 'b', 'c', 'deck', 'taken']);
  const after = applyRoomUpdate(before, message);
  assert.ok(after);
  const sizing = sizeUpdate(before, after, message, size(message));
  expect(sizing.kind).toBe('durable');
  expect(sizing.minimalPieceBytes).toBe(size({ deck: { items: { 'deck-4': null, 'deck-5': null } }, taken }));
});

test('a removed piece is a null entry and nothing else', () => {
  const sizing = sized(update({ snapshot: { ...noSnapshot(), removedPieces: ['a'], removedVersions: ['a'] } }));
  expect(sizing.kind).toBe('durable');
  expect(sizing.minimalPieceBytes).toBe(size({ a: null }));
  expect(sizing.minimalSnapshotBytes).toBe(size({ versions: { a: null }, table: { pieces: { a: null } } }));
});

test('a reordered table is the order alone', () => {
  const sizing = sized(update({ snapshot: { ...noSnapshot(), pieceOrder: ['c', 'a', 'b'] } }));
  expect(sizing.kind).toBe('durable');
  expect(sizing.minimalPieceBytes).toBe(size({ order: ['c', 'a', 'b'] }));
});

test('an update that changes nothing visible is empty and its minimal size is the envelope as sent', () => {
  const message = update({ completedCommandId: 'cmd-2', snapshot: noSnapshot() });
  const sizing = sized(message);
  expect(sizing.kind).toBe('empty');
  expect(sizing.acknowledged).toBe(true);
  expect(sizing.minimalSnapshotBytes).toBe(0);
  expect(sizing.minimalActivityBytes).toBe(0);
  expect(sizing.minimalBytes).toBe(size(envelope(message)));
});

test('a carry pose is activity addressed by the carry id with the held piece patched inside it', () => {
  const message = update({
    activity: {
      ...noActivity(),
      carryMoves: [{ id: 'c1', position: [0.9, 0.2, 0], orientation: 90, expiresAt: 2000, sourceSeq: 4 }],
    },
  });
  const sizing = sized(message);
  expect(sizing.kind).toBe('activity');
  expect(sizing.minimalActivityBytes).toBe(
    size({ carries: { c1: { held: { position: [0.9, 0.2, 0], orientation: 90 }, expiresAt: 2000, sourceSeq: 4 } } })
  );
});

test('a pickup and a cancel replace the one-entry carry list whole, since that beats a key and a null', () => {
  const picked = carry('c2', piece('taken'));
  const sizing = sized(update({ activity: { ...noActivity(), carries: [picked], removedCarries: ['c1'] } }));
  expect(sizing.kind).toBe('activity');
  expect(size({ carries: [picked] })).toBeLessThan(size({ carries: { c2: picked, c1: null } }));
  expect(sizing.minimalActivityBytes).toBe(size({ carries: [picked] }));
});

test('a removed and an appended pointer leave the aligned path; an appended one alone is not empty', () => {
  const joined = pointer('p3', 0.7);
  const replaced = sized(update({ activity: { ...noActivity(), pointers: [joined], removedPointers: ['p1'] } }));
  expect(replaced.kind).toBe('activity');
  expect(replaced.minimalActivityBytes).toBe(size({ pointers: { p3: joined, p1: null } }));
  const appended = sized(update({ activity: { ...noActivity(), pointers: [joined] } }));
  expect(appended.kind).toBe('activity');
  expect(appended.minimalActivityBytes).toBe(size({ pointers: { p3: joined } }));
});

test('the ledger sums per recipient class, keeps empty samples and states the shares', () => {
  const ledger = updateLedger();
  const both = sized(
    update({
      snapshot: { ...noSnapshot(), pieces: [piece('a', { orientation: 90 })], versions: { a: 2 } },
      activity: { ...noActivity(), pointerMoves: [{ connectionId: 'p1', position: [0.9, 0.5, 0], updatedAt: 12 }] },
    })
  );
  const empty = sized(update({ completedCommandId: 'ack', snapshot: noSnapshot() }));
  const bothMessage = { sequence: 5, snapshot: { revision: 8 } };
  ledger.add('protocol-player', both, bothMessage);
  ledger.add('protocol-player', both, bothMessage);
  ledger.add('protocol-observer', both, bothMessage);
  for (let index = 0; index < 5; index++) {
    ledger.add('protocol-observer', empty, { sequence: index });
  }
  const summary = ledger.summary(3, 12);
  const counters = (sizing: ReturnType<typeof sizeUpdate>, count: number) =>
    Object.fromEntries(
      Object.entries({ ...sizing, deliveries: 1, acknowledged: sizing.acknowledged ? 1 : 0 })
        .filter(([name]) => name !== 'kind' && name !== 'piecePatch')
        .map(([name, value]) => {
          assert.equal(typeof value, 'number');
          return [name, Number(value) * count];
        })
    );
  const sum = (...parts: Record<string, number>[]) =>
    parts.reduce(
      (total, part) =>
        Object.fromEntries(Object.entries(part).map(([name, value]) => [name, value + (total[name] ?? 0)])),
      {} as Record<string, number>
    );
  expect(summary.unclassified).toBe(3);
  expect(summary.coordinatorMs).toBe(12);
  expect(summary.total).toEqual(sum(counters(both, 3), counters(empty, 5)));
  expect(summary.emptyDeliveryShare).toBe(0.625);
  expect(summary.byRecipientClass['protocol-player'].both).toEqual(counters(both, 2));
  expect(summary.byRecipientClass['protocol-observer'].empty).toEqual(counters(empty, 5));
  expect(summary.byRecipientClass['protocol-observer'].emptySamples).toEqual([
    { sequence: 0 },
    { sequence: 1 },
    { sequence: 2 },
  ]);
  expect(summary.byRecipientClass['protocol-player'].emptySamples).toEqual([]);
  expect(summary.byRecipientClass['protocol-player'].largestPiecePatches).toEqual([
    expect.objectContaining({
      revision: 8,
      minimalPieceBytes: both.minimalPieceBytes,
      minimal: JSON.stringify({ a: { orientation: 90 } }),
    }),
  ]);
  expect(summary.byRecipientClass['protocol-observer'].largestPiecePatches).toHaveLength(1);
  const total = summary.total;
  const share = (sent: number, minimal: number) => Number((1 - minimal / sent).toFixed(3));
  expect(summary.repeatedShare).toEqual({
    all: share(total.bytes, total.minimalBytes),
    snapshot: share(total.snapshotBytes, total.minimalSnapshotBytes),
    pieces: share(total.pieceBytes, total.minimalPieceBytes),
    activity: share(total.activityBytes, total.minimalActivityBytes),
  });
  expect(summary.repeatedShare.pieces).toBeGreaterThan(0.9);
});

test('the largest piece patches are the three biggest distinct revisions, in descending order', () => {
  const ledger = updateLedger();
  const durable = (revision: number, pieces: TablePiece[], removedPieces: string[] = []) =>
    update({
      snapshot: { ...noSnapshot(), revision, pieces, removedPieces, versions: {}, removedVersions: removedPieces },
    });
  const messages = [
    durable(8, [piece('a', { orientation: 90 })]),
    durable(9, [piece('b', { locked: true, orientation: 45 })]),
    durable(10, [], ['c']),
    durable(11, [piece('a', { items: [item('a-1', true), item('a-2', true)] })]),
  ];
  const sizes: number[] = [];
  for (const message of messages) {
    const before = view();
    before.snapshot.revision = message.snapshot!.baseRevision;
    const applied = applyRoomUpdate(before, message);
    assert.ok(applied);
    const sizing = sizeUpdate(before, applied, message, size(message));
    sizes.push(sizing.minimalPieceBytes);
    for (const peer of ['p1', 'p2']) {
      ledger.add('protocol-player', sizing, { ...message, sequence: peer === 'p1' ? 5 : 6 });
    }
  }
  const expected = messages
    .map((message, index) => ({ revision: message.snapshot!.revision, minimalPieceBytes: sizes[index] }))
    .sort((a, b) => b.minimalPieceBytes - a.minimalPieceBytes)
    .slice(0, 3);
  expect(new Set(sizes).size).toBe(4);
  expect(
    ledger.summary().byRecipientClass['protocol-player'].largestPiecePatches.map(({ revision, minimalPieceBytes }) => ({
      revision,
      minimalPieceBytes,
    }))
  ).toEqual(expected);
});
