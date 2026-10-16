/*
 * The events an immersive page dispatches on the shell's frame (`[data-app-frame]`) as it mounts and unmounts.
 * The shell's band listens and runs its grow and shrink, so the layout never has to import the shell.
 */
export const IMMERSIVE_ENTER_EVENT = 'immersiveenter';
export const IMMERSIVE_LEAVE_EVENT = 'immersiveleave';
