import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { getParticipants } from '@Query/participants/getParticipants';

import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { ReportContext } from '@Types/reportTypes';
import { Tournament } from '@Types/tournamentTypes';

type BuildReportContextArgs = {
  tournamentRecord: Tournament;
};

export function buildReportContext({ tournamentRecord }: BuildReportContextArgs): ReportContext | { error: any } {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const { participantMap } = getParticipants({
    withScaleValues: true,
    withSeeding: true,
    withEvents: true,
    withDraws: true,
    tournamentRecord,
  });

  const { matchUps } = allTournamentMatchUps({ tournamentRecord });

  return {
    venues: tournamentRecord.venues ?? [],
    participantMap: participantMap ?? {},
    matchUps: matchUps ?? [],
    tournamentRecord,
  };
}
