// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Which space `/search/:contextIdTag` searches, and what it renders while that is
 * still being decided.
 *
 * Opening a shared `/search/<community>?q=…` link starts a `useContextFromRoute`
 * round trip, and until it lands the route's context segment and the resolved
 * `urlContext` disagree. No fetch is permitted in that window, so `isLoading` is
 * still false — without an explicit branch the page renders "No results found"
 * before the first request was ever allowed out.
 *
 * The comparison only works on canonicalised segments: `useUrlContextIdTag` collapses
 * the home tenant to `~`, so a raw `/search/<home idTag>` segment must go through
 * `useCanonicalContextSegment` first or it can never match and the wait never ends.
 * That hook is therefore the real one here — `../context/index` is mocked, but its
 * `useCanonicalContextSegment` re-exports the implementation.
 *
 * `.test.tsx` so jest gives this suite the jsdom environment (see jest.config.cjs).
 */

import { jest } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import { atom } from 'jotai'
import * as React from 'react'

// Bare, the way idTags are stored — the `@` is presentation, prefixed at the point of
// render (`omnibox.tsx`, `SearchResultRow.tsx`).
const HOME = 'user.example.com'
const COMMUNITY = 'team.example.com'

let urlContext: string | undefined = COMMUNITY
let routeParams: { contextIdTag?: string } = {}
let authState: { idTag: string } | null = { idTag: HOME }

// Real jotai atom, so the hook under test reads it as it does in the app. Only the
// module it lives in is stubbed, to keep the shell's atom graph out of the suite.
const apiAtom = atom({ idTag: HOME })

jest.unstable_mockModule('@cloudillo/react', () => ({
	apiAtom,
	EmptyState: ({ title }: { title: string }) => <div data-testid="empty">{title}</div>,
	LoadMoreTrigger: React.forwardRef(() => null),
	SkeletonList: () => <div data-testid="skeleton" />,
	Tab: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	Tabs: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	useAuth: () => [authState],
	useDebouncedValue: (value: string) => value,
	useInfiniteScroll: () => ({
		items: [],
		isLoading: false,
		isLoadingMore: false,
		error: null,
		hasMore: false,
		loadMore: () => {},
		reset: () => {},
		sentinelRef: { current: null }
	})
}))

jest.unstable_mockModule('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key })
}))

jest.unstable_mockModule('react-router-dom', () => ({
	Link: ({ children }: { children?: React.ReactNode }) => <a href="/">{children}</a>,
	useLocation: () => ({ pathname: '/search' }),
	useNavigate: () => () => {},
	useParams: () => routeParams,
	useSearchParams: () => [new URLSearchParams('q=test'), () => {}]
}))

// `use-context-from-route` imports both at module scope; neither is reached by
// `useCanonicalContextSegment`, and stubbing them keeps the rest of the context module
// graph (and the CSS it transitively pulls in) out of the suite.
jest.unstable_mockModule('../context/atoms', () => ({
	activeContextAtom: atom(undefined),
	contextSwitchingAtom: atom(false)
}))

jest.unstable_mockModule('../context/hooks', () => ({
	useApiContext: () => ({ setActiveContext: async () => {}, isLoading: false })
}))

jest.unstable_mockModule('../context/index', async () => ({
	HOME_CONTEXT: '~',
	useCanonicalContextSegment: (await import('../context/use-context-from-route.js'))
		.useCanonicalContextSegment,
	useContextAwareApi: () => ({ api: {} }),
	useCurrentContextIdTag: () => COMMUNITY,
	useUrlContextIdTag: () => urlContext
}))

jest.unstable_mockModule('../SearchResultRow', () => ({
	SearchResultRow: () => null
}))

jest.unstable_mockModule('../utils', () => ({
	useAppConfig: () => [undefined]
}))

const { SearchPage } = await import('../SearchPage.js')

beforeEach(() => {
	authState = { idTag: HOME }
	routeParams = {}
	urlContext = COMMUNITY
})

describe('SearchPage while the route context is still resolving', () => {
	it('renders the skeleton, not an empty result set', () => {
		routeParams = { contextIdTag: COMMUNITY }
		// `useContextFromRoute` has not landed yet: the resolved context is still home.
		urlContext = '~'

		render(<SearchPage />)

		expect(screen.getByTestId('skeleton')).toBeDefined()
		expect(screen.queryByTestId('empty')).toBeNull()
	})

	it('reports no results once the context has resolved', () => {
		routeParams = { contextIdTag: COMMUNITY }
		urlContext = COMMUNITY

		render(<SearchPage />)

		expect(screen.queryByTestId('skeleton')).toBeNull()
		expect(screen.getByTestId('empty').textContent).toBe('No results found')
	})
})

describe('SearchPage route context canonicalisation', () => {
	it('searches immediately when the route names the home tenant by its idTag', () => {
		// `/search/user.example.com`. `useUrlContextIdTag` only ever answers `~` for
		// home, so comparing the raw segment could never match and the page would wait
		// on a resolution that had already happened.
		routeParams = { contextIdTag: HOME }
		urlContext = '~'

		render(<SearchPage />)

		expect(screen.queryByTestId('skeleton')).toBeNull()
		expect(screen.getByTestId('empty').textContent).toBe('No results found')
	})

	it('ignores a segment that does not name a context', () => {
		// Nothing to wait for: `useContextFromRoute` would not treat it as a context
		// either, so the search runs against whatever is active.
		routeParams = { contextIdTag: 'feed' }
		urlContext = '~'

		render(<SearchPage />)

		expect(screen.queryByTestId('skeleton')).toBeNull()
		expect(screen.getByTestId('empty').textContent).toBe('No results found')
	})
})

describe('SearchPage for a guest', () => {
	it('searches the home space addressed by its idTag', () => {
		// A guest never gets an `activeContext`, so `urlContext` stays `~`; the server's
		// own idTag canonicalises to the same thing, so this is not a foreign space.
		authState = null
		routeParams = { contextIdTag: HOME }
		urlContext = '~'

		render(<SearchPage />)

		expect(screen.getByTestId('empty').textContent).toBe('No results found')
	})

	it('refuses a foreign space', () => {
		authState = null
		routeParams = { contextIdTag: COMMUNITY }
		urlContext = '~'

		render(<SearchPage />)

		expect(screen.queryByTestId('skeleton')).toBeNull()
		expect(screen.getByTestId('empty').textContent).toBe(
			'Search is not available in this space'
		)
	})
})

// vim: ts=4
