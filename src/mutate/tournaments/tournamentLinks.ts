import { addTournamentExtension, removeTournamentExtension } from '@Mutate/extensions/addRemoveExtensions';
import { writeLegacyEnabled, writeNativeEnabled } from '@Global/state/globalState';
import { getRecordLinkedTournamentIds } from '@Acquire/getRecordLinkedTournamentIds';
import { getTournamentIds } from '@Query/tournaments/getTournamentIds';
import { removeExtension } from '@Mutate/extensions/removeExtension';
import { decorateResult } from '@Functions/global/decorateResult';

// constants and types
import { TournamentRecords, ResultType } from '@Types/factoryTypes';
import { LINKED_TOURNAMENTS } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { INVALID_VALUES, MISSING_TOURNAMENT_ID, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';

/**
 * Stamp a single tournamentRecord with its linked-tournament list, per the
 * current schemaWriteMode.
 *
 * NATIVE writes the flat `record.linkedTournamentIds` first-class attribute
 * and strips any legacy extension. LEGACY writes the legacy wrapper
 * extension `{tournamentIds: []}` and strips any first-class field. DUAL
 * writes both. When `tournamentIds` is empty, both surfaces are cleared.
 */
function writeRecordLinkedTournamentIds(tournamentRecord: any, tournamentIds: string[]): void {
  const isClear = !tournamentIds.length;
  if (writeNativeEnabled() && !isClear) {
    tournamentRecord.linkedTournamentIds = [...tournamentIds];
  } else if (tournamentRecord?.linkedTournamentIds !== undefined) {
    delete tournamentRecord.linkedTournamentIds;
  }

  if (writeLegacyEnabled() && !isClear) {
    addTournamentExtension({
      tournamentRecord,
      extension: { name: LINKED_TOURNAMENTS, value: { tournamentIds: [...tournamentIds] } },
    });
  } else {
    removeTournamentExtension({ tournamentRecord, name: LINKED_TOURNAMENTS });
  }
}

/**
 * Links all tournaments which are currently loaded into competitionEngine state
 */

export function linkTournaments({ tournamentRecords }: { tournamentRecords: TournamentRecords }): ResultType {
  if (typeof tournamentRecords !== 'object' || !Object.keys(tournamentRecords).length)
    return { error: MISSING_TOURNAMENT_RECORDS };

  const result = getTournamentIds({ tournamentRecords });
  const { tournamentIds } = result;

  if (tournamentIds?.length > 1) {
    for (const tournamentRecord of Object.values(tournamentRecords)) {
      writeRecordLinkedTournamentIds(tournamentRecord, tournamentIds);
    }
  }

  return { ...SUCCESS };
}

type UnlinkTournamentsArgs = {
  tournamentRecords: TournamentRecords;
};
export function unlinkTournaments({ tournamentRecords }: UnlinkTournamentsArgs): ResultType {
  if (typeof tournamentRecords !== 'object' || !Object.keys(tournamentRecords).length)
    return { error: MISSING_TOURNAMENT_RECORDS };

  for (const tournamentRecord of Object.values(tournamentRecords)) {
    writeRecordLinkedTournamentIds(tournamentRecord, []);
  }

  // Also remove the legacy extension across every record via the discover
  // path, in case a pre-CODES record still carries it where the
  // single-record helper did not catch it.
  const result = removeExtension({
    name: LINKED_TOURNAMENTS,
    tournamentRecords,
    discover: true,
  });

  return decorateResult({ result, stack: 'unlinkTournaments' });
}

type UnlinkTournamentArgs = {
  tournamentRecords: TournamentRecords;
  tournamentId: string;
};
export function unlinkTournament({ tournamentRecords, tournamentId }: UnlinkTournamentArgs): ResultType {
  if (typeof tournamentRecords !== 'object') return { error: INVALID_VALUES };
  if (!tournamentId) return { error: MISSING_TOURNAMENT_ID };

  const result = getTournamentIds({ tournamentRecords });
  const { tournamentIds } = result;

  if (!tournamentIds.includes(tournamentId)) return { error: MISSING_TOURNAMENT_ID };

  // walk each loaded record (some may not be linked, which is fine)
  for (const currentTournamentId of tournamentIds) {
    const tournamentRecord = tournamentRecords[currentTournamentId];

    // CODES: mode-agnostic read so 5.0.0 NATIVE-written records,
    // pre-CODES extension-only records, and DUAL records all unlink correctly.
    const linkedTournamentIds = getRecordLinkedTournamentIds(tournamentRecord);

    // if there are no tournamentIds, or the only link is self, or this is
    // the record being unlinked: clear both surfaces.
    if (
      !linkedTournamentIds?.length ||
      (linkedTournamentIds.length === 1 && linkedTournamentIds.includes(tournamentId)) ||
      currentTournamentId === tournamentId
    ) {
      writeRecordLinkedTournamentIds(tournamentRecord, []);
      continue;
    }

    const remaining = linkedTournamentIds.filter((linkedTournamentId) => linkedTournamentId !== tournamentId);
    writeRecordLinkedTournamentIds(tournamentRecord, remaining);
  }

  return { ...SUCCESS };
}
