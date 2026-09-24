// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The omnibox dropdown: which rows a given input produces, which of them the
 * keyboard may land on, and what Enter does in each mode.
 *
 * Real timers and the real `useDebouncedValue`: fake timers interleave badly with
 * downshift's own scheduling, so the waits below are sized for the debounce plus the
 * spinner delay. Request hygiene (one call per settled query, cancellation, the
 * cache) is exercised under fake timers in `omnibox-search.test.tsx`.
 *
 * `.test.tsx` so jest gives this suite the jsdom environment (see jest.config.cjs).
 */

import { jest } from '@jest/globals'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { atom, Provider } from 'jotai'
import * as React from 'react'

const HOME = 'user.example.com'

let navigated: string[] = []
let profileResults: Array<{ idTag: string; name?: string }> = []
let searchResponse: () => Promise<unknown> = async () => ({ data: [], pagination: { total: 0 } })
let authState: { idTag: string; roles?: string[] } | null = { idTag: HOME }

// Every hook return below is a module-level constant, never a fresh literal per
// call. The omnibox memoises its fetchers on `api`/`ctxApi` and its row list on
// `appConfig`; a new object each render re-arms those effects and it never settles.
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
const API = { api: { profiles: { list: async () => profileResults } } }
const CTX_API = { api: { search: { queryPaginated: () => searchResponse() } } }

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
	useAuth: () => [authState],
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
	contextIdpEnabledAtom: atom<Record<string, boolean | 'unknown'>>({}),
	contextToolAllowed: () => true,
	isContextLeader: () => true,
	LEADER_ONLY_APPS: new Set<string>(),
	useContextAwareApi: () => CTX_API,
	useCtx: () => CTX,
	useCurrentContextIdTag: () => HOME
}))

// The real row pulls in `parseServerSnippet` and the whole file-icon registry; the
// title is all this suite reads off it.
jest.unstable_mockModule('../SearchResultRow', () => ({
	SearchResultRow: ({ hit }: { hit: { title?: string } }) => <span>{hit.title}</span>
}))

jest.unstable_mockModule('../utils', () => ({
	useAppConfig: () => APP_CONFIG
}))

const { Omnibox } = await import('../omnibox.js')

/** The dropdown is portalled; the container has to exist before the render. */
function renderOmnibox() {
	const container = document.createElement('div')
	container.id = 'popper-container'
	document.body.appendChild(container)
	// A fresh jotai store per test, so the `useSearch` atom does not carry the previous
	// test's query over.
	return render(
		<Provider>
			<Omnibox />
		</Provider>
	)
}

function input() {
	return screen.getByRole('combobox') as HTMLInputElement
}

function type(value: string) {
	fireEvent.change(input(), { target: { value } })
}

/** Console noise only — downshift warns about props it does not recognise. */
let warnSpy: ReturnType<typeof jest.spyOn>

beforeEach(() => {
	navigated = []
	profileResults = []
	authState = { idTag: HOME }
	searchResponse = async () => ({ data: [], pagination: { total: 0 } })
	warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
	warnSpy.mockRestore()
	document.getElementById('popper-container')?.remove()
})

describe('the status rows are not results', () => {
	it('keeps the keyboard cursor off "Searching…" and never asks downshift to disable it', async () => {
		// Never settles: the dropdown stays in its in-flight state for the test.
		searchResponse = () => new Promise(() => {})
		renderOmnibox()

		type('hello')

		// Debounce, then the spinner's own delay before the row may appear.
		await screen.findByText('Searching...', {}, { timeout: 3000 })

		fireEvent.keyDown(input(), { key: 'ArrowDown' })

		expect(document.querySelector('.c-nav-item.selected')).toBeNull()
		expect(input().getAttribute('aria-activedescendant')).toBeFalsy()

		// With no row highlighted, Enter means "search for what I typed".
		fireEvent.keyDown(input(), { key: 'Enter' })
		expect(navigated).toEqual(['/~/search?q=hello'])
	})

	it('keeps the cursor off "No results found" too', async () => {
		renderOmnibox()

		type('hello')

		await screen.findByText('No results found')
		fireEvent.keyDown(input(), { key: 'ArrowDown' })

		expect(document.querySelector('.c-nav-item.selected')).toBeNull()
	})
})

describe('the menu element and aria-expanded agree', () => {
	it('claims no expansion with an empty input, but still paints the legend', () => {
		renderOmnibox()

		// No rows means nothing to expand *to* — but the legend is the only place the
		// sigils are documented, so a cold start has to see it.
		expect(input().getAttribute('aria-expanded')).toBe('false')
		const legend = screen.getByText('cl:').closest('li')!
		expect(legend.className).toContain('c-omnibox-legend')
		expect(legend.closest('ul')).toHaveProperty('style.display', '')
	})

	it('hides the element outright once there is neither a row nor a legend', () => {
		renderOmnibox()

		// Search mode drops the legend and the first moments of a request hold the
		// spinner row back, so there is nothing to paint.
		type('hello')

		expect(screen.queryByText('cl:')).toBeNull()
		expect(screen.getByRole('listbox', { hidden: true })).toHaveProperty(
			'style.display',
			'none'
		)
		expect(input().getAttribute('aria-expanded')).toBe('false')
	})

	it('is expanded once there are rows', async () => {
		searchResponse = async () => ({
			data: [{ objTp: 'F', objId: 'f1', title: 'Budget', appId: 'quillo' }],
			pagination: { total: 1 }
		})
		renderOmnibox()

		type('budget')

		await screen.findByText('Budget')
		expect(input().getAttribute('aria-expanded')).toBe('true')
	})
})

describe('mode transitions', () => {
	it('lists the menu in command mode', async () => {
		renderOmnibox()

		type('/fi')

		await screen.findByText('Files')
		expect(screen.queryByText('Feed')).toBeNull()
	})

	it('recomputes the mode from the incoming keystroke, not the previous render', async () => {
		renderOmnibox()

		// Command mode highlights its first row by default…
		type('/fi')
		await screen.findByText('Files')
		expect(document.querySelector('.c-nav-item.selected')).not.toBeNull()

		// …and one keystroke replacing the whole value crosses into full-text. Read
		// from the closure, `mode` would still say 'command' and downshift's default
		// would keep index 0 highlighted, swallowing Enter.
		type('files')
		await screen.findByText('No results found')
		expect(document.querySelector('.c-nav-item.selected')).toBeNull()

		fireEvent.keyDown(input(), { key: 'Enter' })
		expect(navigated).toEqual(['/~/search?q=files'])
	})

	it('jumps to the typed idTag in profile mode when no row is highlighted', async () => {
		profileResults = [{ idTag: 'bob.example.com', name: 'Bob' }]
		renderOmnibox()

		type('@bob')

		await waitFor(() => expect(screen.getByText('Bob')).toBeDefined())
		fireEvent.keyDown(input(), { key: 'Enter' })

		expect(navigated).toEqual(['/~/profile/bob'])
	})

	it('opens the profile that was arrowed to', async () => {
		profileResults = [{ idTag: 'bob.example.com', name: 'Bob' }]
		renderOmnibox()

		type('@bob')

		await waitFor(() => expect(screen.getByText('Bob')).toBeDefined())
		fireEvent.keyDown(input(), { key: 'ArrowDown' })
		fireEvent.keyDown(input(), { key: 'Enter' })

		expect(navigated).toEqual(['/~/profile/bob.example.com'])
	})
})

// vim: ts=4
