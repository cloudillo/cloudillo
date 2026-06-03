// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { installToken, setCurrentAuthToken } from '../../pwa.js'

// Module-level memo of the token most recently installed into the SW, so opening a
// child BLOB inside an already-authorized folder share doesn't reinstall it.
let lastInstalledToken: string | undefined

/**
 * Install a scoped guest token into the ServiceWorker (so it attaches it as an
 * Authorization header on header-less media GETs) and report when it is ready.
 *
 * Returns `{ ready, useUrlToken }`:
 * - `ready` is false until the install for a *new* token resolves; true
 *   immediately when there is no token (logged-in cookie auth) or the token is
 *   already installed, and true again once a fresh install settles — even on
 *   failure, so the UI is never trapped behind a spinner. Callers gate
 *   token-less media rendering on this flag to avoid the first-paint race where
 *   the browser fetches media before the SW has the token.
 * - `useUrlToken` is true only when a token exists *and* the SW install
 *   rejected. In that case the SW can't inject the Authorization header, so
 *   callers must fall back to embedding the token in the media URL (`?token=`)
 *   instead of silently 401-ing.
 */
export function useInstalledToken(token?: string): { ready: boolean; useUrlToken: boolean } {
	const [ready, setReady] = React.useState(() => !token || token === lastInstalledToken)
	const [useUrlToken, setUseUrlToken] = React.useState(false)

	React.useEffect(() => {
		if (!token || token === lastInstalledToken) {
			setReady(true)
			return
		}
		let cancelled = false
		setReady(false)
		setUseUrlToken(false)
		setCurrentAuthToken(token)
		installToken(token)
			.then(() => {
				lastInstalledToken = token
				if (!cancelled) setReady(true)
			})
			.catch((err) => {
				console.error('[useInstalledToken] SW token install failed:', err)
				// Don't trap the UI behind a spinner on failure — fall back to
				// embedding the token in media URLs so guest media still loads
				// even though the SW can't inject the Authorization header.
				if (!cancelled) {
					setReady(true)
					setUseUrlToken(true)
				}
			})
		return () => {
			cancelled = true
		}
	}, [token])

	return { ready, useUrlToken }
}

// vim: ts=4
