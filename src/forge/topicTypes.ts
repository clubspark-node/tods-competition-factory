/**
 * TopicPayloadMap — discriminated union of subscription topic → payload.
 *
 * Type definitions for the typed event bus (`engine.on/once/off/waitFor`,
 * see `bus.ts`, developer-JOY #5). Each key MUST match a constant in
 * `@Constants/topicConstants`; the value is the shape that the bus passes
 * to subscriber handlers (one notice's `payload` field at a time, not the
 * array of notices the legacy `setSubscriptions` callback receives).
 *
 * Coverage is intentionally partial — the ~10 highest-traffic topics that
 * power TMX, the arena relay, server audit, and ingest. Other topics fall
 * through the index signature and arrive as `unknown`; consumers cast at
 * the call site. Adding a new precisely-typed topic is purely additive:
 * append the key, no other change required.
 *
 * Payload shapes are derived from inspection of `addNotice({ topic, payload })`
 * callsites in `src/mutate/**`. Fields that some callsites omit are marked
 * optional (e.g. `tournamentId` for participant topics).
 */

import type { MatchUp, Event, DrawDefinition, Tournament } from '@Types/tournamentTypes';

// ============================================================================
// Per-topic payload shapes
// ============================================================================

export interface AddEventPayload {
  tournamentId: string;
  event: Event;
}

export interface AddDrawDefinitionPayload {
  tournamentId: string;
  eventId: string;
  drawDefinition: DrawDefinition;
}

export interface ModifyDrawDefinitionPayload {
  tournamentId: string;
  eventId: string;
  drawDefinition: DrawDefinition;
}

export interface DeletedDrawIdsPayload {
  tournamentId: string;
  eventId?: string;
  drawId: string;
}

export interface AddMatchUpsPayload {
  tournamentId: string;
  eventId: string;
  matchUps: MatchUp[];
}

export interface ModifyMatchUpPayload {
  tournamentId: string;
  matchUp: MatchUp;
  context?: { [key: string]: any };
}

export interface DeletedMatchUpIdsPayload {
  tournamentId: string;
  eventId?: string;
  matchUpIds: string[];
  action?: string;
}

export interface AddParticipantsPayload {
  /** Some emit sites (e.g. mergeParticipants) omit tournamentId. */
  tournamentId?: string;
  participants: any[];
}

export interface ModifyParticipantsPayload {
  tournamentId?: string;
  participants: any[];
}

export interface DeleteParticipantsPayload {
  tournamentId?: string;
  participantIds: string[];
}

export interface PublishEventPayload {
  tournamentId: string;
  eventData: any;
}

export interface ModifyTournamentDetailPayload {
  tournamentRecord: Tournament;
}

// ============================================================================
// TopicPayloadMap
// ============================================================================

/**
 * Subscribers passed to `engine.on(topic, handler)` receive one payload per
 * invocation (the bus iterates the underlying notice array for you). The
 * mapped types here select payload shape from topic name.
 *
 * Topics not in this map are still subscribable — they fall through the
 * index signature and arrive as `unknown`. Use a type cast or narrow at
 * the call site:
 *
 *   engine.on('SOME_FUTURE_TOPIC', (p) => {
 *     const payload = p as { foo: string };
 *     // ...
 *   });
 */
export interface TopicPayloadMap {
  addEvent: AddEventPayload;
  addDrawDefinition: AddDrawDefinitionPayload;
  modifyDrawDefinition: ModifyDrawDefinitionPayload;
  deletedDrawIds: DeletedDrawIdsPayload;
  addMatchUps: AddMatchUpsPayload;
  modifyMatchUp: ModifyMatchUpPayload;
  deletedMatchUpIds: DeletedMatchUpIdsPayload;
  addParticipants: AddParticipantsPayload;
  modifyParticipants: ModifyParticipantsPayload;
  deleteParticipants: DeleteParticipantsPayload;
  publishEvent: PublishEventPayload;
  modifyTournamentDetail: ModifyTournamentDetailPayload;

  // Catch-all for un-typed topics — keeps the bus typeable without forcing
  // every consumer to add their own map. Listed last so IDE completion still
  // prefers the precisely-typed keys above.
  [topic: string]: unknown;
}

export type Topic = keyof TopicPayloadMap & string;
