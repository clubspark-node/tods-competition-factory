import { modifyDrawNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';

// constants and types
import { MAIN, QUALIFYING, VOLUNTARY_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { DRAFT_STATE, POSITION_ACTIONS } from '@Constants/extensionConstants';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { BYE } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { TimeItem } from '@Types/tournamentTypes';
import { HydratedSide } from '@Types/hydrated';
import {
  ASSIGN_COURT,
  ASSIGN_VENUE,
  ASSIGN_OFFICIAL,
  COURT_ANNOTATION,
  SCHEDULED_DATE,
  SCHEDULED_TIME,
  ALLOCATE_COURTS,
  COURT_ORDER,
} from '@Constants/timeItemConstants';

export function resetDrawDefinition({ tournamentRecord, removeScheduling, removeAssignments, drawDefinition }) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  // for matchups in all structures:
  // remove all drawPositions which are not first round or fed
  // remove all extensions
  // if removeScheudling, remove all scheduling timeItems

  // for all structures which are NOT QUALIFYING or MAIN { stageSequence: 1 }
  // remove all positionAssignments that are not BYE
  // if removeAssignments, also remove assignments from MAIN/QUALIFYING stageSequence 1

  const isLuckyDraw = isLuckyBasedDraw(drawDefinition.drawType);
  const matchUpsMap = getMatchUpsMap({ drawDefinition });

  const getRawMatchUp = (matchUpId) => matchUpsMap?.drawMatchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);

  for (const structure of drawDefinition.structures || []) {
    const { positionAssignments, stage, stageSequence } = structure;

    // Voluntary consolation structures: clear all matchUps and assignments.
    // VC matchUps are always dynamically added (either AD_HOC or via generateVoluntaryConsolation)
    // and should be fully cleared on reset.
    if (stage === VOLUNTARY_CONSOLATION) {
      structure.matchUps = [];
      if (structure.positionAssignments) {
        structure.positionAssignments = structure.positionAssignments.map((a) => {
          delete a.participantId;
          return a;
        });
      }
      structure.seedAssignments = [];
      continue;
    }

    const isMainOrQualifyingFirst = stageSequence === 1 && [QUALIFYING, MAIN].includes(stage);

    // Lucky draws: remove virtual positions created by luckyDrawAdvancement.
    // For MAIN/QUALIFYING stageSequence 1: keep R1 positions (with participants
    // and BYEs) unless removeAssignments is set. For playoff structures: clear
    // all assignments since participants arrived via link propagation.
    if (isLuckyDraw && positionAssignments) {
      const initialDrawPositions = new Set(
        (structure.matchUps || [])
          .filter((m: any) => m.roundNumber === 1)
          .flatMap((m: any) => m.drawPositions || [])
          .filter(Boolean),
      );

      if (isMainOrQualifyingFirst) {
        // Keep R1 position slots; clear participants/byes only if removeAssignments
        structure.positionAssignments = positionAssignments
          .filter((a) => initialDrawPositions.has(a.drawPosition))
          .map((a) => {
            if (removeAssignments) {
              delete a.bye;
              delete a.participantId;
            }
            return a;
          });
        if (removeAssignments) {
          structure.seedAssignments = [];
        }
      } else {
        // Playoff structures: clear all assignments
        structure.positionAssignments = [];
        structure.seedAssignments = [];
      }
    }
    // Standard draws: reset positionAssignments where appropriate
    else if (positionAssignments && (!isMainOrQualifyingFirst || removeAssignments)) {
      structure.positionAssignments = positionAssignments.map((assignment) => {
        delete assignment.participantId;
        return assignment;
      });
      structure.seedAssignments = [];
    }

    const { matchUps: inContextMatchUps, isRoundRobin } = getAllStructureMatchUps({
      afterRecoveryTimes: false,
      inContext: true,
      matchUpsMap,
      structure,
    });

    // reset all matchUps to initial state
    for (const inContextMatchUp of inContextMatchUps) {
      const { matchUpId, roundNumber } = inContextMatchUp;
      const sides: HydratedSide[] = inContextMatchUp.sides || [];
      const matchUp = getRawMatchUp(matchUpId);
      if (matchUp) {
        delete matchUp.extensions;
        delete matchUp.notes;

        if (isLuckyDraw) {
          // Lucky draws: reset matchUps to initial state.
          // R2+ matchUps lose all drawPositions (they're virtual from luckyDrawAdvancement).
          // Preserve R1 BYE matchUps when assignments are kept (removeAssignments=false).
          if (!removeAssignments && matchUp.matchUpStatus === BYE) {
            // BYE matchUp stays as-is when preserving assignments
          } else {
            Object.assign(matchUp, toBePlayed);
          }
          if (roundNumber && roundNumber > 1) {
            matchUp.drawPositions = [];
          }
        } else {
          if (matchUp.matchUpStatus !== BYE) Object.assign(matchUp, toBePlayed);
          if (roundNumber && roundNumber > 1 && matchUp.drawPositions?.length && !isRoundRobin) {
            const fedDrawPositions = sides
              ?.map(({ drawPosition, participantFed }) => !participantFed && drawPosition)
              .filter(Boolean);
            const drawPositions = matchUp.drawPositions.map((drawPosition) =>
              fedDrawPositions.includes(drawPosition) ? undefined : drawPosition,
            ) as number[];
            matchUp.drawPositions = drawPositions;
          }
        }

        if (removeScheduling) {
          delete matchUp.timeItems;
        } else if (matchUp.timeItems?.length) {
          matchUp.timeItems = matchUp.timeItems.filter(
            (timeItem: TimeItem) =>
              timeItem.itemType &&
              ![
                ALLOCATE_COURTS,
                ASSIGN_COURT,
                ASSIGN_VENUE,
                ASSIGN_OFFICIAL,
                COURT_ANNOTATION,
                SCHEDULED_DATE,
                SCHEDULED_TIME,
                COURT_ORDER,
              ].includes(timeItem.itemType),
          );
        }

        modifyMatchUpNotice({
          tournamentId: tournamentRecord?.tournamentId,
          context: 'resetDrawDefinition',
          drawDefinition,
          matchUp,
        });
      }
    }
  }

  drawDefinition.extensions = drawDefinition.extensions.filter(
    (extension) => extension.name !== POSITION_ACTIONS && extension.name !== DRAFT_STATE,
  );

  const structureIds = (drawDefinition.structures || []).map(({ structureId }) => structureId);

  modifyDrawNotice({ drawDefinition, structureIds });

  return { ...SUCCESS };
}
