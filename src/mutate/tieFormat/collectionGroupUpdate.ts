import { getTargetTeamMatchUps } from '@Query/hierarchical/tieFormats/getTargetTeamMatchUps';
import { updateTargetTeamMatchUps } from '@Mutate/tieFormat/updateTargetTeamMatchUps';
import { calculateWinCriteria } from '@Query/matchUp/calculateWinCriteria';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { writeTieFormat } from '@Mutate/tieFormat/writeTieFormat';
import { validateTieFormat } from '@Validators/validateTieFormat';
import { definedAttributes } from '@Tools/definedAttributes';

// constants and types
import { DrawDefinition, Event, MatchUp, Structure, TieFormat, Tournament } from '@Types/tournamentTypes';
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

type CollectionGroupUpdateArgs = {
  updateInProgressMatchUps?: boolean;
  drawDefinition: DrawDefinition;
  tournamentRecord?: Tournament;
  wasAggregateValue?: boolean;
  originalValueGoal?: number;
  tieFormatName?: string;
  structure?: Structure;
  structureId?: string;
  tieFormat: TieFormat;
  matchUpId?: string;
  matchUp?: MatchUp;
  eventId?: string;
  event?: Event;
};
export function collectionGroupUpdate({
  updateInProgressMatchUps,
  originalValueGoal,
  tournamentRecord,
  wasAggregateValue,
  tieFormatName,
  drawDefinition,
  structureId,
  structure,
  tieFormat,
  matchUpId,
  matchUp,
  eventId,
  event,
}: CollectionGroupUpdateArgs) {
  // calculate new winCriteria for tieFormat
  // if existing winCriteria is aggregateValue, retain
  const { aggregateValue, valueGoal } = calculateWinCriteria(tieFormat);
  tieFormat.winCriteria = definedAttributes({ aggregateValue, valueGoal });

  // if valueGoal has changed, force renaming of the tieFormat
  if ((originalValueGoal && originalValueGoal !== valueGoal) || (aggregateValue && !wasAggregateValue)) {
    if (tieFormatName) {
      tieFormat.tieFormatName = tieFormatName;
    } else {
      delete tieFormat.tieFormatName;
    }
  }

  const { targetMatchUps } = getTargetTeamMatchUps({
    updateInProgressMatchUps,
    drawDefinition,
    structureId,
    structure,
    matchUpId,
    matchUp,
  });

  updateTargetTeamMatchUps({
    updateInProgressMatchUps,
    tournamentRecord,
    targetMatchUps,
    drawDefinition,
    tieFormat,
    event,
  });

  const prunedTieFormat = definedAttributes(tieFormat);
  const result = validateTieFormat({ tieFormat: prunedTieFormat });
  if (result.error) return result;

  if (eventId && event) {
    writeTieFormat({ target: event, tieFormat: prunedTieFormat, event });
  } else if (matchUpId && matchUp) {
    writeTieFormat({ target: matchUp, tieFormat: prunedTieFormat, event });
  } else if (structure) {
    writeTieFormat({ target: structure, tieFormat: prunedTieFormat, event });
  } else if (drawDefinition) {
    writeTieFormat({ target: drawDefinition, tieFormat: prunedTieFormat, event });
  } else if (!matchUp || !drawDefinition) {
    return { error: MISSING_DRAW_DEFINITION };
  }

  modifyDrawNotice({ drawDefinition, eventId: event?.eventId });

  return { ...SUCCESS };
}
