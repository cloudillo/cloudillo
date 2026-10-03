// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * A site page reached from a *shell* document.
 *
 * `isSiteDocument` and `siteSeed` are read off markup only the site wrapper emits
 * (`#cl-site-content`, the `application/cloudillo-site+json` seed); `shell/index.html`
 * carries neither. So on any shell document — including one served by a node that
 * does host a site — `nodeHasSite()` is false, and gating the fragment fetch on it
 * meant a `<Link>` into a published page never issued a request and fell straight
 * through to the shell's 404. Search hits are exactly such links
 * (`shell/src/search-target.ts`).
 *
 * The document here has neither marker, which is the whole point: what is asserted is
 * that the page is still *looked for*. `site/fragment.ts` and `site/links.ts` are the
 * real modules, so the URL and the routability test under test are the real ones.
 */

import { SITE_PAGE_META_TYPE } from '@cloudillo/core'
import { jest } from '@jest/globals'
import { act, render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import { MemoryRouter, type NavigateFunction, useNavigate } from 'react-router-dom'

// The metadata script is what tells a published fragment apart from the shell's own
// `index.html`, which is what an SPA fallback answers a `.part.html` miss with — see
// `loadSiteFragment`. Every producer in `publish/render/index.ts` emits one.
const META = `<script type="${SITE_PAGE_META_TYPE}">{"title":"Hello","archetype":"page"}</script>`
const FRAGMENT = `${META}<p data-testid="published-body">Hello</p>`

jest.unstable_mockModule('react-i18next', () => ({
	Trans: () => null,
	useTranslation: () => ({ t: (key: string) => key })
}))

jest.unstable_mockModule('../site/islands.js', () => ({
	scanIslands: () => []
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

const fetchMock = jest.fn<typeof fetch>()

function htmlResponse(body: string): Response {
	return {
		ok: true,
		redirected: false,
		url: `${window.location.origin}/blog/hello.part.html`,
		headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
		text: async () => body
	} as unknown as Response
}

beforeEach(() => {
	fetchMock.mockReset()
	globalThis.fetch = fetchMock as unknown as typeof fetch
	// The root case below puts a served node in the document; nothing else here may
	// find it still there.
	document.getElementById('cl-site-content')?.remove()
})

describe('SitePage — a page path on a shell document', () => {
	it('should fetch the fragment and adopt it rather than 404', async () => {
		// Nothing in the document says "this is a site page": no `#cl-site-content`,
		// no boot seed. That used to be enough to answer 404 from memory.
		expect(document.getElementById('cl-site-content')).toBeNull()
		fetchMock.mockResolvedValue(htmlResponse(FRAGMENT))

		render(
			<MemoryRouter initialEntries={['/blog/hello']}>
				<SitePage />
			</MemoryRouter>
		)

		await waitFor(() => {
			expect(screen.getByTestId('published-body')).toBeDefined()
		})
		// The verbatim endpoint, composed by the real `siteFragmentUrl`.
		expect(fetchMock).toHaveBeenCalledWith('/blog/hello.part.html', {
			credentials: 'omit'
		})
		expect(screen.queryByTestId('shell-not-found')).toBeNull()
		expect(screen.queryByTestId('site-not-found')).toBeNull()
	})

	it('should hand scroll restoration back to the browser on unmount', async () => {
		// Only `SitePage` keeps offsets by hand. Leaving `'manual'` set after it is
		// gone cost every shell route its scroll position for the rest of the session.
		fetchMock.mockResolvedValue(htmlResponse(FRAGMENT))
		// jsdom's `History` has no `scrollRestoration` at all, which is what the
		// feature test in `scroll.ts` is there for. Give it one to have anything to
		// assert about.
		Object.defineProperty(window.history, 'scrollRestoration', {
			value: 'auto',
			writable: true,
			configurable: true
		})
		const before = window.history.scrollRestoration

		const view = render(
			<MemoryRouter initialEntries={['/blog/hello']}>
				<SitePage />
			</MemoryRouter>
		)
		await waitFor(() => {
			expect(screen.getByTestId('published-body')).toBeDefined()
		})
		expect(window.history.scrollRestoration).toBe('manual')

		view.unmount()
		expect(window.history.scrollRestoration).toBe(before)
	})

	it('should refuse a 200 that is the shell document rather than a fragment', async () => {
		// What an SPA fallback answers a `.part.html` miss with: `res.ok`, `text/html`,
		// and no metadata script. Rendering it would put the shell's own splash and
		// `#app` into the article.
		fetchMock.mockResolvedValue(
			htmlResponse('<!doctype html><html><body><div id="app"></div></body></html>')
		)

		const { container } = render(
			<MemoryRouter initialEntries={['/blog/spa-fallback']}>
				<SitePage />
			</MemoryRouter>
		)

		await waitFor(() => {
			expect(screen.getByTestId('shell-not-found')).toBeDefined()
		})
		expect(container.querySelector('#app')).toBeNull()
		expect(container.querySelector('.c-site-content-host')?.innerHTML).toBe('')
	})

	it('should render the site root again when history comes back to it', async () => {
		// `detect.js` is the real one here and captured `isSiteDocument = false` at
		// import — `#cl-site-content` is appended below, inside the test — so
		// `isClientRoutablePath` refuses `/` the way it does on a shell document. The
		// cold load still cached its own bytes, and that is what a Back press reads.
		const served = document.createElement('div')
		served.id = 'cl-site-content'
		served.innerHTML = '<p data-testid="root-body">Front page</p>'
		document.body.appendChild(served)
		fetchMock.mockResolvedValue(htmlResponse(FRAGMENT))

		let navigate: NavigateFunction = () => {}
		function CaptureNavigate() {
			navigate = useNavigate()
			return null
		}

		render(
			<MemoryRouter initialEntries={['/']}>
				<CaptureNavigate />
				<SitePage />
			</MemoryRouter>
		)
		expect(screen.getByTestId('root-body')).toBeDefined()

		await act(async () => {
			navigate('/blog')
		})
		await waitFor(() => {
			expect(screen.getByTestId('published-body')).toBeDefined()
		})

		await act(async () => {
			navigate(-1)
		})
		await waitFor(() => {
			expect(screen.getByTestId('root-body')).toBeDefined()
		})
		expect(screen.queryByTestId('shell-not-found')).toBeNull()
		expect(screen.queryByTestId('site-not-found')).toBeNull()
		// Served from memory: the root's fragment endpoint does not exist.
		expect(fetchMock).not.toHaveBeenCalledWith('/index.part.html', expect.anything())
	})

	it('should fall back to a 404 only once the fetch says the page is missing', async () => {
		fetchMock.mockResolvedValue({ ok: false } as unknown as Response)

		render(
			<MemoryRouter initialEntries={['/blog/nope']}>
				<SitePage />
			</MemoryRouter>
		)

		await waitFor(() => {
			expect(screen.getByTestId('shell-not-found')).toBeDefined()
		})
		expect(fetchMock).toHaveBeenCalledWith('/blog/nope.part.html', {
			credentials: 'omit'
		})
	})
})

// vim: ts=4
