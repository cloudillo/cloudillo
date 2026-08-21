// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Utility functions for the Calcillo spreadsheet application.
 */

declare const process: { env: { NODE_ENV?: string } }

/**
 * Guard for dev-only diagnostics: `if (DEV) console.warn(...)`.
 *
 * esbuild substitutes `process.env.NODE_ENV` at build time (`createConfig` in
 * `scripts/esbuild-common.js` defines it) and inlines this const, so a guarded
 * call — arguments included — is dead-code-eliminated from production bundles.
 * A `devWarn(...)` helper would not be: esbuild empties the function body but
 * still builds the arguments at every call site, and several of these sit on
 * the FortuneSheet op hot path.
 */
export const DEV = process.env.NODE_ENV !== 'production'

/**
 * Creates a ref-based flag manager for preventing feedback loops.
 * Usage:
 *   const localEcho = createLocalEchoGuard()
 *
 *   // In observer:
 *   localEcho.withGuard(() => {
 *     workbook.applyChange(...)
 *   })
 *
 *   // In onOp:
 *   if (localEcho.isGuarded()) return
 */
export function createLocalEchoGuard() {
	let isApplyingRemote = false

	return {
		/**
		 * Execute a function while the guard is active.
		 * Prevents feedback loops when applying remote changes.
		 */
		withGuard<T>(fn: () => T): T {
			isApplyingRemote = true
			try {
				return fn()
			} finally {
				isApplyingRemote = false
			}
		},

		/**
		 * Check if we're currently applying remote changes.
		 */
		isGuarded(): boolean {
			return isApplyingRemote
		}
	}
}

/**
 * Validates a sheet ID.
 * Returns true if valid, false otherwise.
 */
export function isValidSheetIdValue(id: unknown): id is string {
	return typeof id === 'string' && id.length > 0 && id !== 'undefined'
}

/**
 * Creates a debounced + throttled function.
 * Debounces calls but ensures execution happens within maxDelay.
 */
export function createDebouncedThrottle(
	fn: () => void,
	debounceMs: number,
	maxDelayMs: number
): { trigger: () => void; cancel: () => void } {
	let timeoutId: number | null = null
	let lastExecutionTime = 0
	let _pending = false

	const execute = () => {
		fn()
		lastExecutionTime = Date.now()
		_pending = false
		timeoutId = null
	}

	const trigger = () => {
		_pending = true
		const now = Date.now()
		const timeSinceLastExecution = now - lastExecutionTime

		// Clear existing timeout
		if (timeoutId !== null) {
			clearTimeout(timeoutId)
			timeoutId = null
		}

		// Force immediate execution if we've waited too long
		if (timeSinceLastExecution >= maxDelayMs) {
			execute()
			return
		}

		// Otherwise debounce
		timeoutId = window.setTimeout(execute, debounceMs)
	}

	const cancel = () => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId)
			timeoutId = null
		}
		_pending = false
	}

	return { trigger, cancel }
}

/**
 * Show an error notification to the user.
 * Currently logs to console, can be extended with toast UI.
 */
export function showUserError(message: string, context?: unknown): void {
	console.error(`[Calcillo Error] ${message}`, context)
	// TODO: Add toast notification UI
	// For now, we at least ensure errors are visible
}

// vim: ts=4
