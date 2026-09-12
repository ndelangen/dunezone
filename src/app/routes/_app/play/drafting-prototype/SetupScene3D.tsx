/* @jsxImportSource ../three-jsx */
/* PROTOTYPE (#1146): the dealt tokens at the stations, and the pieces a player has dragged from the hand or an inventory onto the table, laid out from their own station toward the centre. Throwaway; never merged. */
import { useTexture } from '@react-three/drei/webgpu';
import { BOARD_RIM_SURFACE_Y } from '@shared/play/tableGeometry';
import { PLAYER_RING_RADIUS, tableSeatAngles } from '@shared/play/tableSettings';
import { Suspense, useMemo } from 'react';
import { SRGBColorSpace } from 'three';

import { factionById } from './fixture';
import { FACTION_LEADERS } from './leaders.fixture';
import { mySeat, toSwapState } from './setup';
import type { PlacedPiece, SetupAction, SetupState } from './setup';
import { SwapScene3D } from './SwapScene3D';

/* The published face of a leader, a 600px capture of the same renderer as the inventory, on the disc's inscribed circle. */
function leaderFaceUrl(piece: PlacedPiece): string | null {
  const faction = FACTION_LEADERS.find((candidate) => candidate.slug === piece.faction);
  return faction && piece.memberId ? `https://dune.zone/published/leaders/${faction.id}.${piece.memberId}/leader.jpg` : null;
}

function ImageFace({ url }: { url: string }) {
  const loaded = useTexture(url);
  const face = useMemo(() => {
    loaded.colorSpace = SRGBColorSpace;
    loaded.anisotropy = 8;
    loaded.needsUpdate = true;
    return loaded;
  }, [loaded]);
  return <meshBasicMaterial map={face} toneMapped={false} />;
}

/* A leader disc lands face down: the faction colour up; flipped, its published face shows. */
function LeaderDisc({ piece, colour }: { piece: PlacedPiece; colour: string }) {
  const url = piece.faceDown ? null : leaderFaceUrl(piece);
  return (
    <group>
      <mesh position={[0, 0.035, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.07, 48]} />
        <meshStandardMaterial color={colour} roughness={0.55} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.071, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.3, 64]} />
        {url ? (
          <Suspense fallback={<meshBasicMaterial color={colour} toneMapped={false} />}>
            <ImageFace url={url} />
          </Suspense>
        ) : (
          <meshBasicMaterial color={colour} toneMapped={false} />
        )}
      </mesh>
    </group>
  );
}

function CardPiece({ piece, colour, tokenImage }: { piece: PlacedPiece; colour: string; tokenImage?: string }) {
  const faceColour = piece.faceDown ? '#2a1f1b' : '#f3e6c6';
  return (
    <group>
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.5, 0.7]} />
        <meshStandardMaterial color={faceColour} roughness={0.8} />
      </mesh>
      {!piece.faceDown ? (
        <mesh position={[0, 0.012, -0.05]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.16, 48]} />
          {tokenImage ? (
            <Suspense fallback={<meshBasicMaterial color={colour} toneMapped={false} />}>
              <ImageFace url={tokenImage} />
            </Suspense>
          ) : (
            <meshBasicMaterial color={colour} toneMapped={false} />
          )}
        </mesh>
      ) : null}
    </group>
  );
}

function DeckPiece({ faceDown }: { faceDown: boolean }) {
  return (
    <mesh position={[0, 0.06, 0]} castShadow>
      <boxGeometry args={[0.5, 0.12, 0.7]} />
      <meshStandardMaterial color={faceDown ? '#2a1f1b' : '#f3e6c6'} roughness={0.8} />
    </mesh>
  );
}

function TokenPiece({ colour }: { colour: string }) {
  return (
    <mesh position={[0, 0.03, 0]} castShadow>
      <cylinderGeometry args={[0.22, 0.22, 0.06, 32]} />
      <meshStandardMaterial color={colour} roughness={0.6} />
    </mesh>
  );
}

/* Placed pieces sit in a line from the player's station toward the centre, turned like the tokens so their top faces the centre; a click flips one, standing in for the table's hover and F. */
function PlacedPieces({ state, dispatch }: { state: SetupState; dispatch: (action: SetupAction) => void }) {
  const me = mySeat(state);
  const angle = useMemo(() => (me ? tableSeatAngles(state.seats.length as 4 | 5 | 6)[me.index] : 0), [me, state.seats.length]);
  if (!me) {
    return null;
  }
  const faction = factionById(me.faction);
  return (
    <group>
      {state.placed.map((piece, index) => {
        const radius = PLAYER_RING_RADIUS - 1.0 - index * 0.75;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const pieceFaction = factionById(piece.faction);
        return (
          <group
            key={piece.id}
            position={[x, BOARD_RIM_SURFACE_Y, z]}
            rotation={[0, Math.PI / 2 - angle, 0]}
            onClick={(event) => {
              event.stopPropagation();
              dispatch({ type: 'flip', piece: piece.id });
            }}
          >
            {piece.shape === 'disc' ? <LeaderDisc piece={piece} colour={faction.colour} /> : null}
            {piece.shape === 'card' ? <CardPiece piece={piece} colour={pieceFaction.colour} tokenImage={pieceFaction.tokenImage} /> : null}
            {piece.shape === 'deck' ? <DeckPiece faceDown={piece.faceDown} /> : null}
            {piece.shape === 'token' ? <TokenPiece colour="#bdb3a4" /> : null}
          </group>
        );
      })}
    </group>
  );
}

export function SetupScene3D({ state, dispatch }: { state: SetupState; dispatch: (action: SetupAction) => void }) {
  return (
    <group>
      <SwapScene3D state={toSwapState(state)} />
      <PlacedPieces state={state} dispatch={dispatch} />
    </group>
  );
}
