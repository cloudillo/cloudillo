// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Muting a room while the muted list is still loading must survive the load.
 *
 * `.test.tsx` so jest gives this suite the jsdom environment (see jest.config.cjs).
 */

import { jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'
import { getDefaultStore } from 'jotai'

const ROOM = '@c.tld~lobby'

type Row = { key: string; value: unknown }
let resolveList: (rows: Row[]) => void = () => {}
let rejectList: (err: Error) => void = () => {}
const list = jest.fn(
	() =>
		new Promise<Row[]>((resolve, reject) => {
			resolveList = resolve
			rejectList = reject
		})
)
// Stable identity: the hook's callbacks depend on it.
const api = {
	settings: {
		list,
		update: jest.fn(async () => {}),
		delete: jest.fn(async () => {})
	}
}

jest.unstable_mockModule('@cloudillo/react', () => ({
	useApi: () => ({ api })
}))

const { mutedRoomsAtom, useMutedRooms } = await import('../lib/room-mute.js')

const store = getDefaultStore()
const mutedRow = { key: `chan.mute.${ROOM}`, value: true }

beforeEach(() => {
	list.mockClear()
	store.set(mutedRoomsAtom, undefined)
})

describe('useMutedRooms', () => {
	it('keeps a mute made while the list loads', async () => {
		const { result } = renderHook(() => useMutedRooms())
		await act(() => result.current.mute(ROOM))
		await act(async () => resolveList([]))
		expect(result.current.muted.has(ROOM)).toBe(true)
	})

	it('keeps an unmute made while the list loads', async () => {
		const { result } = renderHook(() => useMutedRooms())
		await act(() => result.current.unmute(ROOM))
		await act(async () => resolveList([mutedRow]))
		expect(result.current.muted.has(ROOM)).toBe(false)
	})

	it('updates the loaded list directly', async () => {
		const { result } = renderHook(() => useMutedRooms())
		await act(async () => resolveList([]))
		expect(result.current.muted.has(ROOM)).toBe(false)
		await act(() => result.current.mute(ROOM))
		expect(result.current.muted.has(ROOM)).toBe(true)
		await act(() => result.current.unmute(ROOM))
		expect(result.current.muted.has(ROOM)).toBe(false)
		expect(list).toHaveBeenCalledTimes(1)
	})

	it('mute after failed load shows as muted', async () => {
		const error = jest.spyOn(console, 'error').mockImplementation(() => {})
		const { result } = renderHook(() => useMutedRooms())
		await act(async () => rejectList(new Error('offline')))
		await act(() => result.current.mute(ROOM))
		expect(result.current.muted.has(ROOM)).toBe(true)
		error.mockRestore()
	})
})

// vim: ts=4
