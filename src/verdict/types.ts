export type Layer = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7'
export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip'
export type Verdict = 'VERIFIED' | 'FAKE' | 'UNVERIFIED' | 'NOT RECEIVED'

export interface Check {
  id: string
  layer: Layer
  status: CheckStatus
  reason: string
  /** A required check that is skipped makes the verdict UNVERIFIED. */
  required: boolean
  /** A fail with this flag means NOT RECEIVED instead of FAKE. */
  notReceived?: boolean
  /** Phase 1 vector IDs this check covers. */
  vectors?: string[]
}

export const LAYER_NAMES: Record<Layer, string> = {
  L0: 'Input',
  L1: 'Chain truth',
  L2: 'Token identity',
  L3: 'Transfer semantics',
  L4: 'Context binding',
  L5: 'Counterparty risk',
  L6: 'Unknown-token risk',
  L7: 'Account state',
}

/**
 * Combines checks into one verdict.
 * - any NOT-RECEIVED fail -> NOT RECEIVED
 * - providers disagree (L1.consensus not pass) -> UNVERIFIED, never FAKE or VERIFIED
 * - any other fail -> FAKE
 * - any warn, or a required check skipped -> UNVERIFIED
 * - otherwise VERIFIED
 */
export function combine(checks: Check[]): Verdict {
  if (checks.some((c) => c.status === 'fail' && c.notReceived)) return 'NOT RECEIVED'
  const consensus = checks.find((c) => c.id === 'L1.consensus')
  if (consensus && consensus.status !== 'pass') return 'UNVERIFIED'
  if (checks.some((c) => c.status === 'fail')) return 'FAKE'
  if (checks.some((c) => c.status === 'warn' || (c.status === 'skip' && c.required))) return 'UNVERIFIED'
  return 'VERIFIED'
}
