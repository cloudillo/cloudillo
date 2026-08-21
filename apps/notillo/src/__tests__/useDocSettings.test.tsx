// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `useDocSettings` owns the one record — `d/site` — that holds both `siteMode` and
 * `homePageId`, and it is written from two unrelated places in the UI. So the
 * create-or-patch decision is the whole risk: a `set` replaces the record, and the
 * two fields have no other home to be recovered from.
 *
 * What is asserted here is the third state. "The record exists" and "the record does
 * not" are both answers; "the read failed" is not one, and treating it as the latter
 * is what dropped `homePageId` on the next `save({ siteMode })`.
 */

import type { RtdbClient } from '@cloudillo/rtdb'
import { jest } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { useDocSettings } from '../hooks/useDocSettings.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type SnapshotCb = (snapshot: { exists: boolean; data: () => unknown }) => void
type ErrorCb = (err: Error) => void

/** The slice of `RtdbClient` the hook touches, with the subscription left open. */
function makeClient() {
	const set = jest.fn(() => Promise.resolve())
	const update = jest.fn(() => Promise.resolve())
	let onNext: SnapshotCb | undefined
	let onError: ErrorCb | undefined

	const client = {
		ref: () => ({
			set,
			update,
			onSnapshot: (next: SnapshotCb, err: ErrorCb) => {
				onNext = next
				onError = err
				return () => {}
			}
		})
	} as unknown as RtdbClient

	return {
		client,
		set,
		update,
		emit(exists: boolean, data: unknown = {}) {
			act(() => {
				onNext?.({ exists, data: () => data })
			})
		},
		fail(err = new Error('read failed')) {
			act(() => {
				onError?.(err)
			})
		}
	}
}

/** Minimal renderHook, so the suite needs no @testing-library dependency. */
function renderHook(client: RtdbClient) {
	const root = createRoot(document.createElement('div'))
	const result = { current: undefined as unknown as ReturnType<typeof useDocSettings> }
	function Probe() {
		result.current = useDocSettings(client)
		return null
	}
	act(() => {
		root.render(<Probe />)
	})
	return result
}

describe('useDocSettings', () => {
	it('should patch rather than replace after a snapshot read error', async () => {
		// The regression: the error callback leaves "does the record exist?"
		// unanswered, and answering it "no" made `save` replace `d/site` outright —
		// dropping `homePageId` on a `save({ siteMode })` and vice versa.
		const { client, set, update, fail } = makeClient()
		const result = renderHook(client)

		const error = jest.spyOn(console, 'error').mockImplementation(() => {})
		fail()
		error.mockRestore()
		await act(async () => {
			await result.current.save({ siteMode: true })
		})

		expect(update).toHaveBeenCalledWith({ siteMode: true })
		expect(set).not.toHaveBeenCalled()
	})

	it('should patch before the first snapshot has arrived', async () => {
		// Same rule, the other way in: nothing has been read yet, so nothing is known.
		const { client, set, update } = makeClient()
		const result = renderHook(client)

		await act(async () => {
			await result.current.save({ siteMode: true })
		})

		expect(update).toHaveBeenCalledWith({ siteMode: true })
		expect(set).not.toHaveBeenCalled()
	})

	it('should create the record when the snapshot says there is none', async () => {
		const { client, set, update, emit } = makeClient()
		const result = renderHook(client)

		emit(false)
		await act(async () => {
			await result.current.save({ siteMode: true })
		})

		expect(set).toHaveBeenCalledWith({ siteMode: true })
		expect(update).not.toHaveBeenCalled()
	})

	it('should patch an existing record, so a field it cannot read survives', async () => {
		const { client, set, update, emit } = makeClient()
		const result = renderHook(client)

		emit(true, { homePageId: 'p1' })
		await act(async () => {
			await result.current.save({ siteMode: true })
		})

		expect(update).toHaveBeenCalledWith({ siteMode: true })
		expect(set).not.toHaveBeenCalled()
	})

	it('should create only once when two saves race inside one round trip', async () => {
		// The lost update: `existsRef` was marked *after* the await, so both saves
		// read "absent" and both `set`. The second `set` replaces the record the
		// first created — toggling site mode and then picking a home page fast
		// enough left `d/site` holding only `homePageId`.
		const { client, set, update, emit } = makeClient()
		const result = renderHook(client)

		emit(false)
		await act(async () => {
			const first = result.current.save({ siteMode: true })
			const second = result.current.save({ homePageId: 'p1' })
			await Promise.all([first, second])
		})

		expect(set).toHaveBeenCalledTimes(1)
		expect(set).toHaveBeenCalledWith({ siteMode: true })
		expect(update).toHaveBeenCalledTimes(1)
		expect(update).toHaveBeenCalledWith({ homePageId: 'p1' })
	})

	it('should stop creating once the first write has been made', async () => {
		const { client, set, update, emit } = makeClient()
		const result = renderHook(client)

		emit(false)
		await act(async () => {
			await result.current.save({ siteMode: true })
		})
		await act(async () => {
			await result.current.save({ homePageId: 'p1' })
		})

		expect(set).toHaveBeenCalledTimes(1)
		expect(update).toHaveBeenCalledWith({ homePageId: 'p1' })
	})
})

// vim: ts=4
