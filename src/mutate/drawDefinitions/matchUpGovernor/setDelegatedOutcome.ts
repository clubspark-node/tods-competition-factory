import { setFirstClassOrExtension } from '../../extensions/setFirstClassOrExtension';
import { generateScoreString } from '@Generators/matchUps/generateScoreString';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

import { DELEGATED_OUTCOME } from '@Constants/extensionConstants';
import {
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_MATCHUP,
  MISSING_VALUE,
} from '@Constants/errorConditionConstants';

export function setDelegatedOutcome({ drawDefinition, matchUpId, outcome, matchUp }) {
  if (!matchUp && !drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!outcome) return { error: MISSING_VALUE, info: 'missing outcome' };
  if (!matchUp && !matchUpId) return { error: MISSING_MATCHUP };

  if (!matchUp) {
    const result = findDrawMatchUp({
      drawDefinition,
      matchUpId,
    });
    if (result.error) return result;
    matchUp = result.matchUp;
  }

  // Accept the canonical outcome: either pre-derived per-side score strings OR a
  // `score.sets` array. Requiring callers to pre-compute scoreStringSide1/2 (as
  // this mutation historically did) forced them to round-trip the canonical
  // score into strings; `setMatchUpStatus` never demanded that.
  const score = typeof outcome === 'object' ? outcome.score : undefined;
  const hasSideStrings = !!(score?.scoreStringSide1 && score?.scoreStringSide2);
  const hasSets = Array.isArray(score?.sets);
  if (!hasSideStrings && !hasSets) {
    return { error: INVALID_VALUES };
  }

  // When only sets are supplied, derive the side strings here with the factory's
  // own generator so the stored outcome stays display-ready.
  const value = hasSideStrings ? outcome : withDerivedSideStrings(outcome, matchUp);

  return setFirstClassOrExtension({
    element: matchUp,
    attribute: 'delegatedOutcome',
    name: DELEGATED_OUTCOME,
    value,
  });
}

function withDerivedSideStrings(outcome, matchUp) {
  const params = {
    sets: outcome.score.sets,
    winningSide: outcome.winningSide,
    matchUpStatus: outcome.matchUpStatus,
    matchUpFormat: outcome.matchUpFormat ?? matchUp?.matchUpFormat,
  };
  const side1 = generateScoreString(params);
  const side2 = generateScoreString({ ...params, reversed: true });
  return {
    ...outcome,
    score: {
      ...outcome.score,
      scoreStringSide1: typeof side1 === 'string' ? side1 : '',
      scoreStringSide2: typeof side2 === 'string' ? side2 : '',
    },
  };
}
