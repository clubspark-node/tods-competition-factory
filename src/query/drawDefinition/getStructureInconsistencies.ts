import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { isExit } from '@Validators/isExit';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

// A decided matchUp asserts three invariants that the FMLC propagated-exit bugs kept
// violating (each is a distinct issueType so callers can filter):
//  - WINNING_SIDE_WITHOUT_PARTICIPANT: a non-exit decided matchUp whose winning side
//    holds no participant. (A PENDING propagated exit legitimately has an empty winner
//    slot, so exit statuses are excluded here — the advancement check covers them.)
//  - WINNING_SIDE_ADVANCEMENT_MISMATCH: the participant that advanced into this
//    matchUp's winnerMatchUp is the LOSER, not the participant on the winning side —
//    the exact drawPositions-sort-vs-winningSide drift (factory 97fc07b12).
//  - EXIT_CODE_ON_WINNER_SIDE: on a single WALKOVER/DEFAULTED, a status code sits on
//    the winning side rather than the exiting (loser) side.
export const WINNING_SIDE_WITHOUT_PARTICIPANT = 'WINNING_SIDE_WITHOUT_PARTICIPANT';
export const WINNING_SIDE_ADVANCEMENT_MISMATCH = 'WINNING_SIDE_ADVANCEMENT_MISMATCH';
export const EXIT_CODE_ON_WINNER_SIDE = 'EXIT_CODE_ON_WINNER_SIDE';

type StructureInconsistency = {
  issueType: string;
  message: string;
  structureId?: string;
  matchUpId: string;
  [key: string]: any;
};

type GetStructureInconsistenciesArgs = {
  drawDefinition: DrawDefinition;
  tournamentRecord?: Tournament;
  matchUpsMap?: MatchUpsMap;
  structureId?: string;
  event?: Event;
};

function codeString(code: any): string | undefined {
  const value = typeof code === 'string' ? code : code?.code;
  return value || undefined;
}

export function getStructureInconsistencies(
  params: GetStructureInconsistenciesArgs,
): ResultType & { valid?: boolean; inconsistencies?: StructureInconsistency[] } {
  const { drawDefinition, structureId, matchUpsMap } = params;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps ?? [];
  const matchUpById = new Map(inContextDrawMatchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));

  const scoped = inContextDrawMatchUps.filter(
    (matchUp) => !matchUp.collectionId && (!structureId || matchUp.structureId === structureId),
  );

  const inconsistencies: StructureInconsistency[] = [];

  for (const matchUp of scoped) {
    const { winningSide, matchUpStatus, matchUpStatusCodes, sides, matchUpId, winnerMatchUpId } = matchUp;
    if (!winningSide || !sides) continue;

    const winnerSide = sides.find((side) => side.sideNumber === winningSide);
    const loserSide = sides.find((side) => side.sideNumber !== winningSide);
    const exit = isExit(matchUpStatus);
    const base = { matchUpId, structureId: matchUp.structureId, winningSide };

    // WINNING_SIDE_WITHOUT_PARTICIPANT (non-exit only — pending exits may be empty)
    if (!exit && !winnerSide?.participantId && !winnerSide?.bye) {
      inconsistencies.push({
        ...base,
        issueType: WINNING_SIDE_WITHOUT_PARTICIPANT,
        message: 'winningSide points to a side with no participant',
      });
    }

    // EXIT_CODE_ON_WINNER_SIDE (single exit only — double exits carry codes on both sides)
    if (
      exit &&
      ![DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUpStatus) &&
      codeString(matchUpStatusCodes?.[winningSide - 1])
    ) {
      inconsistencies.push({
        ...base,
        issueType: EXIT_CODE_ON_WINNER_SIDE,
        message: 'exit status code sits on the winning side rather than the exiting (loser) side',
      });
    }

    // WINNING_SIDE_ADVANCEMENT_MISMATCH: the loser advanced into the winnerMatchUp while
    // the winning-side participant did not
    const winnerMatchUp = winnerMatchUpId ? matchUpById.get(winnerMatchUpId) : undefined;
    if (winnerSide?.participantId && loserSide?.participantId && winnerMatchUp) {
      const advancedParticipantIds = (winnerMatchUp.sides ?? [])
        .map((side) => side.participantId)
        .filter(Boolean) as string[];
      const loserAdvanced = advancedParticipantIds.includes(loserSide.participantId);
      const winnerAdvanced = advancedParticipantIds.includes(winnerSide.participantId);
      if (loserAdvanced && !winnerAdvanced) {
        inconsistencies.push({
          ...base,
          issueType: WINNING_SIDE_ADVANCEMENT_MISMATCH,
          message:
            'the losing-side participant advanced into the winnerMatchUp instead of the winning-side participant',
          advancedParticipantId: loserSide.participantId,
          winningParticipantId: winnerSide.participantId,
          winnerMatchUpId,
        });
      }
    }
  }

  return { ...SUCCESS, valid: inconsistencies.length === 0, inconsistencies };
}
