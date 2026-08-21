// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * What the omnibox puts on the wire, what it does with the caret, and what it
 * remembers. Home/End reaching the text field is left to manual checking rather than
 * a jsdom caret simulation.
 *
 * Fake timers here, unlike the sibling `omnibox.test.tsx`: the debounce is the
 * subject, so it has to be stepped rather than waited out. Every advance is wrapped
 * in an async `act` so the awaited response settles inside it.
 *
 * The full-text cache lives on the rendered omnibox, so each render starts with an
 * empty one; its entries expire after `FTS_CACHE_TTL_MS`, which the fake timers can
 * step over since they mock the `Date.now()` QuickLRU reads.
 *
 * `.test.tsx` so jest gives this suite the jsdom environment (see jest.config.cjs).
 */

import { jest } from '@jest/globals'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { atom, createStore, Provider } from 'jotai'
import * as React from 'react'

const HOME = 'user.example.com'

interface SearchCall {
	q?: string
	limit?: number
	signal?: AbortSignal
}

let navigated: string[] = []

const SITE_MIME = 'application/vnd.cloudillo.site+zip'
let calls: SearchCall[] = []
/** Resolved by the test; a call left pending stands in for a slow server. */
let searchResponse: (call: SearchCall) => Promise<unknown> = async () => ({
	data: [],
	pagination: { total: 0 }
})

// Module-level constants, never fresh literals per call: a hook handing back a new
// object each render re-arms the omnibox's effects on every commit.
// Context-relative templates, as `manifest-registry.ts` emits them; `scopePath`
// turns one into a real route.
const MENU = [
	{ id: 'files', label: 'Files', path: 'app/files' },
	{ id: 'feed', label: 'Feed', path: 'app/feed' }
]
const APP_CONFIG = [{ apps: [], mime: {}, menu: MENU }]
const TOAST = { error: () => {}, success: () => {} }
const CTX = { base: '/~', idTag: HOME, isHome: true }
const POPPER = { styles: { popper: {} }, attributes: { popper: {} } }
const API = { api: { profiles: { list: async () => [] } } }
const CTX_API = {
	api: {
		search: {
			queryPaginated: (query: SearchCall, opts?: { signal?: AbortSignal }) => {
				const call: SearchCall = { ...query, signal: opts?.signal }
				calls.push(call)
				// A real fetch rejects with an AbortError when its signal fires; the
				// omnibox has to stay silent about those.
				return Promise.race([
					searchResponse(call),
					new Promise((_resolve, reject) => {
						opts?.signal?.addEventListener('abort', () =>
							reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
						)
					})
				])
			}
		}
	}
}

// The real hook, taken from source: the `@cloudillo/react` barrel is mocked below,
// and a factory cannot import the specifier it stands in for.
const { useDebouncedValue } = await import('../../../libs/react/src/components/hooks.js')

jest.unstable_mockModule('@cloudillo/react', () => ({
	Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
	LoadingSpinner: () => <span data-testid="spinner" />,
	mergeClasses: (...cls: unknown[]) => cls.filter(Boolean).join(' '),
	ProfilePicture: () => <span />,
	useApi: () => API,
	useAuth: () => [{ idTag: HOME }],
	useDebouncedValue,
	useToast: () => TOAST
}))

jest.unstable_mockModule('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } })
}))

jest.unstable_mockModule('react-popper', () => ({
	usePopper: () => POPPER
}))

jest.unstable_mockModule('react-router-dom', () => ({
	Link: ({ children }: { children?: React.ReactNode }) => <a href="/">{children}</a>,
	useLocation: () => ({ pathname: '/~/app/files', search: '' }),
	useMatch: () => null,
	useNavigate: () => (to: string) => navigated.push(to)
}))

jest.unstable_mockModule('../context/index', () => ({
	activeContextAtom: atom(undefined),
	communitiesAtom: atom([]),
	isContextLeader: () => true,
	LEADER_ONLY_APPS: new Set<string>(),
	useContextAwareApi: () => CTX_API,
	useCtx: () => CTX,
	useCurrentContextIdTag: () => HOME
}))

jest.unstable_mockModule('../SearchResultRow', () => ({
	SearchResultRow: ({ hit }: { hit: { title?: string } }) => <span>{hit.title}</span>
}))

// Only the site built-in matters here; it is what `getPartAddressing` returns for a published container.
jest.unstable_mockModule('../manifest-registry', () => ({
	getPartAddressing: (contentType?: string) =>
		contentType === SITE_MIME ? { kind: 'sitePath' } : undefined
}))

jest.unstable_mockModule('../utils', () => ({
	useAppConfig: () => APP_CONFIG
}))

const { Omnibox, OmniboxIdle } = await import('../omnibox.js')
const { lastQueryAtom, pushRecentAtom, recentSearchesAtom, RECENT_LIMIT, toggleOmniboxAtom } =
	await import('../search.js')
const { useSearch } = await import('../search.js')

/**
 * Mirrors `layout.tsx`: the omnibox exists only while `query` is defined, so "the box
 * closed" is observable as the probe taking over — and the idle header carries the
 * mouse route back into the box.
 */
function Harness() {
	const [search] = useSearch()
	if (search.query == undefined) {
		return (
			<>
				<div data-testid="closed" />
				<OmniboxIdle />
			</>
		)
	}
	return <Omnibox />
}

/** The dropdown is portalled; the container has to exist before the render. */
function renderOmnibox(store: ReturnType<typeof createStore>) {
	const container = document.createElement('div')
	container.id = 'popper-container'
	document.body.appendChild(container)
	return render(
		<Provider store={store}>
			<Harness />
		</Provider>
	)
}

function input() {
	return screen.getByRole('combobox') as HTMLInputElement
}

function type(value: string) {
	fireEvent.change(input(), { target: { value } })
}

/** Let the debounce (and anything it starts) run to completion. */
async function settle(ms = 400) {
	await act(async () => {
		jest.advanceTimersByTime(ms)
	})
}

/** An open omnibox with an empty query, the way the search button opens it. */
function openEmpty() {
	const store = createStore()
	store.set(toggleOmniboxAtom) // last query is '' → opens empty, not pristine
	renderOmnibox(store)
	return store
}

let warnSpy: ReturnType<typeof jest.spyOn>
let errorSpy: ReturnType<typeof jest.spyOn>

beforeEach(() => {
	jest.useFakeTimers()
	navigated = []
	calls = []
	searchResponse = async () => ({ data: [], pagination: { total: 0 } })
	warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
	errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
	jest.useRealTimers()
	warnSpy.mockRestore()
	errorSpy.mockRestore()
	document.getElementById('popper-container')?.remove()
})

describe('one request per settled query', () => {
	it('sends the word, not its prefixes', async () => {
		openEmpty()

		for (const value of ['t', 'te', 'tex', 'text']) {
			type(value)
			await act(async () => {
				jest.advanceTimersByTime(100)
			})
		}
		await settle()

		expect(calls.map((c) => c.q)).toEqual(['text'])
	})

	it('cancels the request it has moved on from, without complaining about it', async () => {
		// Never answers on its own: only the abort can end it.
		searchResponse = () => new Promise(() => {})
		openEmpty()

		type('slowquery')
		await settle()
		expect(calls).toHaveLength(1)

		type('slowquery2')
		await settle()

		expect(calls).toHaveLength(2)
		expect(calls[0].signal?.aborted).toBe(true)
		expect(calls[1].signal?.aborted).toBe(false)
		// An abort is this component's own doing, not a failure to report.
		expect(warnSpy).not.toHaveBeenCalled()
	})

	it('answers a repeated query from the cache instead of the server', async () => {
		searchResponse = async () => ({
			data: [{ objTp: 'F', objId: 'f1', title: 'Cached hit', appId: 'quillo' }],
			pagination: { total: 1 }
		})
		openEmpty()

		type('memo')
		await settle()
		expect(calls).toHaveLength(1)

		// Typing on, then backspacing back to a query already answered.
		type('memory')
		await settle()
		expect(calls).toHaveLength(2)

		type('memo')
		await settle()

		expect(calls).toHaveLength(2)
		expect(screen.getByText('Cached hit')).toBeDefined()
	})

	it('re-asks once the cached answer is older than the TTL', async () => {
		openEmpty()

		type('stale')
		await settle()
		expect(calls).toHaveLength(1)

		// Retyping the same value fires no change event, so the query has to move
		// away and back for the cache to be consulted at all.
		type('other')
		await settle()
		expect(calls).toHaveLength(2)

		await act(async () => {
			jest.advanceTimersByTime(31_000)
		})

		type('stale')
		await settle()

		expect(calls).toHaveLength(3)
	})

	it('forgets everything when the box closes', async () => {
		const store = openEmpty()

		type('gone')
		await settle()
		expect(calls).toHaveLength(1)

		act(() => {
			store.set(toggleOmniboxAtom)
		})
		expect(screen.getByTestId('closed')).toBeDefined()
		act(() => {
			store.set(toggleOmniboxAtom)
		})

		type('gone2')
		await settle()
		expect(calls).toHaveLength(2)

		// With the previous cache still alive this would be a hit and stay at 2.
		type('gone')
		await settle()

		expect(calls).toHaveLength(3)
	})
})

describe('losing focus is not the same as being dismissed', () => {
	it('survives a window switch, and closes on a real focus move', async () => {
		const hasFocus = jest.spyOn(document, 'hasFocus').mockReturnValue(false)
		const outside = document.createElement('button')
		document.body.appendChild(outside)
		openEmpty()

		type('halfway')
		fireEvent.blur(input())
		expect(screen.queryByTestId('closed')).toBeNull()
		expect(input().value).toBe('halfway')

		hasFocus.mockReturnValue(true)
		fireEvent.blur(input(), { relatedTarget: outside })
		expect(screen.getByTestId('closed')).toBeDefined()

		hasFocus.mockRestore()
		outside.remove()
	})
})

describe('Ctrl+K recall', () => {
	it('reopens with the last query, selected, and asks the server nothing', async () => {
		const select = jest.spyOn(HTMLInputElement.prototype, 'select')
		const store = createStore()
		store.set(lastQueryAtom, 'previous search')

		store.set(toggleOmniboxAtom)
		expect(store.get(recentSearchesAtom)).toEqual([])
		renderOmnibox(store)

		expect(input().value).toBe('previous search')
		expect(select).toHaveBeenCalledTimes(1)

		await settle()
		// The user has already seen these results; re-fetching would cost a round trip.
		expect(calls).toEqual([])
		select.mockRestore()
	})

	it('recalls the same way from the header button as from the keyboard', () => {
		const select = jest.spyOn(HTMLInputElement.prototype, 'select')
		const store = createStore()
		store.set(lastQueryAtom, 'budget')
		renderOmnibox(store)

		fireEvent.click(screen.getByRole('button', { name: 'Search' }))

		// Mouse and keyboard are the same door: the magnifier recalls like Ctrl+K.
		expect(input().value).toBe('budget')
		expect(select).toHaveBeenCalledTimes(1)
		expect([input().selectionStart, input().selectionEnd]).toEqual([0, 6])
		select.mockRestore()
	})

	it('searches the recalled term on Enter', async () => {
		const store = createStore()
		store.set(lastQueryAtom, 'recalled')
		store.set(recentSearchesAtom, ['recalled', 'older'])
		store.set(toggleOmniboxAtom)
		renderOmnibox(store)

		fireEvent.keyDown(input(), { key: 'Enter' })

		expect(navigated).toEqual(['/~/search?q=recalled'])
	})
})

describe('recent searches', () => {
	it('records a committed search, not the keystrokes leading to it', async () => {
		const store = createStore()
		store.set(toggleOmniboxAtom)
		renderOmnibox(store)

		type('bud')
		await settle()
		type('budget')
		await settle()
		expect(store.get(recentSearchesAtom)).toEqual([])

		fireEvent.keyDown(input(), { key: 'Enter' })

		expect(store.get(recentSearchesAtom)).toEqual(['budget'])
	})

	it('records the query behind a hit that was opened', async () => {
		searchResponse = async () => ({
			data: [{ objTp: 'F', objId: 'f1', title: 'Q3 plan', appId: 'quillo' }],
			pagination: { total: 1 }
		})
		const store = createStore()
		store.set(toggleOmniboxAtom)
		renderOmnibox(store)

		type('plan')
		await settle()
		fireEvent.click(screen.getByText('Q3 plan'))

		expect(store.get(recentSearchesAtom)).toEqual(['plan'])
	})

	it('lists them in an empty box, and puts the chosen one back in it', async () => {
		const store = createStore()
		store.set(recentSearchesAtom, ['quarterly report'])
		store.set(toggleOmniboxAtom)
		renderOmnibox(store)

		fireEvent.click(screen.getByText('quarterly report'))

		// The "access *and edit* the last term" path, not a navigation.
		expect(navigated).toEqual([])
		expect(input().value).toBe('quarterly report')
	})

	it('drops one row, or all of them', async () => {
		const store = createStore()
		store.set(recentSearchesAtom, ['alpha', 'beta'])
		store.set(toggleOmniboxAtom)
		renderOmnibox(store)

		fireEvent.click(screen.getAllByLabelText('Remove from search history')[0])
		expect(store.get(recentSearchesAtom)).toEqual(['beta'])

		fireEvent.click(screen.getByText('Clear search history'))
		expect(store.get(recentSearchesAtom)).toEqual([])
	})
})

describe('the recents list itself', () => {
	it('dedupes case-insensitively, newest first, and stays capped', () => {
		const store = createStore()

		store.set(pushRecentAtom, 'Budget')
		store.set(pushRecentAtom, 'plan')
		store.set(pushRecentAtom, '  budget  ')
		expect(store.get(recentSearchesAtom)).toEqual(['budget', 'plan'])

		store.set(pushRecentAtom, '   ')
		expect(store.get(recentSearchesAtom)).toEqual(['budget', 'plan'])

		for (let i = 0; i < RECENT_LIMIT + 3; i++) store.set(pushRecentAtom, `q${i}`)
		expect(store.get(recentSearchesAtom)).toHaveLength(RECENT_LIMIT)
		expect(store.get(recentSearchesAtom)[0]).toBe(`q${RECENT_LIMIT + 2}`)
	})
})

describe('published site pages', () => {
	// The route uses the site-absolute `partId` the index wrote, not the container's file id.
	it('opens a site page hit at its published path', async () => {
		searchResponse = async () => ({
			data: [
				{
					objTp: 'F',
					objId: 'container1',
					title: 'Hello',
					contentType: SITE_MIME,
					partId: '/blog/hello'
				}
			],
			pagination: { total: 1 }
		})
		const store = createStore()
		store.set(toggleOmniboxAtom)
		renderOmnibox(store)

		type('hello')
		await settle()
		fireEvent.click(screen.getByText('Hello'))

		expect(navigated).toEqual(['/blog/hello'])
	})
})

// vim: ts=4
