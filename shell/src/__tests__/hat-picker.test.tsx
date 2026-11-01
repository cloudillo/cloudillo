// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Dismissing "Enter B as…" enters nothing and leaves B's not-entered URL.
 * `MemoryRouter` never sets `history.state.idx`, so the replace-to-home-feed branch runs by
 * default; the `navigate(-1)` branch is reached by seeding `window.history.state` by hand.
 */

import { afterEach, jest } from '@jest/globals'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { atom, createStore, Provider } from 'jotai'
import * as React from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { mockCloudilloReact, mockI18n, mockRealCore } from './helpers/mocks.js'

const B = 'b.tld'
const API_HOOK = { api: undefined }
const AUTH: [{ idTag: string; name: string }] = [{ idTag: 'me.tld', name: 'Me' }]

await mockRealCore()
await mockCloudilloReact({ useApi: () => API_HOOK, useAuth: () => AUTH })
mockI18n()

jest.unstable_mockModule('../context/hooks', () => ({
	useApiContext: () => ({ setActiveContext: jest.fn() }),
	useContextSwitch: () => ({ switchTo: jest.fn() }),
	useContextSwitchNav: () => jest.fn()
}))

// Real jotai atoms; only their module is stubbed, to keep the shell's atom graph out.
const activeContextAtom = atom<{ idTag: string } | undefined>(undefined)
const communitiesAtom = atom<{ idTag: string; name?: string }[]>([])

jest.unstable_mockModule('../context/atoms', () => ({
	activeContextAtom,
	activePinKey: () => undefined,
	communitiesAtom,
	favoritesAtom: atom<string[]>([]),
	partnerCommunitiesAtom: atom([]),
	refFromActive: ({ idTag }: { idTag: string }) => ({ idTag })
}))

const { hatPickerAtom } = await import('../context/hat-entry.js')
const { HatPicker } = await import('../context/HatPicker.js')

function Where() {
	return <div data-testid="where">{useLocation().pathname}</div>
}

function renderPicker(active: string | undefined, from = '/~/feed') {
	const store = createStore()
	const resolve = jest.fn()
	store.set(activeContextAtom, active ? { idTag: active } : undefined)
	store.set(hatPickerAtom, { community: B, entries: ['a.tld', 'c.tld'], resolve })
	render(
		<Provider store={store}>
			<MemoryRouter initialEntries={[from, `/@${B}/feed`]}>
				<HatPicker />
				<Routes>
					<Route path="*" element={<Where />} />
				</Routes>
			</MemoryRouter>
		</Provider>
	)
	return resolve
}

describe('HatPicker dismiss', () => {
	afterEach(() => {
		window.history.replaceState(null, '')
	})

	it('goes back, not replace, when there is a page to go back to', async () => {
		window.history.replaceState({ idx: 1 }, '')
		// The replace branch would land on the home feed instead
		const resolve = renderPicker('me.tld', '/~/files')
		fireEvent.click(screen.getByRole('button', { name: /close/i }))
		await waitFor(() => expect(resolve).toHaveBeenCalledWith(null, ['a.tld', 'c.tld']))
		await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/~/files'))
	})

	it('resolves null and leaves the un-entered community URL', async () => {
		const resolve = renderPicker('me.tld')
		fireEvent.click(screen.getByRole('button', { name: /close/i }))
		await waitFor(() => expect(resolve).toHaveBeenCalledWith(null, ['a.tld', 'c.tld']))
		await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/~/app/feed'))
	})

	it('stays put when already inside the community (change hat)', async () => {
		const resolve = renderPicker(B)
		fireEvent.click(screen.getByRole('button', { name: /close/i }))
		await waitFor(() => expect(resolve).toHaveBeenCalledWith(null, ['a.tld', 'c.tld']))
		// The click fires outside act, so let a pending navigation flush before asserting none
		await new Promise((r) => setTimeout(r, 50))
		expect(screen.getByTestId('where').textContent).toBe(`/@${B}/feed`)
	})
})

// vim: ts=4
