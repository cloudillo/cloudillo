// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Which space `/:contextIdTag/search` searches, and what it renders while that is
 * still being decided.
 *
 * Opening a shared `/@community/search?q=…` link starts a `setActiveContext` round trip
 * (`CtxProvider`), and until it lands the context the URL names and the one the API
 * client is bound to disagree. No fetch is permitted in that window, so `isLoading` is
 * still false — without an explicit branch the page renders "No results found" before
 * the first request was ever allowed out.
 *
 * Not a router test: `react-router-dom` is mocked wholesale and `useCtx()` is stubbed,
 * so what is under test is the page's own gate — `contextResolving`, `foreignForGuest`
 * and `enabled` — and nothing of React Router's own matching.
 *
 * `.test.tsx` so jest gives this suite the jsdom environment (see jest.config.cjs).
 */

import { jest } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import * as React from 'react'

// Bare, the way idTags are stored — the `@` is presentation, prefixed at the point of
// render (`omnibox.tsx`, `SearchResultRow.tsx`).
const HOME = 'user.example.com'
const COMMUNITY = 'team.example.com'

interface Ctx {
	base: string
	idTag: string | undefined
	isHome: boolean
}

const communityCtx: Ctx = {
	base: `/@${COMMUNITY}`,
	idTag: COMMUNITY,
	isHome: false
}

// What the URL names, and what the API client is actually bound to. The gap between
// them is the window this suite is about.
let ctx: Ctx = communityCtx
let activeIdTag: string | undefined = COMMUNITY
let authState: { idTag: string } | null = { idTag: HOME }

jest.unstable_mockModule('@cloudillo/react', () => ({
	Button: ({ children, ...props }: { children?: React.ReactNode }) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
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
	useLocation: () => ({ pathname: '/~/search' }),
	useNavigate: () => () => {},
	useSearchParams: () => [new URLSearchParams('q=test'), () => {}]
}))

jest.unstable_mockModule('../context/index', () => ({
	useContextAwareApi: () => ({ api: {} }),
	useCtx: () => ctx,
	useCurrentContextIdTag: () => activeIdTag
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
	ctx = communityCtx
	activeIdTag = COMMUNITY
})

describe('SearchPage while the route context is still resolving', () => {
	it('renders the skeleton, not an empty result set', () => {
		// The URL names the community; the token round trip has not landed, so the
		// client is still bound to home.
		ctx = communityCtx
		activeIdTag = HOME

		render(<SearchPage />)

		expect(screen.getByTestId('skeleton')).toBeDefined()
		expect(screen.queryByTestId('empty')).toBeNull()
	})

	it('reports no results once the context has resolved', () => {
		ctx = communityCtx
		activeIdTag = COMMUNITY

		render(<SearchPage />)

		expect(screen.queryByTestId('skeleton')).toBeNull()
		expect(screen.getByTestId('empty').textContent).toBe('No results found')
	})
})

describe('SearchPage for a guest', () => {
	it('searches the home space addressed by its idTag', () => {
		// `/@user.example.com/search`. A guest never gets an `activeContext`, but the
		// node's own idTag is home either way, so this is not a foreign space and there
		// is nothing to wait for.
		authState = null
		ctx = { base: `/@${HOME}`, idTag: HOME, isHome: true }
		activeIdTag = HOME

		render(<SearchPage />)

		expect(screen.queryByTestId('skeleton')).toBeNull()
		expect(screen.getByTestId('empty').textContent).toBe('No results found')
	})

	it('refuses a foreign space', () => {
		authState = null
		ctx = communityCtx
		activeIdTag = HOME

		render(<SearchPage />)

		expect(screen.queryByTestId('skeleton')).toBeNull()
		expect(screen.getByTestId('empty').textContent).toBe(
			'Search is not available in this space'
		)
	})
})

// vim: ts=4
