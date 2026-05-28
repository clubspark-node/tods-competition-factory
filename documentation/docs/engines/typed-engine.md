---
title: Typed Engine Surface
---

The `FactoryEngineTyped` type lets consumers opt into a closed, autocomplete-rich view of the engine. It catches typoed method names at compile time and — for the methods listed in `MethodSignatures` — gives real param and return types lifted from the source declarations.

```ts
import { tournamentEngine } from 'tods-competition-factory';
import type { FactoryEngineTyped } from 'tods-competition-factory';

const engine = tournamentEngine as FactoryEngineTyped;

// typed param + return
const { events = [] } = engine.getEvents({ tournamentRecord });
// events: Event[]

// IDE flags typos at compile time
// @ts-expect-error — `getEent` is not in FactoryEngineMethod
engine.getEent({ tournamentRecord });
```

## How it's composed

```ts
type FactoryEngineTyped =
  // 1. methods with real param + return types
  MethodSignatures &
  // 2. fallback for every remaining FactoryEngineMethod
  Record<Exclude<FactoryEngineMethod, keyof MethodSignatures>, (...args: any[]) => any> &
  // 3. the ergonomic facades
  { q: QueryFacade; on: ...; once: ...; off: ...; waitFor: ...; build: BuildFacade };
```

- **`MethodSignatures`** carries the highest-traffic methods. Each entry is a `typeof <source-fn>`, so the type reflects exactly what the implementation accepts and returns — no drift.
- The fallback `Record` keeps every other registered method nameable on the typed engine. As more methods migrate into `MethodSignatures`, the fallback set shrinks. Adding a method is purely additive — it never breaks existing callers.
- The facades — `q`, `on/once/off/waitFor`, `build` — live alongside the methods so consumers reach them with the same `engine.` prefix.

## What's typed today (v1)

| Group       | Method                                                                        | Source                                                          |
| ----------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Tournament  | `getTournament`, `getTournamentInfo`, `getPolicyDefinitions`                  | `src/query/...`, `src/assemblies/engines/parts/stateMethods.ts` |
| Event       | `getEvent`, `getEvents`                                                       | `src/query/events/`                                             |
| Participant | `getParticipants`                                                             | `src/query/participants/`                                       |
| MatchUp     | `findMatchUp`, `allDrawMatchUps`, `allEventMatchUps`, `allTournamentMatchUps` | `src/query/matchUps/`, `src/acquire/findMatchUp.ts`             |
| Draw        | `findDrawDefinition`                                                          | `src/acquire/findDrawDefinition.ts`                             |

`engine.q.*` also returns real TODS types (no more `any[]` / `any`):

```ts
const events: Event[] = engine.q.events();
const event: Event | undefined = engine.q.event({ eventId });
const matchUps: HydratedMatchUp[] = engine.q.matchUps();
const tournament: Tournament | undefined = engine.q.tournament();
```

## Extending the typed surface

Adding a new typed method is two lines:

1. Import the source function declaration into `src/types/methodSignatures.ts`:

   ```ts
   import type { getEventTimeItem } from '@Query/base/timeItems';
   ```

2. Add it to the `MethodSignatures` interface:

   ```ts
   export interface MethodSignatures {
     // … existing
     getEventTimeItem: typeof getEventTimeItem;
   }
   ```

That's it — `FactoryEngineTyped` picks it up automatically, the fallback `Record` drops it (via the `Exclude<FactoryEngineMethod, keyof MethodSignatures>` step), and consumers get real types at the call site. No regenerator script, no separate registry to keep in sync.

### Edge cases

- **Renamed exports.** Some governors re-export a function under a different name (e.g. `publicFindMatchUp as findMatchUp`). Use the source name in the import and the public engine name as the key on the interface:

  ```ts
  import type { publicFindMatchUp } from '@Acquire/findMatchUp';
  export interface MethodSignatures {
    findMatchUp: typeof publicFindMatchUp;
  }
  ```

- **Methods with multiple parameter shapes.** If the source function overloads or accepts a union, `typeof` carries the full union to the engine. No translation needed.

- **Methods whose param type is private to the source file.** `typeof` lifts the function signature including the inline / non-exported param type — no need to export the type from the source file. The structural type makes it through to the dist `.d.ts` automatically.

## Why this exists

Before: `engine.getEvents` had the signature `(...args: any[]) => any`. Every consumer cast the return, every typo compiled cleanly. Today, the same call returns the real `{ events?: Event[]; … }` shape, autocompletes in the IDE, and a misspelled method name is a compile error.

The v1 list above covers the eleven highest-traffic methods across TMX, courthive-public, the server, and ingest. Future passes extend it incrementally — each addition is one new line, no refactor.

See `src/types/methodSignatures.ts` and `src/types/factoryTypes.ts` for the implementation.
