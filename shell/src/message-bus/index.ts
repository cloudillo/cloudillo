// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
 *     return api.auth.getAccessToken({ scope: `${resId}:${access === 'read' ? 'R' : 'W'}` })
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
export { type AppReadyCallback, onAppReady, offAppReady } from './handlers/lifecycle.js'

// vim: ts=4
