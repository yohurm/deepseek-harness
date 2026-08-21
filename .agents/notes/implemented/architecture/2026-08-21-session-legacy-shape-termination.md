# Agent Note: Session legacy-shape import terminates at the persistence boundary

Status: implemented

English | [中文](2026-08-21-session-legacy-shape-termination.zh.md)

## Problem

The persistence coordinator converted supported pre-react-loop and pre-identity session records on every read: pre-identity messages received deterministic ids, `steering/message` became `user/message`, `turn/start` lost its `trigger`, and retired `turn/end` reasons were remapped. The two import exceptions existed because early sessions persisted messages before identities existed and the react-loop rename removed steering; both shapes are superseded by the current envelopes. The conversion contradicted the `SESSION_FORMAT_VERSION` 0 promise that no upgrade path ships, mixed loud refusal of some old shapes with silent conversion of others in one boundary, and left `TurnEndCancelCause` carrying a `legacy` variant only the migration wrote.

## Decision

The shared append boundary and every load path now refuse every retired v0 shape: `steering/message`, pre-identity `user/message`, `assistant/message`, and `tool/result` events, a `turn/start` with a `trigger`, and retired `turn/end` reasons (`disposed`, `aborted` without a cause, `error` without the structured failure). `assertSupportedEvents` names the event type and seq, and current-format `turn/end` envelopes and reasons are validated in the same pass. The conversion functions, `legacyMessageId`, the message-id inheritance map, and the `legacy` variant of `TurnEndCancelCause` are deleted. Storage stays append-only; no v0 upgrade path ships.

## Alternatives considered

### Keep the read-time conversion
- Pro: old logs stay open with no migration action.
- Con: a permanent dual track that contradicts the no-upgrade-path promise, mixes refusal and conversion, and pollutes the core turn-end type. Rejected.

### One-time offline migration, then reject
- Pro: preserves pre-react-loop logs.
- Con: adds transitional machinery ahead of the same end state, and the format-0 promise already says no upgrade path ships. Rejected.

### Reject outright (chosen)
- Pro: one behavior at every boundary, no transitional command, and the retired shapes cannot re-enter durable storage through the public API.
- Con: pre-react-loop and pre-identity logs can no longer be opened.

## Consequences

- Pre-react-loop and pre-identity logs refuse to open; the error names the shape and seq.
- The append boundary rejects a stale JavaScript plugin that persists a retired shape.
- Current-format `turn/end` shape validation lives at the durable boundary instead of inside a conversion step.
- The coordinator-contract and resume fixtures flip from conversion to refusal.
- The [boundary realignment proposal](../../proposed/architecture/2026-08-21-repository-wide-boundary-realignment.md) owns the repository-wide plan; this note owns the shipped session part.
