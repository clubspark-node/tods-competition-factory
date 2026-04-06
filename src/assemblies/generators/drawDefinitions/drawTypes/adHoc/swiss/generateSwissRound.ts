// Query
import { getCompetitionState } from '@Query/drawDefinition/competition/getCompetitionState';
import { getCompetitionPolicy } from '@Query/drawDefinition/competition/getCompetitionPolicy';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';

// Generators
import { getParticipantIds } from '../drawMatic/getParticipantIds';
import { generateAdHocMatchUps } from '../generateAdHocMatchUps';
import { getAdHocRatings } from '../drawMatic/getAdHocRatings';
import { generateSwissPairings } from './swissPairing';

// Acquire
import { findStructure } from '@Acquire/findStructure';
import { findExtension } from '@Acquire/findExtension';

// Constants
import { MISSING_DRAW_DEFINITION, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import type { SwissPolicy } from '@Types/swissTypes';
import { ResultType } from '@Types/factoryTypes';

type GenerateSwissRoundArgs = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  swissPolicy?: SwissPolicy;
  participantIds?: string[];
  structureId?: string;
  matchUpIds?: string[];
  scaleName?: string;
  idPrefix?: string;
  isMock?: boolean;
  event: Event;
};

type GenerateSwissRoundResult = ResultType & {
  byeParticipantId?: string;
  roundNumber?: number;
  matchUps?: MatchUp[];
};

export function generateSwissRound(params: GenerateSwissRoundArgs): GenerateSwissRoundResult {
  const { drawDefinition, tournamentRecord, event } = params;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const structure = params.structureId
    ? findStructure({ drawDefinition, structureId: params.structureId }).structure
    : drawDefinition.structures?.find((s) => isAdHoc({ structure: s }));

  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const idsResult = getParticipantIds({ ...params, restrictEntryStatus: true });
  if (idsResult.error) return idsResult;
  const participantIds = idsResult.participantIds ?? [];

  // Competition policy: use dynamic form ratings when available
  const { competitionPolicy } = getCompetitionPolicy({ tournamentRecord, drawDefinition, event });
  const { competitionState } = competitionPolicy ? getCompetitionState({ drawDefinition }) : { competitionState: undefined };

  let adHocRatings: Record<string, number>;
  if (competitionPolicy && competitionState && competitionPolicy.pairingPolicy.ratingSource === 'DYNAMIC_FORM') {
    adHocRatings = {};
    for (const [pid, pState] of Object.entries(competitionState.participantStates)) {
      adHocRatings[pid] = pState.dynamicFormRating;
    }
  } else {
    // get ratings for initial round seeding
    adHocRatings = getAdHocRatings({
      participantIds,
      tournamentRecord,
      scaleName: params.scaleName,
      event,
    });
  }

  // get swiss policy from extension or params
  const swissPolicy =
    params.swissPolicy ??
    (findExtension({ element: drawDefinition, name: 'swissPolicy' })?.extension?.value as SwissPolicy | undefined);

  const existingMatchUps = structure.matchUps ?? [];

  const { participantIdPairings, byeParticipantId } = generateSwissPairings({
    allowDraws: swissPolicy?.allowDraws,
    matchUps: existingMatchUps,
    participantIds,
    adHocRatings,
  });

  const result = generateAdHocMatchUps({
    structureId: structure.structureId,
    participantIdPairings,
    matchUpIds: params.matchUpIds,
    idPrefix: params.idPrefix,
    isMock: params.isMock,
    drawDefinition,
    newRound: true,
    event,
  });

  if (result.error) return result;

  return {
    roundNumber: result.roundNumber,
    matchUps: result.matchUps,
    byeParticipantId,
    ...SUCCESS,
  };
}
