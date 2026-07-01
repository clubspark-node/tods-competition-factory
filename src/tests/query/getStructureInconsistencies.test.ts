import {
  getStructureInconsistencies,
  WINNING_SIDE_ADVANCEMENT_MISMATCH,
  EXIT_CODE_ON_WINNER_SIDE,
} from '@Query/drawDefinition/getStructureInconsistencies';
import { removeAssignment } from '../mutations/drawDefinitions/testingUtilities';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Tests/engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

import {
  COMPASS,
  FIRST_MATCH_LOSER_CONSOLATION,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';
import { WALKOVER } from '@Constants/matchUpStatusConstants';

test.for([[SINGLE_ELIMINATION], [FIRST_MATCH_LOSER_CONSOLATION], [COMPASS], [ROUND_ROBIN_WITH_PLAYOFF]])(
  'reports no inconsistencies for a fully-completed %s draw',
  ([drawType]) => {
    setSubscriptions({});
    const drawId = `clean-${drawType}`;
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 16, drawType }],
      completeAllMatchUps: true,
      setState: true,
    });
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const result: any = tournamentEngine.getStructureInconsistencies({ drawId });
    expect(result.valid).toEqual(true);
    expect(result.inconsistencies).toEqual([]);
    // engine resolves the same drawDefinition
    expect(drawDefinition.drawId).toEqual(drawId);
  },
);

test('detects an advancement mismatch when a completed matchUp winningSide is corrupted to the loser', () => {
  setSubscriptions({});
  const drawId = 'corrupt';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: SINGLE_ELIMINATION, idPrefix: 'm' }],
    completeAllMatchUps: true,
    setState: true,
  });
  // baseline: clean
  expect(tournamentEngine.getStructureInconsistencies({ drawId }).valid).toEqual(true);

  // corrupt: flip a round-1 matchUp's winningSide to the loser while the real winner
  // has already advanced to round 2 (simulates the winningSide/drawPositions drift class).
  // getEvent returns a deep copy — mutate it and run the query directly on that copy.
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures[0];
  const r1 = structure.matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1 && m.winningSide);
  r1.winningSide = r1.winningSide === 1 ? 2 : 1;

  const result: any = getStructureInconsistencies({ drawDefinition });
  expect(result.valid).toEqual(false);
  const mismatch = result.inconsistencies.find((i) => i.matchUpId === r1.matchUpId);
  expect(mismatch?.issueType).toEqual(WINNING_SIDE_ADVANCEMENT_MISMATCH);
});

test('detects an exit code sitting on the winning side', () => {
  setSubscriptions({});
  const drawId = 'exitcode';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: SINGLE_ELIMINATION, idPrefix: 'm' }],
    setState: true,
  });
  const mm = (r, p) =>
    tournamentEngine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.find((m) => m.roundNumber === r && m.roundPosition === p);
  // a normal WALKOVER: winner side has no code, loser side carries the code
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 1, matchUpStatusCodes: ['', 'W1'] },
    matchUpId: mm(1, 1).matchUpId,
    drawId,
  });
  expect(tournamentEngine.getStructureInconsistencies({ drawId }).valid).toEqual(true);

  // corrupt: move the code onto the winning side (side 1) on the deep-copied drawDefinition
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const stored = drawDefinition.structures[0].matchUps.find((m) => m.matchUpId === mm(1, 1).matchUpId);
  stored.matchUpStatusCodes = ['W1', ''];

  const result: any = getStructureInconsistencies({ drawDefinition });
  const issue = result.inconsistencies.find((i) => i.matchUpId === stored.matchUpId);
  expect(issue?.issueType).toEqual(EXIT_CODE_ON_WINNER_SIDE);
});

test('a legitimately PENDING propagated exit is NOT reported as inconsistent', () => {
  setSubscriptions({});
  const drawId = 'pendingExit';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix: 'm' }],
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructureId = drawDefinition.structures[0].structureId;
  [2, 6, 8, 10, 23, 31].forEach((drawPosition) =>
    removeAssignment({ drawId, structureId: mainStructureId, drawPosition, replaceWithBye: true }),
  );
  const mm = (r, p) =>
    tournamentEngine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.find((m) => m.structureId === mainStructureId && m.roundNumber === r && m.roundPosition === p);
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  tournamentEngine.setMatchUpStatus({ matchUpId: mm(1, 2).matchUpId, outcome, drawId });
  // propagate a WALKOVER into the consolation → pending exit (empty winner slot)
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 2, matchUpStatusCodes: ['W1'] },
    propagateExitStatus: true,
    matchUpId: mm(2, 2).matchUpId,
    drawId,
  });

  const result: any = tournamentEngine.getStructureInconsistencies({ drawId });
  expect(result.valid).toEqual(true);
});
