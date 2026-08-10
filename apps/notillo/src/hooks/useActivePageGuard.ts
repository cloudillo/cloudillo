// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

/**
 * Clears the selection when the active page vanishes from the page map — deleted
 * here, or by a collaborator — so the caller's auto-select can pick a new one.
 *
 * The rule is one line away from deselecting a page the user just created:
 * `createPage` resolves on the server ack while the subscription's `change` event
 * is a separate frame, so there is a real render in which the new id is active
 * and the map does not hold it yet.
 */
export function useActivePageGuard(
	pages: ReadonlyMap<string, unknown>,
	pagesReady: boolean,
	activePageId: string | undefined,
	onVanished: () => void
): void {
	// The id last seen in the map, not a flag: clearing on a flag set by the
	// *previous* page deselects a freshly created one while it is merely in flight.
	const activeWasPresentRef = React.useRef<string | undefined>(undefined)
	React.useEffect(() => {
		// An unready map is a load in progress, not evidence the page is gone.
		if (!pagesReady) return
		if (!activePageId) {
			activeWasPresentRef.current = undefined
			return
		}
		if (pages.has(activePageId)) {
			activeWasPresentRef.current = activePageId
			return
		}
		// Only this id disappearing is evidence of deletion. An id that was never
		// present is still in flight from `createPage`.
		if (activeWasPresentRef.current === activePageId) {
			activeWasPresentRef.current = undefined
			onVanished()
		}
	}, [pages, pagesReady, activePageId, onVanished])
}

// vim: ts=4
