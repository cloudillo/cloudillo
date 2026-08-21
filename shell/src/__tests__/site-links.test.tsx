// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Which clicks the site runtime takes over, on the *owner's public origin*. Pure
 * functions with no DOM in them, which is why this suite exists at all —
 * `site-notfound.test.tsx` deferred these cases to "a direct unit test" that had
 * never been written.
 *
 * The rule used to be an allowlist of extensions mirroring the backend's. That is
 * the wrong shape: a container serves whatever the author put in it, so a published
 * page linking to `/assets/report.pdf` was intercepted, fetched as
 * `report.pdf.part.html`, 404'd and rendered as the site's not-found page — while a
 * cold load or a middle-click on the same link worked, which made it look flaky.
 *
 * The inversion needs one exception, and it is not optional: page slugs cannot
 * contain a dot (`publish/slug.ts`), but **shell** routes can — a resId's owner half
 * is an idTag, as in `/~/app/quillo/bob.org:abc` — and intercepting those is the
 * stated purpose of this module.
 *
 * `.tsx`, so jest gives it jsdom: `detect.js` reads `document` at module load, which
 * is also why the flag it exports has to be mocked here. A mocked ESM export is a
 * snapshot — jest evaluates the factory once per module registry — so answering the
 * question both ways means resetting the registry and importing again, which is what
 * `loadLinks` does.
 */

import { jest } from '@jest/globals'

/** Whether the document under test was served by the site wrapper. */
let siteDocument = false

jest.unstable_mockModule('../site/detect.js', () => ({
	isSiteDocument: siteDocument
}))

/** `links.ts` with `isSiteDocument` set to `siteDocument`, freshly evaluated. */
async function loadLinks(): Promise<(pathname: string) => boolean> {
	jest.resetModules()
	return (await import('../site/links.js')).isClientRoutablePath
}

const isClientRoutablePath = await loadLinks()

describe('isClientRoutablePath', () => {
	afterEach(() => {
		siteDocument = false
	})

	it.each([
		// Handlers and static roots the backend owns.
		'/api/x',
		'/ws/rtdb/abc',
		'/apps/quillo/index.js',
		'/assets-1.2.3/main.css',
		// Files a container serves verbatim — a dot in the last segment is enough.
		'/feed.xml',
		'/_site/manifest.json',
		'/assets/report.pdf',
		'/img/photo.jpg',
		'/downloads/x.zip',
		'/events/schedule.ics'
	])('should leave %p to the browser', (path) => {
		expect(isClientRoutablePath(path)).toBe(false)
	})

	it.each([
		// Ordinary site pages.
		'/blog/post',
		'/about',
		'/blog/2026/a-long-slug',
		// Shell routes, dot and all: `/~` and `@<idTag>` are the context sigils.
		'/~/app/quillo/bob.org:abc',
		'/~/settings/security',
		'/@comm.tld/settings/security',
		'/@comm.tld/app/notillo/comm.tld:f1'
	])('should route %p client-side', (path) => {
		expect(isClientRoutablePath(path)).toBe(true)
	})

	it('should route the site root client-side on a site document', async () => {
		// A mount can publish a home page, and `/index.part.html` is its endpoint.
		siteDocument = true
		expect((await loadLinks())('/')).toBe(true)
	})

	it('should leave the site root to the browser on a shell document', () => {
		// There `/` is the shell's own placeholder home, and only the server knows
		// whether this host serves a site root at all.
		expect(isClientRoutablePath('/')).toBe(false)
	})

	it('should not mistake a leading dot for an extension', () => {
		// `lastIndexOf('.') > 0`, not `>= 0`: a dotfile-shaped segment is still a name.
		expect(isClientRoutablePath('/.hidden')).toBe(true)
	})

	it.each(['/.well-known', '/.well-known/cloudillo/id-tag'])(
		'should leave %p to the backend',
		(path) => {
			// A server root whose deep paths carry no extension in the last segment
			// (`id-tag`), so only `SERVER_ROOTS` keeps it off the client router.
			expect(isClientRoutablePath(path)).toBe(false)
		}
	)
})

// vim: ts=4
