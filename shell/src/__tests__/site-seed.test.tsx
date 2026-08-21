// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// `.test.tsx` rather than `.test.ts`, with no JSX in it: `site/detect.ts` reads the
// document at module load, and this repo's jest split gives only `.test.tsx` a DOM.

// The boot seed is same-origin markup from our own wrapper, but a *stale* generation is
// precisely the case this parser exists for — so what matters is which fields a missing
// value costs the page. `owner.idTag` and `site.mountPath` have no sensible fallback and
// refuse the whole seed; every other field falls back and the bar still renders.

import { jest } from '@jest/globals'

import { SITE_SEED_TYPE } from '../site/detect.js'

async function readSeed(seed: unknown) {
	document.head.innerHTML = ''
	if (seed !== undefined) {
		const el = document.createElement('script')
		el.type = SITE_SEED_TYPE
		el.textContent = typeof seed === 'string' ? seed : JSON.stringify(seed)
		document.head.appendChild(el)
	}
	jest.resetModules()
	const { siteSeed } = await import('../site/detect.js')
	return siteSeed
}

const FULL = {
	owner: { idTag: 'alice.tld', name: 'Alice', profilePic: 'pic1' },
	site: { host: 'alice.cloudillo.net', mountPath: '/blog', docFileId: 'f1' },
	nav: [{ label: 'About', target: '/about' }]
}

describe('readSiteSeed', () => {
	it('should read a complete seed', async () => {
		expect(await readSeed(FULL)).toEqual(FULL)
	})

	it('should fall back to the idTag when the owner has no name', async () => {
		const seed = await readSeed({ ...FULL, owner: { idTag: 'alice.tld' } })
		expect(seed?.owner).toEqual({ idTag: 'alice.tld', name: 'alice.tld' })
	})

	it('should treat a null profile picture as absent', async () => {
		const owner = { idTag: 'alice.tld', name: 'Alice', profilePic: null }
		const seed = await readSeed({ ...FULL, owner })
		expect(seed?.owner.profilePic).toBeUndefined()
	})

	it('should fall back to the document host and an empty docFileId', async () => {
		const seed = await readSeed({ ...FULL, site: { mountPath: '/' } })
		expect(seed?.site).toEqual({
			host: window.location.host,
			mountPath: '/',
			docFileId: ''
		})
	})

	it('should refuse a seed with no owner idTag', async () => {
		expect(await readSeed({ ...FULL, owner: { name: 'Alice' } })).toBeNull()
	})

	it('should refuse a seed with no mount path', async () => {
		expect(await readSeed({ ...FULL, site: { host: 'h' } })).toBeNull()
	})

	it('should be null on a document that carries no seed at all', async () => {
		expect(await readSeed(undefined)).toBeNull()
	})

	it('should be null on unparseable JSON rather than throwing on the way up', async () => {
		expect(await readSeed('{ not json')).toBeNull()
	})

	it('should keep the seed when a newer generation adds a field', async () => {
		const seed = await readSeed({ ...FULL, theme: 'dark', site: { ...FULL.site, tz: 'UTC' } })
		expect(seed?.site.mountPath).toBe('/blog')
	})

	it('should drop a malformed nav entry rather than empty the bar', async () => {
		const seed = await readSeed({ ...FULL, nav: [{ label: 'No target' }, ...FULL.nav] })
		expect(seed?.nav).toEqual(FULL.nav)
	})

	it('should treat an absent nav as an empty one', async () => {
		const seed = await readSeed({ owner: FULL.owner, site: FULL.site })
		expect(seed?.nav).toEqual([])
	})
})

// vim: ts=4
