// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// `_site/manifest.json` is read back off the wire by a published page with no
// session and nothing upstream type-checked. What is asserted here is the
// degradation policy, not the decoder: which failures cost one breadcrumb and which
// cost the whole table.

import { decodeSiteManifest } from '../site.js'

const GOOD = {
	version: 1,
	mountPath: '/blog',
	pages: {
		p1: { path: 'index', title: 'Home', archetype: 'page' },
		p2: {
			path: 'hello',
			title: 'Hello',
			archetype: 'post',
			tags: ['news'],
			ancestry: ['p1']
		}
	},
	nav: [{ path: 'hello', title: 'Hello' }]
}

describe('decodeSiteManifest', () => {
	it('should round-trip a well-formed manifest', () => {
		expect(decodeSiteManifest(GOOD)).toEqual(GOOD)
	})

	it('should refuse a manifest whose version moved', () => {
		// A newer generation may have moved `pages`; rendering nothing beats
		// rendering a trail built out of guesses.
		expect(decodeSiteManifest({ ...GOOD, version: 2 })).toBeUndefined()
		expect(decodeSiteManifest({ mountPath: '/', pages: {}, nav: [] })).toBeUndefined()
		expect(decodeSiteManifest('nonsense')).toBeUndefined()
	})

	it('should drop one malformed page entry without losing its siblings', () => {
		const manifest = decodeSiteManifest({
			...GOOD,
			pages: { ...GOOD.pages, bad: { path: 'x', title: 42, archetype: 'page' } }
		})
		expect(Object.keys(manifest?.pages ?? {})).toEqual(['p1', 'p2'])
	})

	it('should keep a page that carries a field this build does not know', () => {
		const manifest = decodeSiteManifest({
			...GOOD,
			pages: { p1: { ...GOOD.pages.p1, futureField: 'whatever' } }
		})
		expect(manifest?.pages.p1).toEqual(GOOD.pages.p1)
	})

	it('should drop one malformed nav entry without losing its siblings', () => {
		const manifest = decodeSiteManifest({
			...GOOD,
			nav: [{ path: 'a', title: 'A' }, 'nonsense', { path: 'b' }, { path: 'c', title: 'C' }]
		})
		expect(manifest?.nav).toEqual([
			{ path: 'a', title: 'A' },
			{ path: 'c', title: 'C' }
		])
	})

	it('should drop a field it does not know instead of the document', () => {
		// A newer publisher generation adding a field must not cost an older reader
		// every breadcrumb trail on the site.
		const manifest = decodeSiteManifest({ ...GOOD, whatIsThis: { old: 42 } })
		expect(manifest).toEqual(decodeSiteManifest(GOOD))
		expect(manifest).not.toHaveProperty('whatIsThis')
	})

	it('should drop an over-deep nav entry instead of overflowing the stack', () => {
		// `tSiteNavEntry` recurses through a `T.lazy` with no bound of its own, so
		// a hand-written manifest nesting far enough used to throw a `RangeError`
		// straight out of a function typed `SiteManifest | undefined`.
		let deep: Record<string, unknown> = { path: 'leaf', title: 'Leaf' }
		for (let i = 0; i < 5000; i++) {
			deep = { path: `n${i}`, title: `N${i}`, children: [deep] }
		}

		let manifest: ReturnType<typeof decodeSiteManifest>
		expect(() => {
			manifest = decodeSiteManifest({ ...GOOD, nav: [deep, ...GOOD.nav] })
		}).not.toThrow()
		// Per entry, like every other refusal here: the good entry survives.
		expect(manifest?.nav).toEqual(GOOD.nav)
		expect(Object.keys(manifest?.pages ?? {})).toEqual(['p1', 'p2'])
	})

	it('should keep a nav entry nested within the cap', () => {
		const nested = {
			path: 'a',
			title: 'A',
			children: [{ path: 'a/b', title: 'B', children: [{ path: 'a/b/c', title: 'C' }] }]
		}
		expect(decodeSiteManifest({ ...GOOD, nav: [nested] })?.nav).toEqual([nested])
	})
})

// vim: ts=4
