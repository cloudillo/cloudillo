// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Promoting a page to home is two writes with no transaction over them, so the only
 * question that matters is which half survives when the second one fails.
 *
 * `setHomePage` reparents the page's children to the root irreversibly. Doing that
 * first left a document whose tree had been restructured for every collaborator with
 * no home page to explain why — invisible to the author, and not recoverable by
 * retrying. `d/site` first fails the other way: it names a page whose children have
 * not moved yet, which the readers already tolerate and which the same action
 * retried completes.
 */

import type { RtdbClient } from '@cloudillo/rtdb'
import { jest } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import type { PageWithId } from '../publish/tree.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

jest.unstable_mockModule('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key })
}))

jest.unstable_mockModule('@cloudillo/react', () => ({
	useDialog: () => ({ tell: async () => undefined })
}))

const { useHomePage } = await import('../hooks/useHomePage.js')

/** `p1` with one child, so `setHomePage` has a reparent to attempt. */
function pageMap(): Map<string, PageWithId> {
	const page = (id: string, parentPageId?: string): PageWithId =>
		({ id, title: id, parentPageId, order: 0 }) as unknown as PageWithId
	return new Map([
		['p1', page('p1')],
		['c1', page('c1', 'p1')]
	])
}

/** Records every batched update, so the test can see whether the tree moved. */
function makeClient() {
	const updates: { path: string; data: unknown }[] = []
	const client = {
		ref: (path: string) => ({ path }),
		batch: () => ({
			update: (ref: { path: string }, data: unknown) => {
				updates.push({ path: ref.path, data })
			},
			commit: async () => undefined
		})
	} as unknown as RtdbClient
	return { client, updates }
}

function renderHook(opts: Parameters<typeof useHomePage>[0]) {
	const root = createRoot(document.createElement('div'))
	const result = { current: undefined as unknown as ReturnType<typeof useHomePage> }
	function Probe() {
		result.current = useHomePage(opts)
		return null
	}
	act(() => {
		root.render(<Probe />)
	})
	return result
}

describe('useHomePage.setHome', () => {
	it('should write the document settings before it moves the tree', async () => {
		const { client, updates } = makeClient()
		const order: string[] = []
		const save = jest.fn(async () => {
			order.push('save')
		})
		const result = renderHook({ client, pages: pageMap(), save })

		await act(async () => {
			await result.current.setHome('p1')
		})

		expect(order).toEqual(['save'])
		expect(save).toHaveBeenCalledWith('p1')
		// The reparent ran, and it ran second.
		expect(updates).toHaveLength(1)
		expect(updates[0].path).toBe('p/c1')
	})

	it('should accept a page the snapshot cannot know about yet', async () => {
		// "Create a home page" writes the page and promotes it in one gesture, and the
		// map here is the snapshot from before the write — so the guard has to take the
		// caller's word for it or the promotion silently does nothing.
		const { client } = makeClient()
		const save = jest.fn(async () => undefined)
		const result = renderHook({ client, pages: pageMap(), save })

		await act(async () => {
			await result.current.setHome('p-new', { justCreated: true })
		})
		expect(save).toHaveBeenCalledWith('p-new')

		await act(async () => {
			await result.current.setHome('p-new')
		})
		expect(save).toHaveBeenCalledTimes(1)
	})

	it('should leave the tree untouched when the settings write fails', async () => {
		// The recoverable failure: nothing has been restructured, so the same click
		// again is a clean retry.
		const { client, updates } = makeClient()
		const save = jest.fn(async () => {
			throw new Error('offline')
		})
		const result = renderHook({ client, pages: pageMap(), save })

		const error = jest.spyOn(console, 'error').mockImplementation(() => {})
		await act(async () => {
			await result.current.setHome('p1')
		})
		error.mockRestore()

		expect(updates).toHaveLength(0)
		expect(result.current.busy).toBe(false)
	})
})

// vim: ts=4
