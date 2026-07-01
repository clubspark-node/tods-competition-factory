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
//  - DRAW_POSITIONS_NOT_SORTED: a matchUp's drawPositions are not stored ascending
//    (ignoring empty slots) — the sort invariant the rest of the engine relies on to
//    derive sides, fed positions (Math.min), and rendering.
//  - EXIT_WITHOUT_LOSER: a single WALKOVER/DEFAULTED with a winningSide whose LOSING
//    side holds no participant — a walkover with nobody who walked over (an orphaned
//    exit). A pending exit is not flagged: there the loser side holds the exit carrier.
export const WINNING_SIDE_WITHOUT_PARTICIPANT = 'WINNING_SIDE_WITHOUT_PARTICIPANT';
export const WINNING_SIDE_ADVANCEMENT_MISMATCH = 'WINNING_SIDE_ADVANCEMENT_MISMATCH';
export const DRAW_POSITIONS_NOT_SORTED = 'DRAW_POSITIONS_NOT_SORTED';
export const EXIT_CODE_ON_WINNER_SIDE = 'EXIT_CODE_ON_WINNER_SIDE';
export const EXIT_WITHOUT_LOSER = 'EXIT_WITHOUT_LOSER';

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
    const { winningSide, matchUpStatus, matchUpStatusCodes, sides, matchUpId, winnerMatchUpId, drawPositions } =
      matchUp;

    // DRAW_POSITIONS_NOT_SORTED — applies to every matchUp (the ascending-sort invariant)
    const filledPositions = (drawPositions ?? []).filter((drawPosition) => typeof drawPosition === 'number');
    const ascending = [...filledPositions].sort((a, b) => a - b);
    if (filledPositions.some((drawPosition, index) => drawPosition !== ascending[index])) {
      inconsistencies.push({
        matchUpId,
        structureId: matchUp.structureId,
        issueType: DRAW_POSITIONS_NOT_SORTED,
        message: 'drawPositions are not stored in ascending order',
        drawPositions,
      });
    }

    if (!winningSide || !sides) continue;

    // match by explicit sideNumber — a still-empty feed slot can be a side object with
    // no sideNumber, which would wrongly satisfy `sideNumber !== winningSide`
    const winnerSide = sides.find((side) => side.sideNumber === winningSide);
    const loserSide = sides.find((side) => side.sideNumber === (winningSide === 1 ? 2 : 1));
    const exit = isExit(matchUpStatus);
    const singleExit = exit && ![DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUpStatus);
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
    if (singleExit && codeString(matchUpStatusCodes?.[winningSide - 1])) {
      inconsistencies.push({
        ...base,
        issueType: EXIT_CODE_ON_WINNER_SIDE,
        message: 'exit status code sits on the winning side rather than the exiting (loser) side',
      });
    }

    // EXIT_WITHOUT_LOSER (single exit whose loser slot is empty — nobody walked over).
    // A pending exit is fine: its loser side holds the exit carrier.
    if (singleExit && !loserSide?.participantId && !loserSide?.bye) {
      inconsistencies.push({
        ...base,
        issueType: EXIT_WITHOUT_LOSER,
        message: 'exit matchUp has a winningSide but no participant on the losing (exiting) side',
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
