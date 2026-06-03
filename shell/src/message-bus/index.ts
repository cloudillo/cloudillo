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
	AppTracker,
	getAccessSuffix,
	getAppTracker,
	type RegisterAppOptions,
	resetAppTracker
} from './app-tracker.js'
// Lifecycle handlers
export {
	type AppErrorCallback,
	type AppReadyCallback,
	type AppTitleCallback,
	offAppError,
	offAppReady,
	offAppTitle,
	onAppError,
	onAppReady,
	onAppTitle
} from './handlers/lifecycle.js'
// Shell bus
export {
	type AuthState,
	getShellBus,
	initShellBus,
	resetShellBus,
	ShellMessageBus,
	type ShellMessageBusConfig,
	type ThemeState,
	type TokenResult
} from './shell-bus.js'

// vim: ts=4
