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
 * Auth Message Handlers for Shell
 *
 * Handles auth-related messages from apps:
 * - auth:init.req - App requests initialization
 * - auth:token.refresh.req - App requests token refresh
 */

import type { ShellMessageBus } from '../shell-bus.js'
import type { AuthInitReq, AuthTokenRefreshReq } from '@cloudillo/core'

/**
 * Initialize auth message handlers on the shell bus
 */
export function initAuthHandlers(bus: ShellMessageBus): void {
	// Handle init request from apps
	bus.on('auth:init.req', async (msg: AuthInitReq, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[Auth] Init request with no source window')
			return
		}

		let connection = bus.getAppTracker().getApp(appWindow)
		let displayName: string | undefined

		// If app isn't registered but sent resId, register it now
		// This handles the race condition where app sends init.req before load event
		if (!connection && msg.payload.resId) {
			// Check for pending registration (set before iframe loaded)
			const pending = bus.getAppTracker().consumePendingRegistration(msg.payload.resId)
			displayName = pending?.displayName

			console.log(
				'[Auth] Registering app from init.req:',
				msg.payload.appName,
				msg.payload.resId,
				pending ? '(with pending token/refId)' : '(no pending registration)'
			)

			connection = bus.getAppTracker().registerApp({
				window: appWindow,
				appName: msg.payload.appName,
				resId: msg.payload.resId,
				access: pending?.access || 'write',
				idTag: pending?.idTag,
				token: pending?.token,
				refId: pending?.refId
			})
		} else if (!connection) {
			console.warn('[Auth] Init request from unregistered app without resId')
		}

		try {
			// Get auth state from shell context
			const authState = bus.getAuthState()
			const themeState = bus.getThemeState()

			// Get token for this app
			let token: string | undefined
			let tokenLifetime: number | undefined
			const resId = connection?.resId || msg.payload.resId

			// Check if connection has pre-provided token (guest access via share link)
			if (connection?.token) {
				token = connection.token
				// Calculate remaining lifetime from token expiry
				try {
					const [, payload] = token.split('.')
					if (payload) {
						const decoded = JSON.parse(atob(payload))
						if (decoded.exp) {
							const remaining = decoded.exp * 1000 - Date.now()
							tokenLifetime = Math.max(0, Math.floor(remaining / 1000))
						}
					}
				} catch {
					// Ignore token parsing errors
				}
			} else if (resId) {
				// Fetch token via API for authenticated users
				const tokenResult = await bus.getAccessToken(resId, connection?.access || 'write')
				token = tokenResult?.token
				tokenLifetime = tokenResult?.tokenLifetime
			}

			// Mark app as initialized
			if (connection) {
				bus.getAppTracker().markInitialized(appWindow)
			}

			// Send init response
			bus.sendResponse(appWindow, 'auth:init.res', msg.id, true, {
				idTag: connection?.idTag || authState?.idTag,
				tnId: authState?.tnId,
				roles: authState?.roles,
				theme: 'glass',
				darkMode: themeState.darkMode,
				token,
				access: connection?.access || 'write',
				tokenLifetime,
				displayName
			})

			console.log('[Auth] App initialized:', msg.payload.appName)
		} catch (err) {
			console.error('[Auth] Failed to initialize app:', err)
			bus.sendResponse(
				appWindow,
				'auth:init.res',
				msg.id,
				false,
				undefined,
				(err as Error).message || 'Failed to initialize'
			)
		}
	})

	// Handle token refresh request from apps
	bus.on('auth:token.refresh.req', async (msg: AuthTokenRefreshReq, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[Auth] Token refresh request with no source window')
			return
		}

		const connection = bus.getAppTracker().validateSource(source, true)
		if (!connection) {
			console.warn('[Auth] Token refresh from uninitialized/unknown app')
			bus.sendResponse(
				appWindow,
				'auth:token.refresh.res',
				msg.id,
				false,
				undefined,
				'App not initialized'
			)
			return
		}

		try {
			// Get fresh token - use refId for guest access, resId for authenticated
			let tokenResult: { token: string; tokenLifetime?: number } | undefined

			if (connection.refId) {
				// Guest access via share link - refresh using refId
				tokenResult = await bus.refreshTokenByRef(connection.refId)
			} else if (connection.resId) {
				// Authenticated access - refresh using resId
				tokenResult = await bus.getAccessToken(connection.resId, connection.access)
			}

			if (!tokenResult?.token) {
				bus.sendResponse(
					appWindow,
					'auth:token.refresh.res',
					msg.id,
					false,
					undefined,
					'Failed to get token'
				)
				return
			}

			// Update the stored token for future init requests
			if (connection.refId) {
				connection.token = tokenResult.token
			}

			bus.sendResponse(appWindow, 'auth:token.refresh.res', msg.id, true, {
				token: tokenResult.token,
				tokenLifetime: tokenResult.tokenLifetime
			})

			console.log('[Auth] Token refreshed for:', connection.appName)
		} catch (err) {
			console.error('[Auth] Failed to refresh token:', err)
			bus.sendResponse(
				appWindow,
				'auth:token.refresh.res',
				msg.id,
				false,
				undefined,
				(err as Error).message || 'Failed to refresh token'
			)
		}
	})
}

// vim: ts=4
