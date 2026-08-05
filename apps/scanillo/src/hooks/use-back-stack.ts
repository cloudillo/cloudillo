// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

const MARKER = 'scanilloDepth'
// If a traversal we requested never reports back, don't wedge the handler forever.
const TRAVERSAL_TIMEOUT_MS = 500

/**
 * Keeps the browser's session history in sync with the depth of the app's overlay stack, so
 * the back button closes the topmost overlay instead of leaving the app.
 *
 * `depth` is the number of open overlays; `onBack` is invoked when the user presses back and
 * at least one sentinel entry of ours is on the stack.
 */
export function useBackStack(depth: number, onBack: () => void) {
	const onBackRef = React.useRef(onBack)
	React.useLayoutEffect(() => {
		onBackRef.current = onBack
	})

	// Sentinel entries we have pushed onto the session history.
	const pushedRef = React.useRef(0)
	// True while a history.go() we requested is still in flight.
	const traversingRef = React.useRef(false)
	// The watchdog for the traversal above. Held in a ref so it can be cleared:
	// a stale one firing mid-flight clears the flag of a *later* traversal, whose
	// popstate is then misread as a user back press and closes an extra overlay.
	const traversalTimerRef = React.useRef<number | undefined>(undefined)
	const [, bump] = React.useReducer((x: number) => x + 1, 0)

	// A traversal is over: drop the flag and its watchdog together.
	const settleTraversal = React.useCallback(() => {
		if (traversalTimerRef.current !== undefined) {
			clearTimeout(traversalTimerRef.current)
			traversalTimerRef.current = undefined
		}
		traversingRef.current = false
	}, [])

	React.useEffect(() => {
		function handlePopState() {
			if (traversingRef.current) {
				// Our own history.go() landed — resume reconciling.
				settleTraversal()
				bump()
				return
			}
			// Nothing of ours left on the stack: this back press leaves the app.
			if (pushedRef.current === 0) return
			pushedRef.current--
			onBackRef.current()
		}
		window.addEventListener('popstate', handlePopState)
		return () => {
			window.removeEventListener('popstate', handlePopState)
			if (traversalTimerRef.current !== undefined) clearTimeout(traversalTimerRef.current)
		}
	}, [settleTraversal])

	// Reconcile after every render — `depth` alone is not a sufficient dependency, because a
	// back press can consume a sentinel without changing the depth (filter -> crop).
	React.useEffect(() => {
		if (traversingRef.current) return
		while (pushedRef.current < depth) {
			pushedRef.current++
			window.history.pushState({ ...window.history.state, [MARKER]: pushedRef.current }, '')
		}
		if (pushedRef.current > depth) {
			const n = pushedRef.current - depth
			pushedRef.current = depth
			traversingRef.current = true
			window.history.go(-n)
			// Replace, never stack — see traversalTimerRef.
			if (traversalTimerRef.current !== undefined) clearTimeout(traversalTimerRef.current)
			traversalTimerRef.current = window.setTimeout(() => {
				traversalTimerRef.current = undefined
				if (!traversingRef.current) return
				traversingRef.current = false
				bump()
			}, TRAVERSAL_TIMEOUT_MS)
		}
	})
}

// vim: ts=4
