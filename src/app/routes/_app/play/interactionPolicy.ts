export type InteractionSurfacePolicy = {
  debugPanelsVisible: boolean;
  overlaysInert: boolean;
};

export function interactionSurfacePolicy(
  debugPanelsVisible: boolean,
  gestureActivePieceId: string | null,
  sceneInteractionActive = false
): InteractionSurfacePolicy {
  return {
    debugPanelsVisible,
    overlaysInert: sceneInteractionActive || gestureActivePieceId !== null,
  };
}
