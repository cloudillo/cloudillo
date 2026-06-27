// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

// useThrottledCallback() //
////////////////////////////

// Trailing-edge throttle with flush().
// fn: the callback to throttle. ms: window in milliseconds (default 1500).
// Returns [throttledFn, flush] where flush() fires any pending call immediately.
//
// Kept in its own module (React-only imports) so it can be unit-tested without
// loading the full `hooks.tsx` dependency graph (@cloudillo/core, crdt, yjs…).
export function useThrottledCallback<T extends (...args: never[]) => void>(
	fn: T,
	ms = 1500
): [T, () => void] {
	const fnRef = React.useRef(fn)
	fnRef.current = fn
	const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
	const pendingArgsRef = React.useRef<Parameters<T> | null>(null)

	const flush = React.useCallback(() => {
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current)
			timerRef.current = null
		}
		if (pendingArgsRef.current !== null) {
			fnRef.current(...pendingArgsRef.current)
			pendingArgsRef.current = null
		}
	}, [])

	const throttled = React.useCallback(
		(...args: Parameters<T>) => {
			pendingArgsRef.current = args
			if (timerRef.current === null) {
				timerRef.current = setTimeout(() => {
					timerRef.current = null
					if (pendingArgsRef.current !== null) {
						fnRef.current(...pendingArgsRef.current)
						pendingArgsRef.current = null
					}
				}, ms)
			}
		},
		[ms]
	) as T

	React.useEffect(
		() => () => {
			if (timerRef.current !== null) clearTimeout(timerRef.current)
		},
		[]
	)

	return [throttled, flush]
}

// vim: ts=4
