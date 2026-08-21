// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `loadSiteFragment` only ever returns *our own* origin's bytes.
 *
 * They go straight into `innerHTML` in `SitePage`, which runs inline handlers even
 * though it does not run `<script>` — so an attacker-controlled fragment is script
 * execution on the reader's origin. Two ways one used to get there:
 *
 * - a *protocol-relative* path. `location.pathname` keeps a leading `//`,
 *   `isClientRoutablePath` reads `//evil.example/foo` as an ordinary two-segment page,
 *   and `fetch('//evil.example/foo.part.html')` resolves off-origin. The three guards
 *   below it all pass: `res.redirected` is false, the content type and the metadata
 *   script are the attacker's to write, and `credentials: 'omit'` makes it a simple
 *   CORS request `Access-Control-Allow-Origin: *` allows.
 * - any other off-origin resolution. The origin check was gated on `res.redirected`,
 *   which is the one instance rather than the class.
 *
 * `.tsx` for the jsdom environment — see `shell/jest.config.cjs`. The module reads
 * `document.title` at load.
 */

import { SITE_PAGE_META_TYPE } from '@cloudillo/core'
import { jest } from '@jest/globals'

const FRAGMENT = `<script type="${SITE_PAGE_META_TYPE}">{"title":"Hi","archetype":"page"}</script><p>Hi</p>`

const { loadSiteFragment } = await import('../site/fragment.js')

const fetchMock = jest.fn<typeof fetch>()

function htmlResponse(url: string): Response {
	return {
		ok: true,
		redirected: false,
		url,
		headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
		text: async () => FRAGMENT
	} as unknown as Response
}

beforeEach(() => {
	fetchMock.mockReset()
	globalThis.fetch = fetchMock as unknown as typeof fetch
})

describe('loadSiteFragment', () => {
	it('should never fetch a protocol-relative path', async () => {
		// The assertion that pins the bug is the call count: composing the URL at all
		// is what hands the attacker's origin the request.
		for (const hostile of ['//evil.example/foo', '/\\evil.example/foo', '/\tevil/x']) {
			expect(await loadSiteFragment(hostile)).toEqual({ status: 'missing' })
		}
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('should refuse a response that resolved off-origin without a redirect', async () => {
		fetchMock.mockResolvedValue(htmlResponse('https://evil.example/blog/x.part.html'))

		expect(await loadSiteFragment('/blog/x')).toEqual({ status: 'missing' })
	})

	it('should still serve an ordinary same-origin page', async () => {
		fetchMock.mockResolvedValue(htmlResponse(`${window.location.origin}/blog/ok.part.html`))

		expect(await loadSiteFragment('/blog/ok')).toEqual({ status: 'ok', html: FRAGMENT })
		expect(fetchMock).toHaveBeenCalledWith('/blog/ok.part.html', { credentials: 'omit' })
	})
})

// vim: ts=4
