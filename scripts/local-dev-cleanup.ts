import path from 'node:path';

import { localDevelopmentReservationDirectory, resolveGitCommonDirectory } from './local-dev-instance';
import { readLocalDevelopmentInstanceReservation, stopLocalDevelopmentInstance } from './local-dev-reservation';

const rootDirectory = path.resolve(import.meta.dirname, '..');
const commonGitDirectory = resolveGitCommonDirectory(rootDirectory);
const reservationDirectory = commonGitDirectory ? localDevelopmentReservationDirectory(commonGitDirectory) : undefined;
const reservedInstance = reservationDirectory
  ? readLocalDevelopmentInstanceReservation(rootDirectory, process.env, reservationDirectory)
  : undefined;
const reservationToken = process.env.LOCAL_DEV_RESERVATION_TOKEN;
if (!reservationToken || !reservedInstance || reservedInstance.reservationToken !== reservationToken) {
  process.exit(0);
}

if (!reservationDirectory) {
  throw new Error('Could not resolve the shared Git directory for local cleanup');
}
await stopLocalDevelopmentInstance(reservedInstance, reservationDirectory, process.env);
