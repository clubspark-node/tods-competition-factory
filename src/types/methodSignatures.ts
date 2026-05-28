/**
 * MethodSignatures — per-method typed params + returns for the engine surface.
 *
 * Each entry hangs `typeof <fn>` off the source function declaration, so the
 * exposed engine method (`engine.getEvent(...)` etc.) gets the real param and
 * return types without a hand-maintained signature drifting from the impl.
 *
 * v1 covers the highest-traffic queries: events / tournament / participants /
 * matchUps lookups across all the consumer surfaces (TMX, courthive-public,
 * server, ingest). Extension is purely additive — append a new line below and
 * the typed engine surface picks it up. Methods not listed here fall through
 * to the `(...args: any[]) => any` shape on `FactoryEngineTyped`.
 *
 * Naming caveat: some governors re-export a method under a different name
 * (e.g. `publicFindMatchUp as findMatchUp`); the `as typeof` aliases below
 * keep the public engine name on the interface key.
 */

import type { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import type { allEventMatchUps } from '@Query/matchUps/getAllEventMatchUps';
import type { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import type { findDrawDefinition } from '@Acquire/findDrawDefinition';
import type { getEvent } from '@Query/events/getEvent';
import type { getEvents } from '@Query/events/getEvents';
import type { getParticipants } from '@Query/participants/getParticipants';
import type { getPolicyDefinitions } from '@Query/extensions/getAppliedPolicies';
import type { getTournament } from '@Assemblies/engines/parts/stateMethods';
import type { getTournamentInfo } from '@Query/tournaments/getTournamentInfo';
import type { publicFindMatchUp } from '@Acquire/findMatchUp';

export interface MethodSignatures {
  // tournament queries
  getTournament: typeof getTournament;
  getTournamentInfo: typeof getTournamentInfo;
  getPolicyDefinitions: typeof getPolicyDefinitions;

  // event queries
  getEvent: typeof getEvent;
  getEvents: typeof getEvents;

  // participant queries
  getParticipants: typeof getParticipants;

  // matchUp queries
  findMatchUp: typeof publicFindMatchUp;
  allDrawMatchUps: typeof allDrawMatchUps;
  allEventMatchUps: typeof allEventMatchUps;
  allTournamentMatchUps: typeof allTournamentMatchUps;

  // draw queries
  findDrawDefinition: typeof findDrawDefinition;
}
