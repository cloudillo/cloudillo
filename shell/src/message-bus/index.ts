// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Shell Message Bus Module
 *
 * Provides the shell-side message bus for handling app communications.
 *
 * @example Usage in shell
 * ```typescript
 * import { initShellBus, getShellBus } from './message-bus'
 *
 * // Initialize in shell entry point
 * initShellBus({
 *   getAccessToken: async (resId, access) => {
 *     const fileId = resId.split(':').pop()
 *     return api.auth.getAccessToken({ scope: `file:${fileId}:${access === 'read' ? 'R' : 'W'}` })
 *   },
 *   getAuthState: () => authState,
 *   getThemeState: () => ({ darkMode: document.body.classList.contains('dark') })
 * })
 *
 * // In MicrofrontendContainer
 * const bus = getShellBus()
 * if (bus) {
 *   bus.registerApp({ window: iframe.contentWindow, resId, idTag, access })
 *   bus.sendTokenUpdate(iframe.contentWindow, newToken)
 *   bus.unregisterApp(iframe.contentWindow) // on unmount
 * }
 * ```
 */

// App tracker
export {
	type AppConnection,
	type RegisterAppOptions,
	AppTracker,
	getAppTracker,
	getAccessSuffix,
	resetAppTracker
} from './app-tracker.js'

// Shell bus
export {
	type AuthState,
	type ThemeState,
	type TokenResult,
	type ShellMessageBusConfig,
	ShellMessageBus,
	initShellBus,
	getShellBus,
	resetShellBus
} from './shell-bus.js'

// Lifecycle handlers
export {
	type AppReadyCallback,
	type AppErrorCallback,
	onAppReady,
	offAppReady,
	onAppError,
	offAppError
} from './handlers/lifecycle.js'

// vim: ts=4
