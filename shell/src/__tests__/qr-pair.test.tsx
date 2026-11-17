// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * QR device pairing: the `cloudillo:qr-pair:` URI, what ApprovePairView sends on
 * Allow/Deny (safe defaults, permanent lifetime, a vanished scope falling back to
 * the whole context), the grant summary, its error states (with retry), and the
 * per-device native-detector opt-out.
 */

import { jest } from '@jest/globals'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { atom, createStore, Provider } from 'jotai'
import * as React from 'react'

import { mockCloudilloReact } from './helpers/mocks.js'

const api = {
	auth: {
		getPairDetails: jest.fn(async (_id: string) => ({
			deviceName: 'Desktop',
			userAgent: 'Firefox',
			ipAddress: '10.0.0.1',
			createdAt: new Date().toISOString()
		})),
		respondPair: jest.fn(async (_id: string, _body: unknown) => {})
	}
}
const ctxApi = { channels: { list: jest.fn(async (): Promise<unknown[]> => []) } }
const lastFilesUrlAtom = atom({ pathname: '', search: '' })
const activeContextAtom = atom<{ type: string; idTag: string; name: string }>({
	type: 'personal',
	idTag: 'me.tld',
	name: 'Me'
})
const ctx = { base: '/~', idTag: undefined as string | undefined, isHome: true }
const communitiesAtom = atom<{ idTag: string; name: string }[]>([])
const pickDocument = jest.fn(
	async (_opts?: unknown): Promise<{ fileId: string; fileName: string } | null> => null
)

// Swappable so a test can hand ApprovePairView a new api identity
let currentApi = api
await mockCloudilloReact({
	useApi: () => ({ api: currentApi }),
	useAuth: () => [{ idTag: 'me.tld', name: 'Me' }]
})
// Interpolating t, so the grant summary can be asserted
jest.unstable_mockModule('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, opts?: Record<string, unknown>) =>
			key.replace(/{{(\w+)}}/g, (_, k) => String(opts?.[k])),
		i18n: { language: 'en' }
	})
}))

jest.unstable_mockModule('../apps/files/atoms.js', () => ({
	lastFilesUrlAtom,
	roomLabel: (room: string | null, contextName: string) => (room ? `~${room}` : contextName)
}))
jest.unstable_mockModule('../context/atoms.js', () => ({
	activeContextAtom,
	communitiesAtom
}))
jest.unstable_mockModule('../components/DocumentPicker/useDocumentPicker.js', () => ({
	useDocumentPicker: () => ({ pickDocument, isOpen: false })
}))
jest.unstable_mockModule('../context/context-aware-api.js', () => ({
	useContextAwareApi: () => ({ api: ctxApi })
}))
jest.unstable_mockModule('../context/index.js', () => ({
	useCtx: () => ctx
}))

const { ApprovePairView } = await import('../components/QrScanner/ApprovePairView.js')
const { PairPage } = await import('../components/QrScanner/PairPage.js')
const { MemoryRouter, Route, Routes, useLocation } = await import('react-router-dom')
const { parseCloudilloUri } = await import('../utils/cloudillo-uri.js')
const { isQrNativeOff, setQrNativeOff } = await import('../components/QrScanner/state.js')

/** Where the router is, with its history state */
let lastLocation: { pathname: string; state: unknown } | undefined
function LocationProbe() {
	const loc = useLocation()
	lastLocation = { pathname: loc.pathname, state: loc.state }
	return null
}

async function renderView(store = createStore(), code: string | null = '123456') {
	const onDone = jest.fn()
	await act(async () => {
		render(
			<Provider store={store}>
				<MemoryRouter initialEntries={['/~/pair/sess1']}>
					<ApprovePairView sessionId="sess1" code={code ?? undefined} onDone={onDone} />
					<LocationProbe />
				</MemoryRouter>
			</Provider>
		)
	})
	return onDone
}

/** Button fires onClick after its ~200ms press animation */
async function click(name: string) {
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name }))
		jest.advanceTimersByTime(300)
	})
}

beforeEach(() => {
	jest.clearAllMocks()
	jest.useFakeTimers()
})

afterEach(() => {
	jest.useRealTimers()
})

describe('parseCloudilloUri', () => {
	it('parses a qr-pair URI with its verification code', () => {
		expect(parseCloudilloUri('cloudillo:qr-pair:abc:123456')).toEqual({
			type: 'qr-pair',
			sessionId: 'abc',
			code: '123456'
		})
	})

	it('parses a qr-pair URI', () => {
		expect(parseCloudilloUri('cloudillo:qr-pair:abc123')).toEqual({
			type: 'qr-pair',
			sessionId: 'abc123'
		})
	})

	it('does not return a pair result for an empty payload', () => {
		expect(parseCloudilloUri('cloudillo:qr-pair:')?.type).not.toBe('qr-pair')
	})
})

describe('ApprovePairView', () => {
	it('shows the device name with its browser and IP', async () => {
		await renderView()
		expect(screen.getByText('Desktop')).toBeTruthy()
		expect(screen.getByText('Firefox · 10.0.0.1')).toBeTruthy()
	})

	it('sends safe defaults on Allow', async () => {
		await renderView()
		await click('Allow')
		expect(api.auth.respondPair).toHaveBeenCalledWith('sess1', {
			approved: true,
			target: '*',
			access: 'R',
			lifetimeSecs: 3600,
			profile: 'standard',
			contextIdTag: undefined,
			code: '123456'
		})
	})

	it('sends a null lifetime for Permanent', async () => {
		await renderView()
		fireEvent.click(screen.getByRole('radio', { name: 'Permanent' }))
		await click('Allow')
		expect(api.auth.respondPair).toHaveBeenCalledWith(
			'sess1',
			expect.objectContaining({ lifetimeSecs: null })
		)
	})

	it('falls back to the whole context when the chosen scope vanishes', async () => {
		const store = createStore()
		store.set(lastFilesUrlAtom, { pathname: '/~/app/files', search: '?parentId=f1' })
		await renderView(store)
		fireEvent.change(screen.getByDisplayValue('Whole context'), { target: { value: 'f1' } })
		expect(screen.getByDisplayValue('Current folder')).toBeTruthy()
		await act(async () => {
			store.set(lastFilesUrlAtom, { pathname: '', search: '' })
		})
		await click('Allow')
		expect(api.auth.respondPair).toHaveBeenCalledWith(
			'sess1',
			expect.objectContaining({ target: '*' })
		)
	})

	it('sends only approved: false on Deny', async () => {
		const onDone = await renderView()
		await click('Deny')
		expect(api.auth.respondPair).toHaveBeenCalledWith('sess1', { approved: false })
		expect(onDone).toHaveBeenCalled()
	})

	it('summarizes the grant and warns about wide write access', async () => {
		await renderView()
		expect(
			screen.getByText('This key will grant read-only access to Whole context, for 1 hour.')
		).toBeTruthy()
		expect(screen.queryByText(/is risky/)).toBeNull()
		fireEvent.click(screen.getByRole('radio', { name: 'Read and write' }))
		expect(
			screen.getByText(
				'This key will grant read and write access to Whole context, for 1 hour.'
			)
		).toBeTruthy()
		// One warning carries both the summary and the risk note (the header alert is separate)
		const risk = screen
			.getAllByRole('alert')
			.filter((a) => /is risky/.test(a.textContent ?? ''))
		expect(risk).toHaveLength(1)
		expect(risk[0].textContent).toContain('read and write access to Whole context')
	})

	it('warns about a permanent read-only key to the whole context', async () => {
		await renderView()
		fireEvent.click(screen.getByRole('radio', { name: 'Permanent' }))
		expect(screen.getByRole('radio', { name: 'Read only' }).getAttribute('aria-checked')).toBe(
			'true'
		)
		expect(screen.getByDisplayValue('Whole context')).toBeTruthy()
		expect(screen.getByText(/is risky/)).toBeTruthy()
	})

	it('lets the user retry after a respond failure', async () => {
		api.auth.respondPair.mockRejectedValueOnce(new Error('conflict'))
		jest.spyOn(console, 'error').mockImplementation(() => {})
		await renderView()
		await click('Allow')
		expect(screen.getByText('Failed to respond')).toBeTruthy()
		expect(screen.getByText(/may already be paired/)).toBeTruthy()
		await click('Try again')
		expect(screen.getByText('Pair this device?')).toBeTruthy()
		await click('Allow')
		expect(api.auth.respondPair).toHaveBeenCalledTimes(2)
		expect(screen.getByText('Device paired')).toBeTruthy()
	})

	it('makes the link path type the code before Allow', async () => {
		await renderView(createStore(), null)
		const allow = screen.getByRole('button', { name: 'Allow' }) as HTMLButtonElement
		expect(allow.disabled).toBe(true)
		const input = screen.getByLabelText('Verification code') as HTMLInputElement
		// maxLength would truncate a pasted "123 456" before the digits are stripped
		expect(input.maxLength).not.toBe(6)
		fireEvent.change(input, { target: { value: '1234567' } })
		expect(input.value).toBe('123456')
		fireEvent.change(input, { target: { value: '12 34a5' } })
		expect(input.value).toBe('12345')
		expect(allow.disabled).toBe(true)
		fireEvent.change(input, { target: { value: '123 456' } })
		expect(allow.disabled).toBe(false)
		await click('Allow')
		expect(api.auth.respondPair).toHaveBeenCalledWith(
			'sess1',
			expect.objectContaining({ code: '123456' })
		)
	})

	it('shows no code input when the QR carried one', async () => {
		await renderView()
		expect(screen.queryByLabelText('Verification code')).toBeNull()
	})

	it('scopes the key to the active community', async () => {
		const store = createStore()
		store.set(activeContextAtom, { type: 'community', idTag: 'comm.tld', name: 'Comm' })
		await renderView(store)
		expect(screen.getByText(/on your behalf/)).toBeTruthy()
		await click('Allow')
		expect(api.auth.respondPair).toHaveBeenCalledWith(
			'sess1',
			expect.objectContaining({ contextIdTag: 'comm.tld' })
		)
	})

	it('offers only joined rooms', async () => {
		ctxApi.channels.list.mockResolvedValueOnce([
			{ name: 'dev', status: 'in' },
			{ name: 'x', status: 'invited' }
		])
		await renderView()
		expect(screen.getByRole('option', { name: '~dev' })).toBeTruthy()
		expect(screen.queryByRole('option', { name: '~x' })).toBeNull()
		fireEvent.change(screen.getByDisplayValue('Whole context'), { target: { value: '~dev' } })
		await click('Allow')
		expect(api.auth.respondPair).toHaveBeenCalledWith(
			'sess1',
			expect.objectContaining({ target: '~dev' })
		)
	})

	it('sends the chosen upload profile', async () => {
		await renderView()
		fireEvent.change(screen.getByDisplayValue('Standard'), { target: { value: 'high' } })
		await click('Allow')
		expect(api.auth.respondPair).toHaveBeenCalledWith(
			'sess1',
			expect.objectContaining({ profile: 'high' })
		)
	})

	it('closes itself shortly after success', async () => {
		const onDone = await renderView()
		await click('Allow')
		expect(screen.getByText('Device paired')).toBeTruthy()
		expect(onDone).not.toHaveBeenCalled()
		act(() => {
			jest.advanceTimersByTime(1500)
		})
		expect(onDone).toHaveBeenCalled()
	})

	it('does not refetch when the api identity changes', async () => {
		const onDone = jest.fn()
		const view = (
			<Provider store={createStore()}>
				<MemoryRouter>
					<ApprovePairView sessionId="sess1" code="123456" onDone={onDone} />
				</MemoryRouter>
			</Provider>
		)
		let rerender: (ui: React.ReactElement) => void = () => {}
		await act(async () => {
			rerender = render(view).rerender
		})
		expect(api.auth.getPairDetails).toHaveBeenCalledTimes(1)
		currentApi = { ...api }
		await act(async () => {
			rerender(
				<Provider store={createStore()}>
					<MemoryRouter>
						<ApprovePairView sessionId="sess1" code="123456" onDone={onDone} />
					</MemoryRouter>
				</Provider>
			)
		})
		currentApi = api
		expect(api.auth.getPairDetails).toHaveBeenCalledTimes(1)
		expect(screen.getByText('Pair this device?')).toBeTruthy()
	})

	it('hides the account select without communities', async () => {
		await renderView()
		expect(screen.queryByText('Account')).toBeNull()
	})

	it('switches the account by re-homing the page with pairContext state', async () => {
		const store = createStore()
		store.set(communitiesAtom, [{ idTag: 'comm.tld', name: 'Comm' }])
		await renderView(store)
		expect(screen.getByText('Me', { selector: '.c-list-item-title' })).toBeTruthy()
		expect(screen.getByText(/me\.tld/)).toBeTruthy()
		expect(screen.queryByText('Comm')).toBeNull()
		await click('Change')
		await act(async () => {
			fireEvent.click(screen.getByText('Comm'))
		})
		expect(lastLocation).toEqual({
			pathname: '/@comm.tld/pair/sess1',
			state: { pairContext: true }
		})
	})

	it('collapses without navigating when the current account is picked', async () => {
		const store = createStore()
		store.set(communitiesAtom, [{ idTag: 'comm.tld', name: 'Comm' }])
		await renderView(store)
		await click('Change')
		await act(async () => {
			fireEvent.click(screen.getByText('Me', { selector: '.c-list-item-title' }))
		})
		expect(lastLocation?.pathname).toBe('/~/pair/sess1')
		expect(screen.queryByText('Comm')).toBeNull()
		expect(screen.getByRole('button', { name: 'Change' })).toBeTruthy()
	})

	it('sends and names a folder chosen in the picker', async () => {
		pickDocument.mockResolvedValueOnce({ fileId: 'f1', fileName: 'Docs' })
		await renderView()
		await act(async () => {
			fireEvent.change(screen.getByDisplayValue('Whole context'), {
				target: { value: '__pick__' }
			})
		})
		expect(pickDocument).toHaveBeenCalledWith(expect.objectContaining({ folderOnly: true }))
		expect(screen.getByDisplayValue('Docs')).toBeTruthy()
		expect(screen.getByText(/read-only access to Docs,/)).toBeTruthy()
		await click('Allow')
		expect(api.auth.respondPair).toHaveBeenCalledWith(
			'sess1',
			expect.objectContaining({ target: 'f1' })
		)
	})

	it('keeps the scope when the folder picker is cancelled', async () => {
		await renderView()
		await act(async () => {
			fireEvent.change(screen.getByDisplayValue('Whole context'), {
				target: { value: '__pick__' }
			})
		})
		expect(screen.getByDisplayValue('Whole context')).toBeTruthy()
	})

	it('shows an error when the session cannot be fetched', async () => {
		api.auth.getPairDetails.mockRejectedValueOnce(new Error('gone'))
		jest.spyOn(console, 'error').mockImplementation(() => {})
		await renderView()
		expect(screen.getByText('Session expired or invalid')).toBeTruthy()
	})
})

describe('PairPage', () => {
	function Where() {
		return <div>at {useLocation().pathname}</div>
	}

	async function renderAt(entry: string | { pathname: string; state: unknown }) {
		await act(async () => {
			render(
				<Provider store={createStore()}>
					<MemoryRouter initialEntries={[entry]}>
						<Routes>
							<Route path="/@comm.tld/pair/:sessionId" element={<PairPage />} />
							<Route path="*" element={<Where />} />
						</Routes>
					</MemoryRouter>
				</Provider>
			)
		})
	}

	it('keeps a community the user switched to in the card', async () => {
		ctx.isHome = false
		ctx.base = '/@comm.tld'
		try {
			await renderAt({ pathname: '/@comm.tld/pair/sess1', state: { pairContext: true } })
			expect(screen.queryByText(/^at /)).toBeNull()
			expect(screen.getByText('Pair this device?')).toBeTruthy()
		} finally {
			ctx.isHome = true
			ctx.base = '/~'
		}
	})

	it('pins a community link back to home', async () => {
		ctx.isHome = false
		ctx.base = '/@comm.tld'
		try {
			await act(async () => {
				render(
					<Provider store={createStore()}>
						<MemoryRouter initialEntries={['/@comm.tld/pair/sess1']}>
							<Routes>
								<Route path="/@comm.tld/pair/:sessionId" element={<PairPage />} />
								<Route path="*" element={<Where />} />
							</Routes>
						</MemoryRouter>
					</Provider>
				)
			})
			expect(screen.getByText('at /~/pair/sess1')).toBeTruthy()
		} finally {
			ctx.isHome = true
			ctx.base = '/~'
		}
	})
})

describe('isQrNativeOff', () => {
	it('round-trips through setQrNativeOff', () => {
		setQrNativeOff(true)
		expect(isQrNativeOff()).toBe(true)
		setQrNativeOff(false)
		expect(isQrNativeOff()).toBe(false)
	})

	it('is false when localStorage throws', () => {
		const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('denied')
		})
		expect(isQrNativeOff()).toBe(false)
		spy.mockRestore()
	})
})

// vim: ts=4
