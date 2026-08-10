// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The guard that deselects a page which vanished from the page map.
 *
 * The regression pinned here is the freshly created page: `createPage` resolves on
 * the server ack, and the subscription's `change` event carrying the new record is
 * a separate frame, so the app selects an id the map does not hold yet. A guard
 * keyed on "*some* page was once present" clears that selection, the app's
 * auto-select bounces the user to the first root page, and the markdown import
 * waiting for that page to become active is swallowed with it.
 */

import { jest } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { useActivePageGuard } from '../hooks/useActivePageGuard.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function page(id: string) {
	return [id, { id }] as const
}

function renderGuard(onVanished: () => void) {
	const container = document.createElement('div')
	const root = createRoot(container)

	function Harness({ ids, ready, active }: { ids: string[]; ready: boolean; active?: string }) {
		const pages = React.useMemo(() => new Map(ids.map(page)), [ids])
		useActivePageGuard(pages, ready, active, onVanished)
		return null
	}

	return {
		update(ids: string[], ready: boolean, active?: string) {
			act(() => {
				root.render(<Harness ids={ids} ready={ready} active={active} />)
			})
		},
		unmount() {
			act(() => root.unmount())
		}
	}
}

describe('useActivePageGuard', () => {
	it('keeps a freshly created page selected while its snapshot is in flight', () => {
		const onVanished = jest.fn()
		const guard = renderGuard(onVanished)

		// 'A' is on screen and confirmed present.
		guard.update(['A'], true, 'A')
		// The user creates 'B': the app selects it on the server ack, before the
		// subscription's change event has added it to the map.
		guard.update(['A'], true, 'B')
		expect(onVanished).not.toHaveBeenCalled()

		// The snapshot lands. The selection has to have survived to here.
		guard.update(['A', 'B'], true, 'B')
		expect(onVanished).not.toHaveBeenCalled()

		guard.unmount()
	})

	it('clears the selection when the active page really is deleted', () => {
		const onVanished = jest.fn()
		const guard = renderGuard(onVanished)

		guard.update(['A', 'B'], true, 'A')
		expect(onVanished).not.toHaveBeenCalled()

		guard.update(['B'], true, 'A')
		expect(onVanished).toHaveBeenCalledTimes(1)

		guard.unmount()
	})

	it('waits for the map: an unready load is not a deletion', () => {
		const onVanished = jest.fn()
		const guard = renderGuard(onVanished)

		guard.update(['A'], true, 'A')
		// Reconnect: the map empties and goes unready before it refills.
		guard.update([], false, 'A')
		expect(onVanished).not.toHaveBeenCalled()

		guard.update(['A'], true, 'A')
		expect(onVanished).not.toHaveBeenCalled()

		guard.unmount()
	})
})

// vim: ts=4
