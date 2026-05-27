/**
 * Forge namespace — staging area for new factory functionality before it
 * graduates to a governor or query module. See `forge.md` for the original
 * 2.x vision.
 *
 * Currently hosts the developer-JOY prototype facades:
 *  - `engine.q.*` — the unwrap query facade (see `q.ts`, #2)
 *  - `engine.inspect()` — the live state snapshot (see `inspect.ts`, #8)
 *  - `engine.on/once/off/waitFor` — the typed event bus (see `bus.ts`, #5)
 *
 * All are wired onto the engine in `assemblies/engines/parts/engineStart.ts`.
 */

export { buildQueryFacade, queryRegistry } from './q';
export type { QueryFacade } from './q';
export { inspect } from './inspect';
export type { EngineInspection, EngineInspectionCounts } from './inspect';
export { createEventBus } from './bus';
export type { EventBus, EventHandler, EventPredicate, Unsubscribe } from './bus';
export type { Topic, TopicPayloadMap } from './topicTypes';

// Legacy placeholder export retained for prior consumers.
export const forge = {};
export default forge;
