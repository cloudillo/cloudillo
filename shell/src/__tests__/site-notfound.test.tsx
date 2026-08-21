// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Which 404 a top-level unknown path gets.
 *
 * `SitePage` mounts on every one of them — `layout.tsx`'s `ContextGuard` fallback and
 * its terminal `*` route, both deliberately ungated on `isSiteDocument` (see the site
 * note above `ShellRoutes`). So on a plain shell node with no site configured, a typo
 * used to render *"This address is not part of this site"* with a link to a start page
 * that does not exist, and `shell/src/NotFound.tsx` became unreachable.
 *
 * Not folded into `route-guards.test.tsx`: that suite exists precisely to mount the
 * guards without dragging the site runtime in.
 *
 * The site runtime around the decision is mocked away — what is under test is one
 * branch. `nodeHasSite` is a function rather than a constant for exactly this: the
 * facts behind it are captured at module load, so a suite has no other way to ask the
 * question twice.
 */

import { jest } from '@jest/globals'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getDefaultStore } from 'jotai'
import * as React from 'react'
import { MemoryRouter, useNavigate } from 'react-router-dom'

/** Whether the node under test serves a site — the whole input to the branch. */
let mockHasSite = false
/** What the fragment fetch answers. `missing` is the 404 both branches come from. */
let mockFragment: { status: string; html?: string } = { status: 'missing' }

const enableManualScrollRestoration = jest.fn()
const loadSiteFragment = jest.fn(async () => mockFragment)

// One stable object, not a fresh one per call: `t` is a dependency of the fetch
// effect, so a new identity every render re-enters it — and the second entry starts a
// second fetch for the same path while the first is still in flight.
const translation = { t: (key: string) => key }

jest.unstable_mockModule('react-i18next', () => ({
	useTranslation: () => translation
}))

jest.unstable_mockModule('../site/detect.js', () => ({
	SITE_CONTENT_ID: 'cl-site-content',
	SITE_CHROME_ID: 'cl-site-chrome',
	SITE_PREBOOT_CLASS: 'cl-site-preboot',
	nodeHasSite: () => mockHasSite,
	// Read by `links.ts` for `/` alone; every path this suite asks about is a
	// top-level one, so only the declared value matters, not which one it is.
	isSiteDocument: false,
	// What `siteContextAtom` in `state.js` starts at — no seed on a shell document.
	siteSeed: null
}))

const clearPageMeta = jest.fn()

jest.unstable_mockModule('../site/fragment.js', () => ({
	loadSiteFragment,
	applyPageMeta: () => {},
	cacheAdoptedFragment: () => {},
	clearPageMeta,
	hasSiteFragment: () => false
}))

jest.unstable_mockModule('../site/islands.js', () => ({
	scanIslands: () => []
}))

// The real `isClientRoutablePath`: it is what decides whether a fetch goes out at
// all, so a stub here would leave that decision untested. Only the click
// interception is mocked away.
const actualLinks = await import('../site/links.js')

jest.unstable_mockModule('../site/links.js', () => ({
	...actualLinks,
	siteLinkTarget: () => null
}))

jest.unstable_mockModule('../site/scroll.js', () => ({
	enableManualScrollRestoration,
	restoreBrowserScrollRestoration: () => {},
	restoreScrollOffset: () => false,
	saveScrollOffset: () => {}
}))

jest.unstable_mockModule('../site/SiteBar.js', () => ({
	SiteBar: () => null
}))

jest.unstable_mockModule('../site/SiteIsland.js', () => ({
	prepareIslandContainers: () => {},
	SiteIsland: () => null
}))

jest.unstable_mockModule('../site/SiteNotFound.js', () => ({
	SiteNotFound: () => <div data-testid="site-not-found" />
}))

jest.unstable_mockModule('../NotFound.js', () => ({
	NotFound: () => <div data-testid="shell-not-found" />
}))

const { SitePage } = await import('../site/SitePage.js')
const { siteRouteActiveAtom } = await import('../site/state.js')

/** The atom's value in the default store, which is the one an unwrapped render uses. */
function siteRouteActive(): boolean {
	return getDefaultStore().get(siteRouteActiveAtom)
}

/** Client-side navigation, which is the only way a second fetch happens. */
function NavButton({ to }: { to: string }) {
	const navigate = useNavigate()
	return <button type="button" data-testid="nav" onClick={() => navigate(to)} />
}

function mountSitePage(path = '/some-typo') {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<SitePage />
		</MemoryRouter>
	)
}

beforeEach(() => {
	enableManualScrollRestoration.mockClear()
	loadSiteFragment.mockClear()
	clearPageMeta.mockClear()
	getDefaultStore().set(siteRouteActiveAtom, false)
	mockFragment = { status: 'missing' }
})

describe('SitePage — the 404 on a node with no site', () => {
	beforeEach(() => {
		mockHasSite = false
	})

	it("should render the shell's own NotFound", async () => {
		mountSitePage()

		await waitFor(() => {
			expect(screen.getByTestId('shell-not-found')).toBeDefined()
		})
		expect(screen.queryByTestId('site-not-found')).toBeNull()
	})

	it('should leave history.scrollRestoration alone', async () => {
		// It is a session-wide flip, and a shell 404 has no site content to place.
		mountSitePage()

		await waitFor(() => {
			expect(screen.getByTestId('shell-not-found')).toBeDefined()
		})
		expect(enableManualScrollRestoration).not.toHaveBeenCalled()
	})

	it('should not claim the site route', async () => {
		// The atom is "is a published page on screen *right now*", and `GuestOwnerBanner`
		// returns null on it. Raised at mount unconditionally, a plain shell 404 hid the
		// banner for every guest on every node, site or not.
		const view = mountSitePage()

		await waitFor(() => {
			expect(screen.getByTestId('shell-not-found')).toBeDefined()
		})
		expect(siteRouteActive()).toBe(false)

		view.unmount()
		expect(siteRouteActive()).toBe(false)
	})

	it('should not restore document metadata it never replaced', async () => {
		// A non-routable path answers from memory: no fetch, and nothing written to
		// `<title>`, description or canonical. "Restoring" there overwrites whatever
		// the shell legitimately had on the document.
		const view = mountSitePage('/sw.js')

		await waitFor(() => {
			expect(screen.getByTestId('shell-not-found')).toBeDefined()
		})
		view.unmount()

		expect(clearPageMeta).not.toHaveBeenCalled()
	})

	it('should still look for the page before answering', async () => {
		// `nodeHasSite()` is read from markup only the site wrapper emits, so it is
		// false on every *shell* document — including one served by a node that does
		// host a site. It picks the 404's flavour and nothing else; skipping the
		// fetch on it 404'd every link from a shell route into a page that exists.
		mountSitePage()

		await waitFor(() => {
			expect(screen.getByTestId('shell-not-found')).toBeDefined()
		})
		expect(loadSiteFragment).toHaveBeenCalledWith('/some-typo')
	})

	// Two paths, not the whole table: reaching `isClientRoutablePath` (`site/links.ts`)
	// through a render with eight mocked modules is an expensive way to exercise a
	// predicate, and what this suite owns is that `SitePage` consults it before going
	// to the network. Enumerating the non-routable shapes belongs in a direct unit
	// test of `isClientRoutablePath`.
	it.each(['/sw.js', '/feed.xml'])(
		'should answer for %p without asking the network',
		async (path) => {
			// Not a client route at all, so no fragment can exist and the round trip —
			// with a blank host for its duration — buys nothing.
			mountSitePage(path)

			await waitFor(() => {
				expect(screen.getByTestId('shell-not-found')).toBeDefined()
			})
			expect(loadSiteFragment).not.toHaveBeenCalled()
		}
	)
})

describe('SitePage — the 404 on a node that serves a site', () => {
	beforeEach(() => {
		mockHasSite = true
	})

	it("should render the site's own NotFound", async () => {
		mountSitePage()

		await waitFor(() => {
			expect(screen.getByTestId('site-not-found')).toBeDefined()
		})
		expect(screen.queryByTestId('shell-not-found')).toBeNull()
	})

	it('should enable manual scroll restoration once a page is actually served', async () => {
		mockFragment = { status: 'ok', html: '<p>Hello</p>' }
		mountSitePage()

		await waitFor(() => {
			expect(enableManualScrollRestoration).toHaveBeenCalled()
		})
		expect(screen.queryByTestId('site-not-found')).toBeNull()
	})

	it('should replace the 404 with the spinner on the next navigation', async () => {
		// A 404 leaves the host empty but remembers its path, so neither the notice
		// nor the spinner used to notice the next click: the old 404 sat there until
		// the new fetch resolved.
		const view = render(
			<MemoryRouter initialEntries={['/some-typo']}>
				<SitePage />
				<NavButton to="/blog/hello" />
			</MemoryRouter>
		)

		await waitFor(() => {
			expect(screen.getByTestId('site-not-found')).toBeDefined()
		})

		// Never resolves: what is under test is the frame between the click and the
		// answer.
		loadSiteFragment.mockImplementationOnce(() => new Promise(() => {}))
		fireEvent.click(screen.getByTestId('nav'))

		await waitFor(() => {
			expect(view.container.querySelector('.c-loading-spinner')).not.toBeNull()
		})
		expect(screen.queryByTestId('site-not-found')).toBeNull()
	})

	it('should claim the site route once a page is actually served', async () => {
		// The converse of the shell-404 case: the flag rides the same condition the
		// scroll flip does — there is real site content on screen.
		mockFragment = { status: 'ok', html: '<p>Hello</p>' }
		const view = mountSitePage()

		await waitFor(() => {
			expect(siteRouteActive()).toBe(true)
		})

		view.unmount()
		expect(siteRouteActive()).toBe(false)
	})
})
