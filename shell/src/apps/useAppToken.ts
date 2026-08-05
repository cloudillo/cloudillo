// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The app-iframe token lifecycle: minting, renewal scheduling, delivery over the
 * message bus, and access-conflict reconciliation.
 *
 * A hook rather than a module because the callbacks chain into each other
 * (`requestToken` → `mint`, `requestToken` → `triggerAccessRefresh`) and all read
 * live api/auth state.
 *
 * NOTHING here may become reactive. Every input is read through a ref that a
 * per-render effect updates, so `MicrofrontendContainer`'s init effect can keep
 * its `[app, appUrl, resId, retryCount, isReady]` dep array — adding api/auth as
 * a dependency anywhere in this chain remounts every app iframe on every token
 * renewal. The refs are returned so that init effect can read the same live
 * values without re-subscribing either.
 */

import { type ApiClient, FetchError } from '@cloudillo/core'
import { jwtRemainingSeconds } from '@cloudillo/core/jwt'
import type { AuthState } from '@cloudillo/react'
import * as React from 'react'

import { createRenewer, type Renewer } from '../auth/renewal-timer.js'
import { awaitTokenRenewal } from '../auth/token-session.js'
import { getAccessSuffix } from '../message-bus/index.js'
import { getShellBus } from '../message-bus/shell-bus.js'
import { mintAppToken } from '../message-bus/shell-bus-config.js'
import { type AccessConflict, classifyOutcome, refreshFileDeduped } from './access-conflict.js'

export interface UseAppTokenOpts {
	iframeRef: React.RefObject<HTMLIFrameElement | null>
	resId?: string
	fileId?: string
	access?: 'read' | 'comment' | 'write'
	api: ApiClient | null
	auth: AuthState | null | undefined
	refId?: string
	onAccessConflict?: (outcome: AccessConflict) => void | Promise<void>
}

export function useAppToken({
	iframeRef: ref,
	resId,
	fileId,
	access,
	api,
	auth,
	refId,
	onAccessConflict
}: UseAppTokenOpts) {
	// Refs for values that change but shouldn't trigger effect re-runs.
	const authRef = React.useRef(auth)
	const apiRef = React.useRef(api)
	const accessRef = React.useRef(access)
	const refIdRef = React.useRef(refId)
	const onAccessConflictRef = React.useRef(onAccessConflict)
	// One access-conflict dispatch per mount, so a slow refresh and a fast
	// app:error don't both fire dialogs/navigations.
	const conflictDispatchedRef = React.useRef(false)

	// Reached from two paths: the token-fetch retry (access-token 401/403) and the
	// app:error one (the app reports 4401/4403 — the token mints fine, but the
	// backend WebSocket/handler enforces the actual access level).
	const triggerAccessRefresh = React.useCallback(async () => {
		if (conflictDispatchedRef.current) return
		const currentApi = apiRef.current
		if (!currentApi || !fileId) return
		conflictDispatchedRef.current = true
		const accessSuffix = getAccessSuffix(accessRef.current)
		try {
			const updated = await refreshFileDeduped(currentApi, fileId)
			const outcome = classifyOutcome(updated, accessSuffix)
			if (onAccessConflictRef.current) {
				await onAccessConflictRef.current(outcome)
			}
			// `unchanged`: the refresh succeeded but access did not move, so
			// this is a transient auth failure that may resolve. Let the next
			// blip retry.
			if (outcome.kind === 'unchanged') {
				conflictDispatchedRef.current = false
			}
		} catch (refreshErr) {
			const status = (refreshErr as { httpStatus?: number })?.httpStatus
			if (status === 400) {
				onAccessConflictRef.current?.({ kind: 'unsupported' })
			} else {
				onAccessConflictRef.current?.({ kind: 'error', err: refreshErr })
				// Refresh itself failed — allow the next blip to retry.
				conflictDispatchedRef.current = false
			}
		}
	}, [fileId])

	const requestToken = React.useCallback(async () => {
		// Refs, so a renewal that already landed is picked up.
		const currentApi = apiRef.current
		const currentAuth = authRef.current
		if (!currentApi) return undefined

		// Guest: refresh through the share ref instead.
		if (!currentAuth) {
			const currentRefId = refIdRef.current
			if (!currentRefId) return undefined
			try {
				const res = await currentApi.auth.getAccessTokenByRef(currentRefId, {
					refresh: true
				})
				return res.token
			} catch (err) {
				console.error('[Shell] Guest token refresh failed:', err)
				return undefined
			}
		}

		// Same mint the bus's `getAccessToken` performs, so this path and
		// `auth:init.res` produce identically-scoped tokens — but called directly,
		// because the bus adapter swallows the error and a 503 must not be mistaken
		// for a 403 below. The `?? 'write'` mirrors `getAccessSuffix`, which maps an
		// absent access level to 'W'. `accessRef`, not the closure: `scheduleRenewal`
		// recurses into the binding of the render that created the running timer, so
		// a closed-over `access` would keep minting at the old scope after
		// ?access=write → ?access=read (the container does not remount for that).
		const mint = () =>
			resId && currentAuth.idTag
				? mintAppToken(currentApi, currentAuth.idTag, resId, accessRef.current ?? 'write')
				: undefined

		// The last mint failure seen, and the only thing the classification below
		// is allowed to act on.
		let mintErr: unknown
		try {
			const res = await mint()
			if (res?.token) return res.token
		} catch (err) {
			mintErr = err
		}

		// The usual cause is an expired home token with a renewal already under way.
		// Join it rather than guessing a delay, and retry only if it produced a
		// token — nothing else here could have changed the outcome. A 401 on the
		// mint request itself is recovered inside `ApiClient.handleAuthError` before
		// the error ever reaches this far.
		const renewed = await awaitTokenRenewal(5000)
		if (renewed) {
			try {
				const res = await mint()
				if (res?.token) return res.token
			} catch (retryErr) {
				mintErr = retryErr
				console.error('[Shell] Retry failed:', retryErr)
			}
		}

		// Offline is not an access conflict: files.refresh would fail on the same
		// dead network and surface "Unable to verify file access" for a plain outage.
		if (!navigator.onLine) return undefined

		// Only a 401/403 says anything about the user's access. A 500, a DNS blip or
		// a failed proxy-token hop means "try again later" — reconciling those spends
		// a federated round-trip and pops "Access denied." for a backend hiccup that
		// never touched a permission.
		const isAccessDenied =
			mintErr instanceof FetchError &&
			(mintErr.httpStatus === 401 || mintErr.httpStatus === 403)
		if (isAccessDenied && fileId) await triggerAccessRefresh()
		if (mintErr && !isAccessDenied) {
			console.error('[Shell] Failed to get access token:', mintErr)
		}
		return undefined
	}, [resId, triggerAccessRefresh, fileId]) // api/auth/access read via refs, not deps

	const sendTokenToApp = React.useCallback((token: string) => {
		const appWindow = ref.current?.contentWindow
		if (!appWindow) return
		const shellBus = getShellBus()
		// The lifetime argument is load-bearing: without it the app's
		// `state.tokenLifetime` keeps reflecting the *initial* token forever
		// (libs/core/src/message-bus/app-bus.ts).
		shellBus?.sendTokenUpdate(appWindow, token, jwtRemainingSeconds(token))
	}, [])

	// One renewer per mount, so `scheduleRenewal` keeps a stable identity for the
	// container's init effect. `requestToken` goes through a ref like everything
	// else here: it re-binds on resId/fileId, and a renewer holding the first
	// binding would keep minting for the previous resource.
	const requestTokenRef = React.useRef(requestToken)
	requestTokenRef.current = requestToken
	const renewerRef = React.useRef<Renewer | undefined>(undefined)
	renewerRef.current ??= createRenewer(() => requestTokenRef.current(), {
		onToken: sendTokenToApp
	})
	const scheduleRenewal = renewerRef.current.schedule

	// Runs on every render so the refs above always hold current values.
	React.useEffect(() => {
		authRef.current = auth
		apiRef.current = api
		accessRef.current = access
		refIdRef.current = refId
		onAccessConflictRef.current = onAccessConflict
	})

	React.useEffect(() => {
		const renewer = renewerRef.current
		return () => renewer?.cancel()
	}, [])

	return {
		requestToken,
		scheduleRenewal,
		triggerAccessRefresh,
		apiRef,
		authRef,
		accessRef,
		refIdRef
	}
}

// vim: ts=4
