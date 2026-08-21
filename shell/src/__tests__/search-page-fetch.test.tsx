// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `/search`'s data layer: what it puts on the wire, what it refuses to put on the
 * wire, and what it shows while a page is in flight.
 *
 * The sibling suite (`search-page-context.test.tsx`) stubs `useInfiniteScroll` with a
 * frozen empty result to isolate the context-resolution chain; this one uses the
 * **real** hook and the real debounce over a mocked api client, so the fetch path
 * itself is exercised — the count's epoch guard, the offset ceiling, the "match
 * nothing" filter and the 401 mapping.
 *
 * `EmptyState` and `SkeletonList` record every commit they appear in, not just their
 * final state: a one-paint "No results found" before the first request is scheduled
 * is invisible to a `screen` query, since the initial-load effect has already flipped
 * `isLoading` by the time `render()` returns.
 *
 * `.test.tsx` so jest gives this suite the jsdom environment (see jest.config.cjs).
 */

import { jest } from '@jest/globals'
import { act, render, screen } from '@testing-library/react'
import * as React from 'react'

// `useInfiniteScroll` observes its sentinel; jsdom has no IntersectionObserver.
// The sentinel never intersects here — pagination is driven explicitly below.
class NoopObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
Object.assign(globalThis, { IntersectionObserver: NoopObserver })

const HOME = 'user.example.com'

interface SearchCall {
	q?: string
	type?: string
	limit?: number
	offset?: number
}

let calls: SearchCall[] = []
let respond: (call: SearchCall) => Promise<unknown> = async () => ({
	data: [],
	pagination: { total: 0 }
})
let authState: { idTag: string } | null = { idTag: HOME }
let searchParams = new URLSearchParams('q=test')
/** Which branch of the render tree each commit took, in order. */
let branches: string[] = []
/** `loadMore` as of the last commit — the mocked trigger never intersects. */
let loadMore: () => void = () => {}

const API = {
	api: {
		search: {
			queryPaginated: (call: SearchCall) => {
				calls.push(call)
				return respond(call)
			}
		}
	}
}

jest.unstable_mockModule('react-i18next', () => ({
	useTranslation: () => ({
		// Keys are the English strings; only `count` needs interpolating here.
		t: (key: string, opts?: { count?: number }) =>
			opts?.count === undefined ? key : key.replace('{{count}}', String(opts.count))
	})
}))

jest.unstable_mockModule('react-router-dom', () => ({
	Link: ({ children }: { children?: React.ReactNode }) => <a href="/">{children}</a>,
	useLocation: () => ({ pathname: '/search', search: '' }),
	useNavigate: () => () => {},
	useParams: () => ({}),
	useSearchParams: () => [searchParams, () => {}]
}))

jest.unstable_mockModule('../context/index', () => ({
	useContextAwareApi: () => API,
	useCtx: () => ({ base: '/~', idTag: HOME, isHome: true }),
	useCurrentContextIdTag: () => HOME
}))

jest.unstable_mockModule('../SearchResultRow', () => ({
	SearchResultRow: () => null
}))

// Mocked: irrelevant here — these tests cover fetching/pagination, not hit routing.
jest.unstable_mockModule('../manifest-registry', () => ({
	getPartAddressing: () => undefined
}))

jest.unstable_mockModule('../utils', () => ({
	useAppConfig: () => [undefined]
}))

// The real hooks, taken from source: `@cloudillo/react`'s barrel is mocked below,
// and a factory cannot import the specifier it stands in for.
const { useInfiniteScroll } = await import('../../../libs/react/src/hooks.js')
const { useDebouncedValue } = await import('../../../libs/react/src/components/hooks.js')

jest.unstable_mockModule('@cloudillo/react', () => ({
	Button: ({ children, ...props }: { children?: React.ReactNode }) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
	EmptyState: ({ title }: { title: string }) => {
		branches.push(`empty:${title}`)
		return <div data-testid="empty">{title}</div>
	},
	// Not a real trigger: it publishes `loadMore` so pagination can be stepped
	// without an IntersectionObserver.
	LoadMoreTrigger: React.forwardRef((props: { onRetry?: () => void }, _ref: unknown) => {
		loadMore = props.onRetry ?? (() => {})
		return null
	}),
	SkeletonList: () => {
		branches.push('skeleton')
		return <div data-testid="skeleton" />
	},
	Tab: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	Tabs: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	useAuth: () => [authState],
	useDebouncedValue,
	useInfiniteScroll
}))

const { SearchPage } = await import('../SearchPage.js')

/** A promise plus the handle to settle it from the test body. */
function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (err: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

function hits(count: number, from = 0) {
	return Array.from({ length: count }, (_, i) => ({
		objTp: 'F',
		objId: `f${from + i}`,
		title: `Hit ${from + i}`
	}))
}

beforeEach(() => {
	calls = []
	branches = []
	authState = { idTag: HOME }
	searchParams = new URLSearchParams('q=test')
	respond = async () => ({ data: [], pagination: { total: 0 } })
})

describe('the wait before the first page', () => {
	it('never paints "No results found" before the request is scheduled', async () => {
		const first = deferred<unknown>()
		respond = () => first.promise

		render(<SearchPage />)

		// Absent in every commit so far, not merely now. `isPending` covers the one
		// render between the hook's synchronous deps reset and its initial-load effect.
		expect(branches.filter((b) => b.startsWith('empty:'))).toEqual([])
		expect(branches).toContain('skeleton')

		await act(async () => {
			first.resolve({ data: [], pagination: { total: 0 } })
		})

		expect(screen.getByTestId('empty').textContent).toBe('No results found')
	})
})

describe('the result count', () => {
	it('does not let a stale first page write its total', async () => {
		const stale = deferred<unknown>()
		respond = () => stale.promise

		const { rerender } = render(<SearchPage />)
		expect(calls).toHaveLength(1)

		// The query moves on while the first request is still out.
		const fresh = deferred<unknown>()
		respond = () => fresh.promise
		searchParams = new URLSearchParams('q=other')
		rerender(<SearchPage />)

		await act(async () => {
			stale.resolve({ data: hits(1), pagination: { total: 99 } })
		})
		await act(async () => {
			fresh.resolve({ data: hits(3), pagination: { total: 3 } })
		})

		expect(screen.getByText('3 results')).toBeDefined()
		expect(screen.queryByText('99 results')).toBeNull()
	})
})

describe('the offset ceiling', () => {
	it('stops paginating rather than asking for an offset the server rejects', async () => {
		// FTS_MAX_OFFSET is 1000: the first page lands the cursor exactly on it, the
		// next would step past, so there must be no third request.
		respond = async (call) =>
			call.offset === 0
				? { data: hits(1000), pagination: { total: 5000 } }
				: { data: hits(20, 1000), pagination: { total: 5000 } }

		render(<SearchPage />)
		await act(async () => {})
		expect(calls).toHaveLength(1)

		await act(async () => loadMore())
		expect(calls.map((c) => c.offset)).toEqual([0, 1000])

		await act(async () => loadMore())
		expect(calls).toHaveLength(2)
	})
})

describe('a filter that names nothing the caller may see', () => {
	it('matches nothing rather than falling back to everything', async () => {
		// A guest may not search profiles, so `?type=profile` selects no type at all —
		// which is "no results", not "the whole guest set".
		authState = null
		searchParams = new URLSearchParams('q=test&type=profile')

		render(<SearchPage />)
		await act(async () => {})

		expect(calls).toEqual([])
		expect(screen.getByTestId('empty').textContent).toBe('No results found')
	})

	it('sends the guest type list for an unfiltered guest search', async () => {
		authState = null

		render(<SearchPage />)
		await act(async () => {})

		expect(calls[0]?.type).toBe('file,doc,action')
	})
})

describe('a space the caller has not been trusted with', () => {
	it('reads a 401 as "nothing to show here", not as a failure', async () => {
		respond = async () => {
			throw Object.assign(new Error('Unauthorized'), { httpStatus: 401 })
		}

		render(<SearchPage />)
		await act(async () => {})

		expect(screen.getByTestId('empty').textContent).toBe(
			'Search is not available in this space'
		)
	})
})

// vim: ts=4
