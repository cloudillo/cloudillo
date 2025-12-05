/**
 * Utility functions for the Calcillo spreadsheet application.
 */

import { debug } from './debug'

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
	let pending = false

	const execute = () => {
		fn()
		lastExecutionTime = Date.now()
		pending = false
		timeoutId = null
	}

	const trigger = () => {
		pending = true
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
		pending = false
	}

	return { trigger, cancel }
}

/**
 * Show an error notification to the user.
 * Currently logs to console, can be extended with toast UI.
 */
export function showUserError(message: string, context?: unknown): void {
	debug.error(`[Calcillo Error] ${message}`, context)
	// TODO: Add toast notification UI
	// For now, we at least ensure errors are visible
}

// vim: ts=4
