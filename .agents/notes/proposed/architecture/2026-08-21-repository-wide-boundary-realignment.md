# Agent Note: Repository-wide strict boundary realignment

Status: proposed

English | [中文](2026-08-21-repository-wide-boundary-realignment.zh.md)

## Problem

The repository violates one boundary invariant in five places: facades forward only, persistence accepts only the current format, views render only, cross-package access uses public entries only, and tunables come from one source.

1. **A load-time compatibility layer.** The persistence coordinator converts pre-react-loop events to current shapes on every read: `legacyMessageId` through four `migrateLegacy*` functions run inside `adoptStoredEvents`/`snapshotStoredEvents` (`packages/session/session-persistence/src/coordinator.ts:313`). This contradicts the stated stance that `SESSION_FORMAT_VERSION` stays `0` and backends reject old formats, and it makes the same file reject `request/header-delta` loudly while silently converting `steering/message`. `TurnEndCancelCause` also keeps a permanent `{ kind: 'legacy' }` variant written only by the migration (`packages/core/session/src/types.ts:150`).
2. **Package entries carry implementations.** `ToolRuntime` in `packages/core/tools/src/index.ts:787` and `DynamicCordisRunnerService` in `packages/extensions/cordis-host-runner/src/index.ts:124` keep their whole implementations in the package entry, merging facade and implementation in one file.
3. **Mixed-responsibility files.** `packages/host/apiproxy/src/api-proxy.ts:1051` (3658 lines) mixes RPC frame encoding, argument validation, session projections, and six business domains. `packages/client/ui-trajectory/src/client/TrajectoryTable.tsx:1693` (3074 lines) stacks about forty subviews and hardcodes user-visible copy such as `Usage` and `Source`, bypassing the `ctx.locale` service its package already registers.
4. **Deep cross-package imports.** `packages/test-support/client-runtime/src/index.ts:28` imports `@deepseek-ai/dsh-client-ui-renderer/src/client/bind.ts` past the public entry. The published `exports` of that package also advertises `./src/*` while `files` omits `src`, so the packed artifact cannot resolve that subpath.
5. **Dual APIs and scattered hardcoding.** `ClientTimerService` (`packages/extensions/cordis-client-runner/src/client/timer.ts:42`) keeps deprecated `setTimeout`/`setInterval` aliases for parity with vendored Cordis, with no production callers. `web-fetch-http` (`packages/web/web-fetch-http/src/index.ts:25`) hardcodes `0.0.1` in the `User-Agent` while the package version is `0.1.0-rc.8`, and `DSH Local Build` appears separately in the build config and the runtime component.

## Proposal

One decision: return the whole repository to the invariant above, in five independent tracks that can land as separate changes. Each track states its before/after data path; behavior differences are listed under acceptance criteria.

### Track 1: terminate load-time session migration

Before: backend read (jsonl `format.ts` or sqlite) → `adoptStoredEvents`/`snapshotStoredEvents` → `migrateLegacy*` conversion → `snapshotSessionEvent` validation → `Session` → `deriveMessages` → model request and UI projections. The compatibility cost sits in the second hop and leaks into the core domain types.

After: backend read → `assertSupportedEvents` validates the single current format only, refusing with the event type and seq → `Session` → `deriveMessages`. Old records take one of two routes:

- **Migrate once, then reject.** Ship an offline migration command that rewrites the supported old records into current envelopes, then refuse every old shape; delete the command after use, following the [temporary fixture migrator](../../proposed/process/2026-07-26-remove-packed-session-fixture-migrator.md) precedent.
- **Reject outright (shipped).** Ship no migration command; refuse all old records. The cost is losing the ability to open pre-react-loop logs. The shipped behavior lives in [session-legacy-shape-termination](../../implemented/architecture/2026-08-21-session-legacy-shape-termination.md).

Both routes remove the load-time dual track; they differ only in whether old data is preserved.

### Track 2: package entries become facades

- `dsh-tools`: move `ToolRuntime` and the guard, scheduling, and presentation pipeline to `src/runtime.ts`; the entry keeps types and forwarding exports.
- `dsh-cordis-host-runner`: move `DynamicCordisRunnerService` and error formatting to `src/runner.ts`; the entry keeps the branded ids, `Config`, types, and forwarding.
- `dsh-host-apiproxy`: split `api-proxy.ts` by domain — frame encoding stays in the fetch/rpc carrier layer, while session history and backscan, projections, pending approvals/questions, workspaces, presets, and search each get a module; `createApiProxy` only assembles. The entry is already a facade and stays.
- `dsh-session`: separate `SessionStore` and `Session` into files; the entry only forwards.
- A facade check becomes mechanical: an entry contains no `class ... extends Service` bodies and no domain algorithms, only type declarations and exports.

The tool-execution path is unchanged before and after: tool call → `tools/pre-execute` (waterfall) → `tools/execute` → provider → `tools/post-execute` → `tool/result`. This track moves `ToolRuntime` from the entry to `runtime.ts` without changing runtime events or registration semantics.

### Track 3: client UI returns to its files, locale, and tokens

- Split `TrajectoryTable.tsx` into the main table (virtualization, selection, detail state) and `panels/` (Usage/Token, system-prompt diff, tool catalog, message source, record presentation); icons and constants go to `icons.tsx` and `constants.ts`.
- Route every user-visible string through `ctx.locale.bind(NS)`, completing the paired zh/en dictionary; remove the hardcoded English copy from the component.
- Rehome visual constants: scroll and virtualization thresholds are logic and stay as module constants; column widths and panel sizes move to `TrajectoryTable.module.css` or the `ui-theme` design tokens, not component code.

Before: session events → session projection/snapshot → `TrajectoryTable` local state → virtual-row grouping → React render, with copy and sizes inlined in the component.

After: the same path, with state and virtualization in the main table, panels rendering from props only, copy from `ctx.locale`, and sizes from CSS variables. Behavior is unchanged; only file locations and the copy source move.

### Track 4: cross-package access uses public entries only

- Export `bindSnapshotSelector` and `createSlotRenderer` from the public `client` entry of `dsh-client-ui-renderer`; switch `test-support/client-runtime` to import from `@deepseek-ai/dsh-client-ui-renderer/client`.
- Delete the `./src/*` subpath from the published `exports`; it points at `src`, which `files` does not ship, so the packed artifact cannot resolve it.
- Before landing, `rg 'dsh-client-ui-renderer/src'` must show only those two import lines (that is the current state).

### Track 5: remove dual APIs and collect hardcoding

- Delete `ClientTimerService.setTimeout`/`setInterval` and their mixin entries; consumers use `ctx.timeout()`/`ctx.interval()` uniformly.
- Derive the `User-Agent` version from the package `version`; delete the `0.0.1` literal.
- Give `DSH Local Build` one source: the build injects `process.env.DSH_CLIENT_TITLE`, and `DocumentTitle` no longer carries a second literal.
- Hoist the copy-feedback `1000` ms literals into one `ui-primitives` constant.

## Out of scope

- The `agent-loop` event flow and the extension points declared in [docs/architecture.md](../../../../docs/architecture.md) do not change; this is structural realignment, not a new capability.
- No new state, table/virtualization, or schema library, no new package, and no replacement of the Cordis/seam vocabulary with another stack's layer names such as MVVM or L0–L5.
- No load-time dual track or permanent adapter for any old format; the one-time migration command is deleted after use.
- No unrelated reordering and no incidental behavior changes; behavior differences appear only in the acceptance criteria.

## Alternatives considered

### Session loading: keep load-time conversion (status quo)
- Pro: old logs stay open with no migration action.
- Con: a permanent dual track that contradicts rejecting old formats, mixes rejection and conversion in one file, and lets the `legacy` variant pollute domain types.

### Session loading: reject outright with no migration command
- Pro: the largest deletion and the simplest implementation.
- Con: pre-release development sessions and existing downstream logs, such as YoDsh's, can no longer be opened. Kept as a candidate and preferred if downstream confirms no old data exists.

### Package entries: split each seam role into its own package
- Pro: seam roles separate fully at the package level.
- Con: contradicts the declared architecture that one package may combine roles, with a change surface far larger than the benefit.

### Trajectory: split the component without i18n
- Pro: a smaller diff.
- Con: hardcoded copy remains, detached from the `ctx.locale` mechanism already present in the package.

### Trajectory: rewrite on another table/virtualization dependency
- Pro: might delete some home-grown virtualization code.
- Con: changes behavior and dependencies, beyond structural realignment.

## Acceptance criteria

- Session loading: no `migrateLegacy*`, `legacyMessageId`, or `needsLegacyPrefix` in production code; no `legacy` variant in `TurnEndCancelCause`; old records are either rewritten by the migration command or refused by `assertSupportedEvents` naming the event type and seq; legacy fixtures and snapshots are re-recorded under the testing policy, with new rejection counterexamples.
- Facades: every package entry contains only type declarations and export statements; `api-proxy.ts` is split into domain files and `createApiProxy` only assembles.
- UI: the file split lands; `KIND_LABEL`, tab, and panel copy come entirely from the locale dictionary; visual sizes come from CSS; existing client-test assertions do not change, only mount paths move.
- Public entries: `rg 'dsh-client-ui-renderer/src'` is empty; the published `exports` has no `./src/*`; `verify-node-next-types` and a packed-artifact smoke pass.
- Dual APIs and hardcoding: `ClientTimerService` has no `setTimeout`/`setInterval` methods; the `0.0.1` and duplicated title literals are gone.
- Gates: `pnpm run test`, `test:coverage`, `typecheck`, `lint`, `build`, `hygiene`, and `doc-sync` are green; each landing change updates this note or its successor.

## Risks

- Track 1 changes behavior: the one-time migration must run before the release window and rejection errors must name the format and direction; outright rejection gives up old data.
- Track 3 produces a large diff, and virtualization plus drag-resize interplay is regression-prone; split into behavior-neutral commits and rely on the existing client tests.
- Dictionary completion changes user-visible copy, so it is a behavior change and needs snapshot verification under the testing policy.
- Deleting the `./src/*` export breaks the build if another deep importer was missed; the whole-repository grep is the guard.
- Removing the `setTimeout`/`setInterval` aliases is a public API change the pre-release stance permits; downstream YoDsh must follow if it calls them.
