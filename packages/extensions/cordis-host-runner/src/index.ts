/**
 * Dynamic Cordis Plugin service: immutable package definitions, one active run
 * per Plugin, human-approved Client activation, and Host/Client invocation.
 * @module @deepseek-ai/dsh-cordis-host-runner
 */

import type { Fiber } from '@deepseek-ai/cordis'
import type { DynamicCordisRunnerService } from './runner.ts'
import type {
  ApprovalRequestId, CordisDynamicPackageId, CordisDynamicPluginId, CordisDynamicPluginRunId,
  DynamicCordisRenderFailure, DynamicCordisRunAttempt,
} from './types.ts'

export type * from './types.ts'
export type {
  DynamicCordisDefineReceipt, DynamicCordisDefineRequest, DynamicCordisDefinition, DynamicCordisHandler,
  DynamicCordisPackageInspection, DynamicCordisPlugin, DynamicCordisPluginInspection,
  DynamicCordisReference, DynamicCordisRun,
} from './registry.ts'
export { CordisInspectRegistryService } from './inspect-registry.ts'
export type { HostCordisInspectProviderRegistration } from './inspect-registry.ts'
export { HOST_BUILTIN_INSPECTION } from './sandbox.ts'

/**
 * Brand a Host-minted Plugin ID.
 * @param id - opaque identifier minted by the Host registry.
 * @returns the branded Plugin identifier.
 */
export function CordisDynamicPluginId(id: string): CordisDynamicPluginId {
  return id as CordisDynamicPluginId
}

/**
 * Brand a Host-minted Package ID.
 * @param id - opaque identifier minted by the Host registry.
 * @returns the branded Package identifier.
 */
export function CordisDynamicPackageId(id: string): CordisDynamicPackageId {
  return id as CordisDynamicPackageId
}

/**
 * Brand a Host-minted Plugin Run ID.
 * @param id - opaque identifier minted by the Host registry.
 * @returns the branded Plugin Run identifier.
 */
export function CordisDynamicPluginRunId(id: string): CordisDynamicPluginRunId {
  return id as CordisDynamicPluginRunId
}

/**
 * Brand a Host-minted approval request ID.
 * @param id - opaque identifier minted by the Host registry.
 * @returns the branded approval request identifier.
 */
export function ApprovalRequestId(id: string): ApprovalRequestId {
  return id as ApprovalRequestId
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Process-local dynamic Plugin registry and lifecycle service. */
    dynamicCordisRunner: DynamicCordisRunnerService
  }
}

/** Runner configuration. */
export interface Config {
  /** Maximum synchronous VM evaluation time in milliseconds. */
  vmTimeoutMs?: number
}

/** Host-only snapshot consumed by inspect and tool result rendering. */
export interface DynamicCordisSnapshotRow {
  pluginId: CordisDynamicPluginId
  currentPackageId?: CordisDynamicPackageId
  nextPackageId?: CordisDynamicPackageId
  packages: Array<{
    packageId: CordisDynamicPackageId
    name: string
    purpose: string
    hasHostHalf: boolean
    hasClientHalf: boolean
  }>
  activeRun?: {
    pluginRunId: CordisDynamicPluginRunId
    packageId: CordisDynamicPackageId
    fiber?: Fiber
    handlers: string[]
    renderFailure?: DynamicCordisRenderFailure
  }
  latestRun?: DynamicCordisRunAttempt
}

export { DynamicCordisRunnerService } from './runner.ts'
export { default } from './runner.ts'
