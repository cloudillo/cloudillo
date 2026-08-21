// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Re-send an app's identity when auth resolves after the app was initialised.
 *
 * `MicrofrontendContainer`'s init effect runs as soon as `isReady` flips, which
 * a share-link mount reaches on `providedToken` alone — `authAtom` starts
 * `undefined` and may still be resolving. The app is then initialised with
 * `authenticated: false` and the context/owner tag, and nothing ever corrects it:
 * the init effect deliberately does not depend on auth (re-running it recreates
 * the iframe and re-mints tokens), so the app publishes a guest identity onto
 * awareness for the rest of its life.
 *
 * The deliberate exception to `useAppToken.ts`'s "NOTHING here may become
 * reactive" rule: reactive on purpose, but it never re-runs the init effect — it
 * sends one targeted `auth:init.push` instead.
 *
 * That push REPLACES the app's state wholesale (see the `auth:init.push` handler
 * in `libs/core/src/message-bus/app-bus.ts`), carrying over only `resId`, so the
 * corrective payload must be the recorded one with the identity swapped and the
 * volatile fields re-read. A partial payload would silently wipe the app's token,
 * access level and params; replaying a recorded token or theme would roll back a
 * renewal or a theme switch since the app was initialised.
 */

import { jwtRemainingSeconds } from '@cloudillo/core/jwt'
import type { AuthState } from '@cloudillo/react'
import * as React from 'react'

import { getShellBus, type InitAppData } from '../message-bus/shell-bus.js'

interface RecordedInit {
	window: Window
	/** Fallback identity for a visitor with no session — the owner/community tag. */
	contextIdTag?: string
	data: InitAppData
}

export interface UseIdentityPush {
	/** Remember the payload an app was initialised with. */
	record: (appWindow: Window, contextIdTag: string | undefined, data: InitAppData) => void
	/** Forget it — the app window is gone (unmount, retry, re-init). */
	reset: () => void
}

export function useIdentityPush(auth: AuthState | null | undefined): UseIdentityPush {
	const lastRef = React.useRef<RecordedInit | undefined>(undefined)

	const record = React.useCallback(
		(appWindow: Window, contextIdTag: string | undefined, data: InitAppData) => {
			lastRef.current = { window: appWindow, contextIdTag, data }
		},
		[]
	)

	const reset = React.useCallback(() => {
		lastRef.current = undefined
	}, [])

	React.useEffect(() => {
		const last = lastRef.current
		// Nothing initialised yet: the init effect will read the resolved `auth`
		// itself, so there is nothing to correct.
		if (!last) return

		const idTag = auth?.idTag || last.contextIdTag
		const authenticated = !!auth?.idTag
		// `app-bus.ts` already no-ops an identity change that changes nothing, but
		// a push it ignores is still a wasted state rebuild on the app side.
		if (idTag === last.data.idTag && authenticated === last.data.authenticated) return

		const shellBus = getShellBus()
		if (!shellBus) return

		// Volatile since `record()`: a `sendTokenUpdate` may have renewed the token
		// and the user may have flipped the theme. The push rebuilds the app's whole
		// state, so replaying the recorded values would revert both.
		const token = shellBus.getAppTracker().getApp(last.window)?.token ?? last.data.token
		const data: InitAppData = {
			...last.data,
			idTag,
			authenticated,
			tnId: auth?.tnId,
			roles: auth?.roles,
			token,
			// Recomputed from the token itself; the recorded number is a fallback
			// for a token `jwtRemainingSeconds` cannot read (an opaque share token),
			// and only while it is still the same token.
			tokenLifetime:
				(token ? jwtRemainingSeconds(token) : undefined) ??
				(token === last.data.token ? last.data.tokenLifetime : undefined),
			darkMode: document.body.classList.contains('dark'),
			// A signed-in user's name arrives with `auth`; the recorded payload
			// carried the share link's guest name, if any.
			displayName: auth?.name || last.data.displayName
		}
		// Record what we just sent, so a later change is diffed against it and the
		// same push cannot go out twice.
		lastRef.current = { ...last, data }
		shellBus.initApp(last.window, data)
	}, [auth])

	return { record, reset }
}

// vim: ts=4
