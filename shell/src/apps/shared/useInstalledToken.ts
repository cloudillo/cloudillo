// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useAuth } from '@cloudillo/react'
import * as React from 'react'

import { installToken, releaseInstalledToken } from '../../pwa.js'

// Module-level refcount for the token currently installed in the SW.
//
// The install is process-wide but the cleanup is per-mount, and one token
// legitimately has several consumers at once: `SharedFolderView` installs it and
// the `BlobViewer` it renders asks for the same one. Refcounted rather than a
// "last installed" memo, which lets the child's unmount release a token the
// still-mounted parent depends on — every folder thumbnail then 401s.
//
// `promise` is the in-flight (or settled) install, so a consumer joining midway
// awaits the same one instead of issuing a second postMessage.
//
// `failed` marks an install that rejected. The entry must survive that: the
// cleanup identifies its entry by token, and dropping it would make every mounted
// consumer's cleanup a no-op, leaving the worker holding the scoped token for the
// rest of the page's life. The flag is what still lets a later mount retry.
let installed:
	| { token: string; count: number; promise: Promise<void>; failed?: boolean }
	| undefined

/**
 * Install a scoped guest token into the ServiceWorker (so it attaches it as an
 * Authorization header on header-less media GETs) and report when it is ready.
 * Skipped entirely on a signed-in page, whose worker is holding the session
 * token for the whole shell.
 *
 * Returns `{ ready, useUrlToken }`:
 * - `ready` is false until the install for a *new* token resolves; true
 *   immediately when there is no token, when the install is skipped, or when
 *   the token is already installed, and true again once a fresh install
 *   settles — even on failure, so the UI is never trapped behind a spinner.
 *   Callers gate token-less media rendering on this flag to avoid the
 *   first-paint race where the browser fetches media before the SW has the
 *   token.
 * - `useUrlToken` is true when a token exists *and* the SW is not carrying it:
 *   either the install rejected, or the page is signed in and the install was
 *   skipped outright. In both cases the SW can't inject the Authorization
 *   header for this token, so callers must fall back to embedding it in the
 *   media URL (`?token=`) instead of silently 401-ing.
 */
export function useInstalledToken(token?: string): { ready: boolean; useUrlToken: boolean } {
	const [auth] = useAuth()
	// A signed-in page must never hand its worker a file-scoped token — see the
	// effect's leading guard.
	const skipInstall = !!auth?.token
	const [ready, setReady] = React.useState(
		() => !token || skipInstall || token === installed?.token
	)
	const [useUrlToken, setUseUrlToken] = React.useState(false)

	React.useEffect(() => {
		// A signed-in page already has a session token in the worker, and the
		// worker holds exactly one. Installing a file-scoped share token over it
		// would make every SW-injected media request in the shell (avatars,
		// thumbnails, MediaViewer) authorize with a token scoped to one file. Hand
		// the token to the media URLs instead — the fallback the install-failure
		// path already uses.
		if (!token || skipInstall) {
			setReady(true)
			setUseUrlToken(skipInstall && !!token)
			return
		}

		let cancelled = false
		const attach = (promise: Promise<void>) => {
			promise.then(
				() => {
					if (!cancelled) setReady(true)
				},
				(err: unknown) => {
					console.error('[useInstalledToken] SW token install failed:', err)
					// Mark rather than drop — see the `failed` note on `installed`.
					if (installed?.promise === promise) installed.failed = true
					// Don't trap the UI behind a spinner: fall back to embedding
					// the token in media URLs so guest media still loads even
					// though the SW can't inject the Authorization header.
					if (!cancelled) {
						setReady(true)
						setUseUrlToken(true)
					}
				}
			)
		}

		if (installed?.token === token && !installed.failed) {
			// Join the existing install. Awaiting its promise matters for a
			// consumer mounting mid-install: it must not report `ready` before
			// the worker actually has the token.
			installed.count++
			attach(installed.promise)
		} else {
			setReady(false)
			setUseUrlToken(false)
			// `installToken` only hands the token to the SW; it deliberately does
			// not touch the page's session token, which this scoped one must not
			// overwrite.
			const promise = installToken(token)
			// Retrying a failed install inherits its consumers: their cleanups
			// are still pending and will each decrement this entry, so starting
			// the count over at 1 would release the token while they are mounted.
			const inherited = installed?.token === token ? installed.count : 0
			installed = { token, count: inherited + 1, promise }
			attach(promise)
		}

		return () => {
			cancelled = true
			// Hand the worker back its session token, but only once the last
			// consumer of this token is gone: a latched scoped token would outrank
			// the session one for the rest of the page's life, while releasing it
			// early breaks every media fetch a still-mounted sibling makes.
			if (installed?.token !== token) return
			installed.count--
			if (installed.count > 0) return
			installed = undefined
			void releaseInstalledToken()
		}
	}, [token, skipInstall])

	return { ready, useUrlToken }
}

// vim: ts=4
