// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/** The second login step: `{mfaRequired}` (code only) or `{mfaEnroll}` (forced enrollment).
 *  The backend answers 410 once it has dropped `mfaToken`. */
export interface MfaStep {
	mfaToken: string
	secret?: string
	otpauthUri?: string
}

// welcome.tsx hands an open MFA step to the login form in memory, not in the router
// state, so the TOTP secret never lands in history.state (a reload drops it)
let pending: MfaStep | undefined

export function handOffMfa(step: MfaStep) {
	pending = step
}

/** Peek and clear are separate: StrictMode may run a `useState` initializer twice */
export function peekMfaHandoff(): MfaStep | undefined {
	return pending
}

export function clearMfaHandoff() {
	pending = undefined
}

// vim: ts=4
