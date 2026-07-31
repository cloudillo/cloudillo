// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

/**
 * A ref that always holds the latest render's value, without writing it during render.
 *
 * The render-body assignment this replaces is a render side effect: correct today, but a render
 * that React discards would still have mutated the ref. useInsertionEffect runs before layout
 * effects and therefore before anything that reads the ref, which is why React's own
 * latest-value pattern uses it rather than useEffect.
 *
 * Only for PURE latest-value refs. A ref its own callback also writes eagerly - so that a second
 * call in the same frame sees the first one's effect - must keep the synchronous assignment.
 *
 * Never read this DURING RENDER: the insertion effect lands after the render phase, so a
 * render-phase read sees the previous commit's value. Event handlers and effects are fine.
 */
export function useLatestRef<T>(value: T): React.RefObject<T> {
	const ref = React.useRef(value)
	React.useInsertionEffect(() => {
		ref.current = value
	})
	return ref
}

// vim: ts=4
