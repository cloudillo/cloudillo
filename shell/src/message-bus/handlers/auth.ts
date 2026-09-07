// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Auth Message Handlers for Shell
 *
 * Handles auth-related messages from apps:
 * - auth:init.req - App requests initialization
 * - auth:token.refresh.req - App requests token refresh
 */

import type { AuthInitReq, AuthTokenRefreshReq } from '@cloudillo/core'
import { jwtRemainingSeconds } from '@cloudillo/core/jwt'

import type { ShellMessageBus } from '../shell-bus.js'

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
		let navState: string | undefined
		let ancestors: string[] | undefined

		// Relayed embed init: the parent app is already initialized and the
		// child's resId starts with "_embed:". Consume the pending registration
		// and respond with the embed token directly.
		const isRelayedEmbed = connection?.initialized && msg.payload.resId?.startsWith('_embed:')

		if (isRelayedEmbed) {
			const pending = bus.getAppTracker().consumePendingRegistration(msg.payload.resId!)
			if (!pending) {
				bus.sendResponse(
					appWindow,
					'auth:init.res',
					msg.id,
					false,
					undefined,
					'No pending registration for embed'
				)
				return
			}

			const authState = bus.getAuthState()
			const themeState = bus.getThemeState()

			const tokenLifetime = pending.token ? jwtRemainingSeconds(pending.token) : undefined

			bus.sendResponse(appWindow, 'auth:init.res', msg.id, true, {
				// The signed-in user first: `pending.idTag` for an embed is the
				// embed CONTEXT (the community/owner node, see handlers/embed.ts),
				// never an identity, so it may only be worn unflagged.
				idTag: authState?.idTag || pending.idTag,
				// Same flag, same reason as the non-embed branch below. Embeds are
				// initialised ONLY here — no `auth:init.push` ever follows to
				// correct an omitted flag — so without it an embedded document
				// de-identifies even its owner.
				authenticated: !!authState?.idTag,
				tnId: authState?.tnId,
				roles: authState?.roles,
				theme: 'glass',
				darkMode: themeState.darkMode,
				language: bus.getLanguage(),
				token: pending.token,
				access: pending.access || 'read',
				tokenLifetime,
				displayName: pending.displayName,
				navState: pending.navState,
				ancestors: pending.ancestors,
				params: pending.params
			})

			console.log('[Auth] Relayed embed initialized:', msg.payload.appName, msg.payload.resId)
			return
		}

		// If app isn't registered but sent resId, register it now
		// This handles the race condition where app sends init.req before load event
		if (!connection && msg.payload.resId) {
			// Check for pending registration (set before iframe loaded)
			const pending = bus.getAppTracker().consumePendingRegistration(msg.payload.resId)
			if (!pending) {
				// `auth:init.req` is exempt from `validateSource`, so `resId` here is
				// whatever the app claimed. The container sets a pending registration
				// before the iframe loads (shell/src/apps/index.tsx) and the embed
				// path does the same, so a legitimate first init.req always finds one
				// — a later one finds the connection by window instead. Registering
				// without a match would take that self-supplied resId on trust and
				// mint a write-scoped token for a resource this iframe was never
				// opened on.
				console.warn(
					'[Auth] Init request for an unregistered resId — rejecting:',
					msg.payload.resId
				)
				bus.sendResponse(
					appWindow,
					'auth:init.res',
					msg.id,
					false,
					undefined,
					'App not registered'
				)
				return
			}
			displayName = pending.displayName
			navState = pending.navState
			ancestors = pending.ancestors

			console.log(
				'[Auth] Registering app from init.req:',
				msg.payload.appName,
				msg.payload.resId
			)

			connection = bus.getAppTracker().registerApp({
				window: appWindow,
				// The launcher's app name, never `msg.payload.appName`: the iframe picks
				// that string itself, while handlers reading `connection.appName` treat
				// the recorded name as attested.
				appName: pending.appName,
				// The pending entry is shell-created, so its resId is attested;
				// `msg.payload.resId` is the app's own claim and, for an embed, the
				// `_embed:<nonce>` handshake key rather than a document.
				resId: pending.resId ?? msg.payload.resId,
				// Set by whoever created the pending entry — never inferred from another
				// field, or a future registration path silently flips an editor into an
				// embed (losing its DocBar, share button and queued import) or back.
				embed: !!pending.embed,
				access: pending.access || 'write',
				idTag: pending.idTag,
				token: pending.token,
				refId: pending.refId,
				params: pending.params
			})
		} else if (!connection) {
			console.warn('[Auth] Init request from unregistered app without resId — rejecting')
			bus.sendResponse(
				appWindow,
				'auth:init.res',
				msg.id,
				false,
				undefined,
				'App not registered'
			)
			return
		}

		// Read displayName from connection if not already set from pending registration
		if (!displayName && connection) {
			displayName = connection.displayName
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
				tokenLifetime = jwtRemainingSeconds(token)
			} else if (resId) {
				// Fast-fail when offline to avoid network timeout delays
				if (!navigator.onLine) {
					console.log('[Auth] Offline — skipping token fetch for:', resId)
					// token remains undefined — app will use cached CRDT data
				} else
					try {
						const tokenResult = await bus.getAccessToken(
							resId,
							connection?.access || 'write'
						)
						token = tokenResult?.token
						tokenLifetime = tokenResult?.tokenLifetime
					} catch (err) {
						console.warn('[Auth] Token fetch failed (possibly offline):', err)
						// Continue with undefined token — app will use cached CRDT data
					}
			}

			// Store scoped token and mark app as initialized
			if (connection) {
				if (token) connection.token = token
				bus.getAppTracker().markInitialized(appWindow)
			}

			// Send init response
			bus.sendResponse(appWindow, 'auth:init.res', msg.id, true, {
				// The signed-in user first, as in the relayed-embed branch above.
				// `connection.idTag` is recorded by the container while auth is
				// still resolving, from `currentAuth?.idTag || currentContextIdTag`,
				// so it can be the OWNER's tag: an init.req landing after auth
				// resolves but before `initApp` corrects the connection would
				// otherwise hand the app that tag flagged `authenticated: true`.
				idTag: authState?.idTag || connection?.idTag || resId?.split(':')[0],
				// The idTag above falls back to the context/owner tag, so it is set
				// for a share-link guest too. Presence gates on this flag instead,
				// or a guest ends up wearing the owner's name and face.
				authenticated: !!authState?.idTag,
				tnId: authState?.tnId,
				roles: authState?.roles,
				theme: 'glass',
				darkMode: themeState.darkMode,
				language: bus.getLanguage(),
				token,
				access: connection?.access || 'write',
				tokenLifetime,
				displayName,
				navState,
				ancestors,
				params: connection?.params
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

			// Update the stored token
			connection.token = tokenResult.token

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
