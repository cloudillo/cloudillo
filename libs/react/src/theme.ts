// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Theme state, on its own so `@cloudillo/react/doc-bar` can reach it.
 *
 * Not in `hooks.tsx`: that imports `react-router-dom` at module scope, and the
 * `doc-bar` entry point exists precisely so an app without a router (quillo)
 * does not grow one. `hooks.tsx` re-exports it for `useCloudillo` users.
 */

import { getAppBus } from '@cloudillo/core'
import * as React from 'react'

/**
 * The shell's current theme, tracked live.
 *
 * `useCloudillo().darkMode` re-renders only the component that calls it — which
 * is not enough for anything sitting under a `React.memo` boundary, as the
 * canvas apps' presence layers do. This subscribes directly, so a leaf that
 * derives a colour in JS re-renders on a theme switch on its own account.
 */
export function useDarkMode(): boolean {
	const [dark, setDark] = React.useState(() => {
		try {
			return getAppBus().darkMode
		} catch {
			return false
		}
	})
	React.useEffect(() => {
		let bus: ReturnType<typeof getAppBus>
		try {
			bus = getAppBus()
		} catch {
			// No bus at all (a standalone or test mount). Nothing to track.
			return
		}
		// Re-read before subscribing: `onThemeChange` only fires on later changes,
		// so a `theme:update` that landed between the initializer above and this
		// effect would otherwise never be seen.
		setDark(bus.darkMode)
		return bus.onThemeChange(setDark)
	}, [])
	return dark
}

// vim: ts=4
