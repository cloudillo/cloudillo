// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * `useSettings` targets the home node by default, `context: true` targets the active context,
 * and a pending debounced write is flushed (not dropped) on unmount.
 */

import { jest } from '@jest/globals'
import { act, renderHook, waitFor } from '@testing-library/react'
import type * as React from 'react'

import { mockCloudilloReact, mockI18n, mockRealCore } from './helpers/mocks.js'

function makeApi() {
	return {
		settings: {
			list: jest.fn(async () => [{ key: 'profile.name', value: 'old' }]),
			update: jest.fn(async () => ({}))
		}
	}
}
const homeApi = makeApi()
const communityApi = makeApi()
const toast = { error: jest.fn(), success: () => {}, info: () => {}, warning: () => {} }

await mockRealCore()
jest.unstable_mockModule('../context/index.js', () => ({
	useContextAwareApi: () => ({ api: communityApi, authenticated: true })
}))
await mockCloudilloReact({
	useApi: () => ({ api: homeApi, authenticated: true }),
	useToast: () => toast
})
mockI18n()

const { useSettings } = await import('../settings/settings.js')

describe('useSettings', () => {
	beforeEach(() => {
		for (const api of [homeApi, communityApi]) {
			api.settings.list.mockClear()
			api.settings.update.mockClear()
		}
		toast.error.mockClear()
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	it('reads home by default', async () => {
		const { result } = renderHook(() => useSettings('profile'))
		await waitFor(() => expect(result.current.settings).toEqual({ 'profile.name': 'old' }))
		expect(homeApi.settings.list).toHaveBeenCalledWith({ prefix: 'profile' })
		expect(communityApi.settings.list).not.toHaveBeenCalled()
	})

	it('context: true reads the active context', async () => {
		const { result } = renderHook(() => useSettings('profile', { context: true }))
		await waitFor(() => expect(result.current.settings).toBeDefined())
		expect(communityApi.settings.list).toHaveBeenCalledWith({ prefix: 'profile' })
		expect(homeApi.settings.list).not.toHaveBeenCalled()
	})

	it('an explicit idTag uses that node', async () => {
		const { result } = renderHook(() => useSettings('profile', { idTag: 'me.tld' }))
		await waitFor(() => expect(result.current.settings).toBeDefined())
		expect(homeApi.settings.list).toHaveBeenCalledWith({ prefix: 'profile' })
		expect(communityApi.settings.list).not.toHaveBeenCalled()
	})

	it('flushes a pending debounced write on unmount, exactly once', async () => {
		const { result, unmount } = renderHook(() => useSettings('profile'))
		await waitFor(() => expect(result.current.settings).toBeDefined())
		jest.useFakeTimers()
		const evt = {
			target: { name: 'profile.name', value: 'new', type: 'text', tagName: 'INPUT' }
		} as unknown as React.ChangeEvent<HTMLInputElement>
		await act(async () => {
			await result.current.onSettingChange(evt)
		})
		expect(homeApi.settings.update).not.toHaveBeenCalled()
		unmount()
		expect(homeApi.settings.update).toHaveBeenCalledTimes(1)
		expect(homeApi.settings.update).toHaveBeenCalledWith(
			'profile.name',
			{ value: 'new' },
			undefined
		)
		jest.advanceTimersByTime(1000)
		expect(homeApi.settings.update).toHaveBeenCalledTimes(1)
		expect(communityApi.settings.update).not.toHaveBeenCalled()
	})
})

// vim: ts=4
