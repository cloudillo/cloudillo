// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `useContextAwareApi` must not fall back to the home client while a community URL is
 * still being entered (reload on `/@community/...` before `activeContextAtom` lands),
 * or the home feed flashes under the community URL.
 */

import { jest } from '@jest/globals'
import { renderHook } from '@testing-library/react'
import { atom, Provider } from 'jotai'
import * as React from 'react'

const HOME = 'me.tld'
let isHome = true
const useApi = jest.fn((_idTag: string | null) => ({ api: null }))

const realReact = await import('../../../libs/react/src/index.js')
jest.unstable_mockModule('@cloudillo/react', () => ({
	...realReact,
	apiAtom: atom({ idTag: HOME }),
	useApi,
	useAuth: () => [{ idTag: HOME }]
}))
jest.unstable_mockModule('../context/ctx.js', () => ({
	useCtx: () => ({ isHome })
}))

const { useContextAwareApi } = await import('../context/context-aware-api.js')

function wrapper({ children }: { children: React.ReactNode }) {
	return <Provider>{children}</Provider>
}

describe('useContextAwareApi with no active context', () => {
	beforeEach(() => useApi.mockClear())

	it('yields no client on a community URL', () => {
		isHome = false
		renderHook(() => useContextAwareApi(), { wrapper })
		expect(useApi).toHaveBeenLastCalledWith(null)
	})

	it('yields the home client on a home URL', () => {
		isHome = true
		renderHook(() => useContextAwareApi(), { wrapper })
		expect(useApi).toHaveBeenLastCalledWith(HOME)
	})
})

// vim: ts=4
