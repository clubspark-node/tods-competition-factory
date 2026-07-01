import {
  getStructureInconsistencies,
  WINNING_SIDE_ADVANCEMENT_MISMATCH,
  DRAW_POSITIONS_NOT_SORTED,
  EXIT_CODE_ON_WINNER_SIDE,
  EXIT_WITHOUT_LOSER,
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

const matchUpAt = (drawId, roundNumber, roundPosition) =>
  tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true })
    .matchUps.find((m) => m.roundNumber === roundNumber && m.roundPosition === roundPosition);

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
  // a normal WALKOVER: winner side has no code, loser side carries the code
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 1, matchUpStatusCodes: ['', 'W1'] },
    matchUpId: matchUpAt(drawId, 1, 1).matchUpId,
    drawId,
  });
  expect(tournamentEngine.getStructureInconsistencies({ drawId }).valid).toEqual(true);

  // corrupt: move the code onto the winning side (side 1) on the deep-copied drawDefinition
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const stored = drawDefinition.structures[0].matchUps.find((m) => m.matchUpId === matchUpAt(drawId, 1, 1).matchUpId);
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

test('detects unsorted drawPositions', () => {
  setSubscriptions({});
  const drawId = 'unsorted';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: SINGLE_ELIMINATION, idPrefix: 'm' }],
    completeAllMatchUps: true,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const target = drawDefinition.structures[0].matchUps.find(
    (m) => (m.drawPositions ?? []).filter(Boolean).length === 2,
  );
  target.drawPositions = [...target.drawPositions].sort((a, b) => b - a); // descending

  const result: any = getStructureInconsistencies({ drawDefinition });
  const issue = result.inconsistencies.find((i) => i.matchUpId === target.matchUpId);
  expect(issue?.issueType).toEqual(DRAW_POSITIONS_NOT_SORTED);
});

test('detects an exit with no participant on the losing side', () => {
  setSubscriptions({});
  const drawId = 'noloser';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: SINGLE_ELIMINATION, idPrefix: 'm' }],
    setState: true,
  });
  const woMatchUp = matchUpAt(drawId, 1, 1);
  const loserDrawPosition = woMatchUp.sides.find((s) => s.sideNumber === 2).drawPosition;
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 1, matchUpStatusCodes: ['', 'W1'] },
    matchUpId: woMatchUp.matchUpId,
    drawId,
  });
  expect(tournamentEngine.getStructureInconsistencies({ drawId }).valid).toEqual(true);

  // corrupt: clear the losing participant's assignment (a walkover with nobody who walked over)
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const assignment = drawDefinition.structures[0].positionAssignments.find((a) => a.drawPosition === loserDrawPosition);
  delete assignment.participantId;

  const result: any = getStructureInconsistencies({ drawDefinition });
  const issue = result.inconsistencies.find((i) => i.matchUpId === woMatchUp.matchUpId);
  expect(issue?.issueType).toEqual(EXIT_WITHOUT_LOSER);
});

// Corpus sweep: no legitimately-generated, fully-completed draw should report any
// inconsistency. Guards against false positives in every check across draw types/sizes.
test.for([
  [SINGLE_ELIMINATION, 8],
  [SINGLE_ELIMINATION, 32],
  [FIRST_MATCH_LOSER_CONSOLATION, 16],
  [FIRST_MATCH_LOSER_CONSOLATION, 32],
  [COMPASS, 16],
  [COMPASS, 32],
  [ROUND_ROBIN_WITH_PLAYOFF, 16],
])('corpus sweep: %s drawSize %d completes with zero inconsistencies', ([drawType, drawSize]) => {
  setSubscriptions({});
  const drawId = `sweep-${drawType}-${drawSize}`;
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize, drawType }],
    completeAllMatchUps: true,
    setState: true,
  });
  const result: any = tournamentEngine.getStructureInconsistencies({ drawId });
  expect(result.inconsistencies).toEqual([]);
  expect(result.valid).toEqual(true);
});
