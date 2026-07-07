# CLAUDE.md — tods-competition-factory-cs

## What This Is

A TypeScript library that manages tournament records conforming to the **Tennis Open Data Standards (TODS)**. Its core purpose: ensure state integrity by being the single authoritative source of all tournament state mutations. Every change to a tournament record — scores, participant movement, draw creation — goes through this library.

The library is maintained as a fork/customised version of the upstream `tods-competition-factory` project at CourtHive.

---

## Data Model (Hierarchy)

```
Tournament
  └── events[]
        └── drawDefinitions[]
              ├── structures[]
              │     ├── matchUps[]        (the actual matches)
              │     └── structures[]      (nested, e.g. round-robin groups)
              └── links[]               (connects structures: winner/loser routing)
```

Key types (defined in `src/types/tournamentTypes.ts`):
- **Tournament**: Root object; has participants, venues, events
- **Event**: Competition category (e.g. Men's Singles); has entries and draw definitions
- **DrawDefinition**: One draw (e.g. main draw, consolation); has structures and links
- **Structure**: A group of matchUps in rounds; identified by `finishingPosition` (ROUND_OUTCOME vs WIN_RATIO)
- **MatchUp**: A single match; has `drawPositions`, `sides`, `score`, `matchUpStatus`, `winningSide`
- **DrawLink**: Connects two structures with direction (WINNER → next round, LOSER → consolation); has `linkCondition` (e.g. FIRST_MATCHUP)

---

## Engine Architecture

### Engines (`src/assemblies/engines/`)

Engines are stateful singletons that hold tournament records in global state and expose methods to operate on them.

| Engine | Description |
|--------|-------------|
| `syncEngine` | Main synchronous engine; used in browser and simple server setups |
| `asyncEngine` | Async variant for high-throughput server scenarios |
| `askEngine` | Read-only engine; queries without any mutations |
| `matchUpEngine` | Lightweight engine for operating on a single drawDefinition |
| `mocksEngine` | Generates synthetic tournament records for testing |

All engines are created via the same pattern in `engineStart.ts`:
- `setState()` / `getState()`: load/retrieve tournament records
- `execute({ method, ...params })`: dispatch a named method
- `executionQueue(directives, rollbackOnError)`: run multiple methods atomically

### Invocation chain (sync)

```
engine.execute({ method: 'setMatchUpStatus', ...params })
  └── engineInvoke()               src/assemblies/engines/sync/engineInvoke.ts
        ├── Resolves method name
        ├── executeFunction()       wraps the governor function
        ├── On success: notifySubscribers()
        └── deleteNotices()
```

### Governors (`src/assemblies/governors/`)

Governors are plain object collections of functions, grouped by domain. They are imported by engines via `methodImporter`. Each governor folder has a `mutate.ts` and `query.ts` that re-export from `src/mutate/` and `src/query/`.

| Governor | Domain |
|----------|--------|
| `matchUpGovernor` | Match state, score setting, participant assignment |
| `scoreGovernor` | Score-specific operations (used by matchUpEngine) |
| `drawsGovernor` | Draw creation, participant seeding |
| `eventGovernor` | Event management |
| `participantGovernor` | Participant CRUD |
| `scheduleGovernor` | Court/time scheduling |
| `policyGovernor` | Policy attachment (scoring, progression, avoidance, etc.) |
| `generationGovernor` | Generating draws and structures |
| `mocksGovernor` | Mock data generation |
| others | tournament, venue, publishing, reporting, etc. |

---

## Source Directory Map

```
src/
  acquire/          Lookup helpers (findMatchUp, findStructure, findEvent, findPolicy…)
  assemblies/
    engines/        Engine implementations (sync, async, ask, mock, matchUp)
    generators/     Pure generators (score strings, draw structures, tieMatchUp score)
    governors/      Public API surface — re-exports from mutate/ and query/
    tools/          Utilities exposed publicly
  constants/        All string constants (matchUpStatus, errorConditions, policyTypes…)
  forge/            Pipe-based functional API (alternative usage pattern)
  functions/        Utility functions (decorateResult, globalLog, factoryVersion)
  global/           Global state management (syncGlobalState, notifySubscribers)
  helpers/          Parameter resolution, policy helpers
  mutate/           All state mutations (THE business logic lives here)
    drawDefinitions/  Draw-level mutations and matchUp governor internals
    events/           Event mutations
    matchUps/
      drawPositions/  Participant positioning and movement
      lineUps/        Team lineup management
      matchUpFormat/  Format changes
      matchUpStatus/  Status/score setting (setMatchUpStatus, setMatchUpState)
      score/          Score modification (modifyMatchUpScore, updateTieMatchUpScore)
      schedule/       Schedule item mutations
      sides/          Side participant management
  query/            All read operations (no mutations)
    drawDefinition/   Draw-level queries (isActiveDownstream, positionsGetter…)
    matchUp/          MatchUp queries (positionTargets, checkStatusType…)
    matchUps/         Collection queries (getAllDrawMatchUps, getMatchUpsMap…)
  types/            TypeScript type definitions
  validators/       Input validation (validateScore, isExit…)
```

---

## Key Patterns

### Result Pattern

Every function returns `{ success: true, ...data }` or `{ error: ERROR_CONSTANT, ...context }`. Error constants are strings from `src/constants/errorConditionConstants.ts`.

```ts
import { SUCCESS } from '@Constants/resultConstants';
return { ...SUCCESS };  // { success: true }
return { error: MISSING_DRAW_DEFINITION };
```

### decorateResult

Wraps a result with stack trace info for debugging:
```ts
return decorateResult({ result, stack: 'myFunctionName' });
```

### MatchUp Status Categories

See `src/constants/matchUpStatusConstants.ts`.

**Directing statuses** — cause participant advancement in the draw:
- `COMPLETED`, `RETIRED`, `DEFAULTED`, `WALKOVER`, `BYE`
- `DOUBLE_WALKOVER`, `DOUBLE_DEFAULT` (produce a WALKOVER in the consolation)

**Non-directing statuses** — no participant movement:
- `TO_BE_PLAYED`, `IN_PROGRESS`, `INCOMPLETE`, `SUSPENDED`
- `CANCELLED`, `ABANDONED`, `AWAITING_RESULT`, `DEAD_RUBBER`, `NOT_PLAYED`

**Exit statuses** (from `src/validators/isExit.ts`):
- `WALKOVER`, `DEFAULTED`, `RETIRED` — these propagate into consolation draws

### positionTargets

`src/query/matchUp/positionTargets.ts` — given a matchUpId, returns the `winnerMatchUp`, `loserMatchUp`, `byeMatchUp` and corresponding `DrawLink`s. Used throughout the progression logic. In ROUND_OUTCOME structures (elimination) it uses round links; in WIN_RATIO structures (round robin) it returns the matchUp itself.

### isActiveDownstream

`src/query/drawDefinition/isActiveDownstream.ts` — recursively checks whether changing a matchUp's result would affect participants who have already progressed further in the draw. Returns `true` if there are active downstream dependencies that prevent safe modification.

### hasPropagatedExitDownstream

`src/query/drawDefinition/hasPropagatedExitDownstream.ts` — checks if the loser matchUp already has propagated exit statuses that prevent clearing the source matchUp's score. Returns `true` only when the loser matchUp is a DOUBLE_WALKOVER with upstream exits, or has a propagated exit with another upstream exit.

---

## Status Propagation — Quick Reference

Call chain summary:

```
setMatchUpStatus()           [src/mutate/matchUps/matchUpStatus/setMatchUpStatus.ts]
  → setMatchUpState()        [src/mutate/matchUps/matchUpStatus/setMatchUpState.ts]
      ├── noDownstreamDependencies()
      │     ├── attemptToSetWinningSide()
      │     │     ├── removeDirectedParticipants()
      │     │     └── directParticipants()
      │     │           ├── directWinner()          ← suppressed when the exit's winning side is still an empty feed slot
      │     │           └── directLoser()    ← sets progressExitStatus in context
      │     ├── removeDirectedParticipants() (on score removal)
      │     └── attemptToSetMatchUpStatus()
      ├── winningSideWithDownstreamDependencies()  (same winner, already directed)
      └── applyMatchUpValues()                     (status-only, no movement)
  → [loop] progressExitStatus()   ← while progressResult.context.loserMatchUp is set
        ├── opponent is a BYE: matchUp stays BYE, participant advances through it,
        │     re-propagate onto the next round where they land (loop continues)
        ├── opponent slot empty/pending, or opponent present & not itself exited:
        │     WALKOVER/DEFAULTED — the non-exit side wins; status code is placed
        │     position-aware on the exiting participant's side (never a bare [code])
        └── opponent already exited: DOUBLE_WALKOVER
```

### Propagated-exit cascade through consolation BYEs

A propagated WALKOVER/DEFAULT can feed into a consolation matchUp whose opponent
is a BYE. That matchUp is **not** marked WALKOVER — a BYE cannot lose — the exiting
participant advances through it (matchUp stays BYE) and the exit is re-applied at
the next round where they land. This can leave a **pending** exit: a matchUp marked
WALKOVER/DEFAULTED whose winning side is still an empty feed slot awaiting whoever
falls through later.

- **Auto-resolve on fall-through (BYE path)** — `advanceWinner` in
  `assignDrawPositionBye.ts`: when a real participant advances into that empty
  winning slot, they take the walkover — status is kept, they become the winner,
  the carried status code moves to the exiting participant's (opposite) side, and
  they advance onward. See `resolvePropagatedExitOnAdvance`.
- **Auto-resolve on fall-through (real-match path)** — `assignMatchUpDrawPosition.ts`:
  when a *real* consolation match (not a BYE) resolves the pending exit, `winningSide`
  and the carried code must be re-derived from the advancing participant's new
  (post-sort) side — not the pre-sort `winningSide`, which can end up pointing at
  the exiting/loser participant instead.
- **`isActiveMatchUp`** (`activeMatchUp.ts`) and **`isActiveDownstream`**
  (`isActiveDownstream.ts`) treat a pending exit (empty winning slot) as inactive,
  but a **resolved** one (winning side occupied by a real participant) as active —
  including through a fed FMLC BYE the exit advanced through. This means resetting
  a source matchUp is **blocked** once its propagated exit has resolved downstream;
  the operator must undo the consolation result first (standard active-downstream
  rule). Resetting while the exit is still pending is allowed and clears cleanly
  (`positionClear.ts` drops the stale `winningSide`/codes on collapse to BYE/TO_BE_PLAYED).

### Known limitations (not fixed — confirmed present in upstream CourtHive's own code too)

Surfaced via code review (Fable 5) and follow-up testing while building the fix above. None of these are regressions from porting the fix — they're residual gaps in the cascade/auto-resolve/block-reset model itself, verified byte-for-byte identical in the upstream maintainer's shipped code. Documented here rather than fixed, so nobody rediscovers them from scratch:

- **Multi-hop BYE chains**: `isActiveDownstream`'s fed-BYE exception (see above) only looks one BYE hop ahead. If a propagated exit cascades through **two consecutive** consolation BYEs before resolving, resetting the original source is wrongly *allowed* — the block only catches single-hop cascades.
- **A BYE (not a real participant) lands in a pending exit's empty slot**: both `advanceWinner` (`assignDrawPositionBye.ts`) and `assignMatchUpDrawPosition.ts` mishandle this — the exit status can be silently dropped instead of re-cascading, and/or leave stale `matchUpStatusCodes` on a BYE matchUp.
- **`resolvePropagatedExitOnAdvance`** has no guard against being invoked on an exit that's already resolved (theoretical — no known reachable path today, but no guard by construction either).
- **`findAdvancementMatchUp`** (BYE-cascade landing-spot search in `progressExitStatus.ts`) only searches within the *same* structure. A cascade that would cross into a different structure (e.g. a second consolation bracket) silently drops the exit instead of re-propagating.
- **A separate, pre-existing `isActiveDownstream` branch** (`loserMatchUpExit`/`propagatedLoserParticipant`, used for direct feed-round consolation types like `CURTIS_CONSOLATION` — a *different* code path from the fed-BYE branch above) wrongly **allows** resetting a source whose propagated exit already resolved via a direct (non-BYE) feed, and leaves real corruption: the source reverts to `TO_BE_PLAYED` while the consolation matchUp stays `WALKOVER` with the fallen-through winner still advanced past it. Reproduced with `CURTIS_CONSOLATION`, drawSize 32. This one is not literally upstream's fix's problem to have solved (it's an older, separate mechanism), but the exact code is identical there too.

If you hit unexpected active-downstream or exit-status behavior that doesn't match the model above, check whether it matches one of these first before assuming a new bug.

---

## Draw Types

| Draw Type | Key Behaviour |
|-----------|--------------|
| `SINGLE_ELIMINATION` | Losers eliminated; winners advance |
| `FIRST_MATCH_LOSER_CONSOLATION` | First-match losers enter consolation; subsequent losers are eliminated |
| `FIRST_ROUND_LOSER_CONSOLATION` | All first-round losers enter consolation |
| `FEED_IN_CHAMPIONSHIP` | Losers fed back in at each round |
| `COMPASS` | 8-direction draw: East, West, North, South, NE, NW, SE, SW |
| `ROUND_ROBIN` | All vs all within a group; WIN_RATIO `finishingPosition` |
| `ROUND_ROBIN_WITH_PLAYOFF` | RR groups feeding into an elimination playoff |
| `DOUBLE_ELIMINATION` | Two losses to eliminate |
| `AD_HOC` | Unstructured, no fixed draw positions |
| `LUCKY_DRAW` | Lottery-based assignment |

---

## Team Matches (TEAM / Tie Format)

Team matchUps (`matchUpType: TEAM`) contain `tieMatchUps[]` (singles/doubles matches within a tie). 

- Scoring a tieMatchUp triggers `updateTieMatchUpScore()` which recalculates the parent TEAM matchUp's score
- Auto-calculation can be disabled per matchUp via the `DISABLE_AUTO_CALC` extension (`_disableAutoCalc` flag)
- `enableAutoCalc` param in `setMatchUpState` re-enables auto-calc and triggers a score recalculation

---

## Policies

Policies are attached to tournaments, events, or draw definitions and control behaviour:

| Policy Type | Controls |
|-------------|---------|
| `POLICY_TYPE_SCORING` | Score validation, `requireParticipantsForScoring`, `allowChangePropagation`, `processCodes` |
| `POLICY_TYPE_PROGRESSION` | `autoReplaceQualifiers`, `autoPlaceQualifiers`, `autoRemoveQualifiers` |
| `POLICY_TYPE_AVOIDANCE` | Draw avoidance rules (nationality, club, etc.) |
| `POLICY_TYPE_SEEDING` | Seeding rules |
| `POLICY_TYPE_DRAW_DEFINITION` | Draw size and structure constraints |

Policies are resolved hierarchically: `policyDefinitions` param > tournament-level > draw-level > event-level.

---

## Testing

- ~1900 tests using **Vitest** (`pnpm test`)
- Server tests using **Jest** (`pnpm test:server`)
- Tests for matchUp status logic live in `src/tests/mutations/matchUps/matchUpStatus/`
- `mocksEngine` generates synthetic tournament records for all tests

### Standard Test Pattern

```ts
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine'; // alias for syncEngine with all governors imported
import { expect, it } from 'vitest';

it('description', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION, // or FEED_IN_CHAMPIONSHIP, COMPASS, etc.
        participantsCount: 8,   // actual players (can be less than drawSize for byes)
        drawSize: 8,
        idPrefix: 'm',          // optional: makes IDs predictable
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  // Get all matchUps with context (stage, roundNumber, roundPosition, readyToScore, sides with participants)
  let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

  // Find a specific matchUp
  const target = matchUps.find(
    ({ stage, roundNumber, roundPosition, readyToScore }) =>
      stage === MAIN && roundNumber === 1 && roundPosition === 1 && readyToScore,
  );

  // Generate an outcome from a score string
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-1 6-2',
    winningSide: 1,
  });

  // Set the result
  const result = tournamentEngine.setMatchUpStatus({
    matchUpId: target.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  // Re-fetch matchUps to see updated state
  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

  // Assert on a specific matchUp
  const consolationMatch = matchUps.find(
    ({ stage, roundNumber, roundPosition }) =>
      stage === CONSOLATION && roundNumber === 1 && roundPosition === 1,
  );
  expect(consolationMatch.matchUpStatus).toEqual(WALKOVER);
  expect(consolationMatch.winningSide).toEqual(2);
});
```

### Key mocksEngine methods
- `generateTournamentRecord({ drawProfiles })` → `{ tournamentRecord, drawIds, eventIds, participantIds }`
- `generateOutcomeFromScoreString({ scoreString, winningSide })` → `{ outcome }` (outcome has score + matchUpStatus + winningSide)
- `mocksEngine.generateTournamentRecord` creates participants automatically unless you pass `participants`

### `tournamentEngine` alias
`src/tests/engines/syncEngine/index.ts` imports `syncEngine` and calls `syncEngine.importMethods(governors, true, 1)`, making all governors available. `competitionEngine` and `tournamentEngine` are both aliases for the same singleton `syncEngine`.

### inContext vs raw matchUps

This distinction matters when reading vs mutating:

- **`matchUpsMap.drawMatchUps`** — raw matchUp objects from the draw structure. **Mutations happen here.** No participant data — only drawPositions and IDs.
- **`inContextDrawMatchUps`** — hydrated matchUps with participant info, `stage`, `roundNumber`, `roundPosition`, `sides[].participant`, `readyToScore`, etc. Used for routing logic and display. **Never mutated directly.**
- `tournamentEngine.allTournamentMatchUps().matchUps` returns in-context matchUps (hydrated).

### Key test constants
```ts
import { MAIN, CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, FEED_IN_CHAMPIONSHIP, COMPASS } from '@Constants/drawDefinitionConstants';
import { WALKOVER, DOUBLE_WALKOVER, DEFAULTED, COMPLETED, TO_BE_PLAYED, BYE } from '@Constants/matchUpStatusConstants';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed'; // { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } }
```

## Development Commands

```bash
pnpm test              # run all Vitest tests
pnpm test:server       # run Jest server tests
pnpm build             # build dist/
pnpm lint              # ESLint + fix
pnpm check-types       # TypeScript type checking
```

## Path Aliases (tsconfig)

```
@Acquire  → src/acquire
@Assemblies → src/assemblies
@Constants → src/constants
@Functions → src/functions
@Generators → src/assemblies/generators  (also @Generators → src/forge/generators)
@Global   → src/global
@Helpers  → src/helpers
@Mutate   → src/mutate
@Query    → src/query
@Tools    → (various utility dirs)
@Types    → src/types
@Validators → src/validators
@Fixtures → src/fixtures
```
