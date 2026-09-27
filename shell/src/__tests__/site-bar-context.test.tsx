// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The site bar on a page that was *not* served by the site wrapper.
 *
 * `siteSeed` is read off markup only the wrapper emits, so it is `null` on every
 * shell document — including one that followed a `<Link>` into a published page, a
 * search hit above all. The bar used to return `null` there and the reader got the
 * article with no navigation, no provenance and no way back.
 *
 * The second source is the fragment response's own headers, which `loadSiteFragment`
 * turns into a `siteContextAtom` value. A server that does not emit them leaves the
 * atom alone, which on a shell document means no bar — byte-for-byte the old
 * behaviour, and the case the second test pins.
 */

import { SITE_PAGE_META_TYPE } from '@cloudillo/core'
import { jest } from '@jest/globals'
import { render, screen, waitFor } from '@testing-library/react'
import { getDefaultStore } from 'jotai'
import * as React from 'react'
import { MemoryRouter } from 'react-router-dom'

const FRAGMENT =
	`<script type="${SITE_PAGE_META_TYPE}">{"title":"Hello","archetype":"page"}</script>` +
	'<p data-testid="published-body">Hello</p>'

jest.unstable_mockModule('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key })
}))

// The component library, not what is under test: the bar's provenance half pulls in
// a profile picture and an identity tag, both of which want the shell's API context.
// Unmocked primitives (layout, list, text) come from source; the overrides below win.
const realReact = await import('../../../libs/react/src/index.js')
jest.unstable_mockModule('@cloudillo/react', () => ({
	...realReact,
	useAuth: () => [undefined, () => {}],
	ProfilePicture: () => null,
	IdentityTag: ({ idTag }: { idTag: string }) => <span>{idTag}</span>,
	Button: () => null,
	LoadingSpinner: () => null
}))

jest.unstable_mockModule('../site/islands.js', () => ({
	scanIslands: () => []
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
const { siteContextAtom } = await import('../site/state.js')

const fetchMock = jest.fn<typeof fetch>()

function fragmentResponse(path: string, headers: Record<string, string>): Response {
	return {
		ok: true,
		redirected: false,
		url: `${window.location.origin}${path}`,
		headers: new Headers({ 'content-type': 'text/html; charset=utf-8', ...headers }),
		text: async () => FRAGMENT
	} as unknown as Response
}

beforeEach(() => {
	fetchMock.mockReset()
	globalThis.fetch = fetchMock as unknown as typeof fetch
	// The atom lives in the default store for the whole process, which is the point
	// of it — a context read once keeps the bar drawn across navigations. So each
	// case starts from the shell document's own state: no site known.
	getDefaultStore().set(siteContextAtom, null)
})

describe('SiteBar — a published page reached from a shell route', () => {
	it('should draw the bar from the fragment response headers', async () => {
		fetchMock.mockImplementation(async (input) =>
			String(input).endsWith('.part.html')
				? fragmentResponse('/blog/hello.part.html', {
						'X-Cloudillo-Site-Mount': '/',
						'X-Cloudillo-Site-Owner': 'alice.tld',
						'X-Cloudillo-Site-Owner-Name': 'Alice'
					})
				: ({ ok: false } as unknown as Response)
		)

		render(
			<MemoryRouter initialEntries={['/blog/hello']}>
				<SitePage />
			</MemoryRouter>
		)

		await waitFor(() => {
			expect(screen.getByText('Alice')).toBeDefined()
		})
		expect(screen.getByText('Hosted by')).toBeDefined()
		// The other consumer of the same atom: two levels below the mount is where a
		// breadcrumb trail is worth fetching the page table for.
		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith('/_site/manifest.json', {
				credentials: 'omit'
			})
		})
	})

	it('should render a crumb with an unsafe path as text, not an anchor', async () => {
		// `tSiteManifestPage.path` is a bare `T.string` off a published container, and
		// `\evil.example` under a `/` mount composes `/\evil.example` — which a browser
		// resolves as protocol-relative, i.e. an off-origin navigation from the owner's
		// own chrome. `siteHref` refuses it and the crumb keeps its label.
		const manifest = {
			version: 1,
			mountPath: '/',
			nav: [],
			pages: {
				parent: { path: '\\evil.example', title: 'Evil', archetype: 'page' },
				child: {
					path: '/blog/deep/leaf',
					title: 'Leaf',
					archetype: 'page',
					ancestry: ['parent']
				}
			}
		}
		fetchMock.mockImplementation(async (input) =>
			String(input).endsWith('manifest.json')
				? ({ ok: true, json: async () => manifest } as unknown as Response)
				: fragmentResponse('/blog/deep/leaf.part.html', {
						'X-Cloudillo-Site-Mount': '/',
						'X-Cloudillo-Site-Owner': 'alice.tld'
					})
		)

		render(
			<MemoryRouter initialEntries={['/blog/deep/leaf']}>
				<SitePage />
			</MemoryRouter>
		)

		const crumb = await screen.findByText('Evil')
		expect(crumb.tagName).toBe('SPAN')
	})

	it('should render no bar at all when the server sends no site headers', async () => {
		fetchMock.mockResolvedValue(fragmentResponse('/blog/plain.part.html', {}))

		const { container } = render(
			<MemoryRouter initialEntries={['/blog/plain']}>
				<SitePage />
			</MemoryRouter>
		)

		await waitFor(() => {
			expect(screen.getByTestId('published-body')).toBeDefined()
		})
		expect(container.querySelector('.c-site-bar')).toBeNull()
	})
})

// vim: ts=4
