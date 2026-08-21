// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * A failed manifest read must not become permanent.
 *
 * `useSiteManifest` shares one promise per mount process-wide, which is what keeps a
 * page with breadcrumbs *and* an owner's edit link to a single request. But
 * `loadSiteManifest` resolves to `undefined` on a 5xx and on an offline reader alike,
 * and a settled `undefined` left in that map cost every navigation after it its
 * breadcrumb trail until a full reload. `site/fragment.ts` keeps a network failure
 * retryable for the same reason.
 */

import { jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react'

const MOUNT = '/blog'

const MANIFEST = {
	version: 1,
	mountPath: MOUNT,
	pages: { p1: { path: 'hello', title: 'Hello', archetype: 'post' } },
	nav: [{ path: 'hello', title: 'Hello' }]
}

jest.unstable_mockModule('../site/detect.js', () => ({
	siteSeed: { site: { mountPath: MOUNT, host: 'x.tld', docFileId: 'f1' }, owner: {}, nav: [] }
}))

const { useSiteManifest } = await import('../site/manifest.js')

const fetchMock = jest.fn<typeof fetch>()

function jsonResponse(body: unknown): Response {
	return { ok: true, json: async () => body } as unknown as Response
}

let error: ReturnType<typeof jest.spyOn>

beforeEach(() => {
	fetchMock.mockReset()
	globalThis.fetch = fetchMock as unknown as typeof fetch
	error = jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
	error.mockRestore()
})

// `pending` is module state with no reset hook — which is the thing under test — so
// this is one ordered narrative rather than four independent cases.
describe('useSiteManifest', () => {
	it('should spend nothing while it is not enabled', () => {
		// Most published pages are one level deep and read by someone who cannot
		// edit them. First, so it runs before anything fills the shared map.
		renderHook(() => useSiteManifest(false))
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('should retry after a failure, and share the read once it succeeds', async () => {
		fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
		fetchMock.mockResolvedValue(jsonResponse(MANIFEST))

		// Two concurrent mounts while the read is in flight: the entry is what keeps
		// them to one request, so only the *settled* failure may be evicted.
		const a = renderHook(() => useSiteManifest(true))
		const b = renderHook(() => useSiteManifest(true))
		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(1)
		})
		expect(a.result.current).toBeUndefined()
		expect(b.result.current).toBeUndefined()
		a.unmount()
		b.unmount()

		// The offline moment passed. This used to answer `undefined` from the map
		// forever: no breadcrumbs and no "Edit this page" until a full reload.
		const retried = renderHook(() => useSiteManifest(true))
		await waitFor(() => {
			expect(retried.result.current).toBeDefined()
		})
		expect(fetchMock).toHaveBeenCalledTimes(2)
		expect(retried.result.current?.mountPath).toBe(MOUNT)

		// And a success stays shared — the eviction is for failures only.
		const later = renderHook(() => useSiteManifest(true))
		await waitFor(() => {
			expect(later.result.current).toBeDefined()
		})
		expect(fetchMock).toHaveBeenCalledTimes(2)
	})
})

// vim: ts=4
