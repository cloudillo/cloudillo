// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The two guards `ShellRoutes` wraps its branches in.
 *
 * Unlike the rest of the shell's component suites, this one uses the **real**
 * `react-router-dom`: what is under test is how the guards behave once the router has
 * matched, so a mocked `useParams` would test nothing. Only `useAuth` and `NotFound` are
 * stubbed — the first is the input `RequireAuth` reads, the second is a whole page.
 *
 * `.test.tsx` so jest gives this suite the jsdom environment (see jest.config.cjs).
 */

import { jest } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import * as React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

let authState: { idTag: string } | null | undefined = { idTag: 'alice.example' }

jest.unstable_mockModule('@cloudillo/react', () => ({
	useAuth: () => [authState]
}))

jest.unstable_mockModule('../NotFound', () => ({
	NotFound: () => <div data-testid="not-found" />
}))

const { ContextGuard, RequireAuth } = await import('../route-guards.js')

function Inside() {
	return <div data-testid="inside" />
}

function LoginPage() {
	return <div data-testid="login" />
}

/** The shape of the real tree: `:contextIdTag` over a section, `/login` beside it. */
function renderAt(path: string, guard: React.ReactElement) {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<Routes>
				<Route path="/login" element={<LoginPage />} />
				<Route path=":contextIdTag" element={guard}>
					<Route index element={<Inside />} />
					<Route path="app/feed" element={<Inside />} />
				</Route>
			</Routes>
		</MemoryRouter>
	)
}

beforeEach(() => {
	authState = { idTag: 'alice.example' }
})

describe('ContextGuard', () => {
	it('renders the branch for a home context', () => {
		renderAt('/~/app/feed', <ContextGuard />)
		expect(screen.getByTestId('inside')).toBeDefined()
	})

	it('renders the branch for a community context', () => {
		renderAt('/@comm.tld/app/feed', <ContextGuard />)
		expect(screen.getByTestId('inside')).toBeDefined()
	})

	// The whole point of the sigil test: `:contextIdTag` matches any single segment, so
	// these reach the guard, and without it `ContextRoot` would navigate the user away.
	it.each(['/favicon.ico', '/sw-0.8.6.js'])('404s the sigil-less segment %s', (path) => {
		renderAt(path, <ContextGuard />)
		expect(screen.getByTestId('not-found')).toBeDefined()
		expect(screen.queryByTestId('inside')).toBeNull()
	})

	// The regression this guard's `fallback` exists for. `:contextIdTag` is a dynamic
	// segment and React Router ranks those above the terminal splat whatever the
	// declaration order, so a published page's path lands *here* and never on the site
	// route — which cost `SitePage` its mount entirely: no adoption, no link
	// interception, no islands, and a 404 rendered under the server's own article.
	it.each(['/main-page', '/blog/hello'])('hands %s to the fallback when there is one', (path) => {
		render(
			<MemoryRouter initialEntries={[path]}>
				<Routes>
					<Route
						path=":contextIdTag"
						element={<ContextGuard fallback={<div data-testid="site" />} />}
					>
						<Route index element={<Inside />} />
						<Route path="*" element={<Inside />} />
					</Route>
				</Routes>
			</MemoryRouter>
		)
		expect(screen.getByTestId('site')).toBeDefined()
		expect(screen.queryByTestId('not-found')).toBeNull()
		expect(screen.queryByTestId('inside')).toBeNull()
	})

	// A real context is still the context subtree's, fallback or not — otherwise the
	// site page would shadow every `/@idTag/…` route on a site document.
	it('prefers the branch over the fallback for a real context', () => {
		renderAt('/@comm.tld/app/feed', <ContextGuard fallback={<div data-testid="site" />} />)
		expect(screen.getByTestId('inside')).toBeDefined()
		expect(screen.queryByTestId('site')).toBeNull()
	})

	// `/login` is declared before the context subtree in the real tree and so never
	// reaches the guard; if it ever did, it is a 404 and not a context.
	it('404s /login if it ever gets here', () => {
		render(
			<MemoryRouter initialEntries={['/login']}>
				<Routes>
					<Route path=":contextIdTag" element={<ContextGuard />}>
						<Route index element={<Inside />} />
					</Route>
				</Routes>
			</MemoryRouter>
		)
		expect(screen.getByTestId('not-found')).toBeDefined()
	})
})

describe('RequireAuth', () => {
	// `undefined` is "still booting", not "logged out" — the inline #initial-splash
	// covers exactly this render, and a redirect here would bounce a returning user.
	it('renders nothing while auth is still booting', () => {
		authState = undefined
		const { container } = renderAt('/~/app/feed', <RequireAuth />)
		expect(screen.queryByTestId('inside')).toBeNull()
		expect(screen.queryByTestId('login')).toBeNull()
		expect(container.textContent).toBe('')
	})

	it('redirects a logged-out visitor to /login', () => {
		authState = null
		renderAt('/~/app/feed', <RequireAuth />)
		expect(screen.getByTestId('login')).toBeDefined()
	})

	it('renders the branch for a signed-in user', () => {
		renderAt('/~/app/feed', <RequireAuth />)
		expect(screen.getByTestId('inside')).toBeDefined()
	})
})

// vim: ts=4
