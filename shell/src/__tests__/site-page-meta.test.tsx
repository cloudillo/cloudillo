// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * What the tab reads once no published page owns it.
 *
 * `fragment.ts` captured its fallback title from `document.title` at module
 * evaluation. On a shell document that is right — `index.html`'s title is exactly
 * what a shell route should show. On a **site** document it is the *published
 * page's* title, because the wrapper already rendered it, so `clearPageMeta` then
 * stamped that page's title onto every shell route the reader visited afterwards —
 * precisely the mislabelling its own docstring says it exists to undo.
 *
 * `.test.tsx` for the DOM, as `site-seed.test.tsx` explains. `jest.resetModules()`
 * per case because both `detect.ts` and `fragment.ts` decide at module load.
 */

import { jest } from '@jest/globals'

// Type-only, so it is erased before the mock of that same module takes effect.
import type { SiteBootSeed } from '../site/detect.js'

const SEED: SiteBootSeed = {
	owner: { idTag: 'alice.tld', name: 'Alice' },
	site: { host: 'alice.tld', mountPath: '/', docFileId: 'f1' },
	nav: []
}

/**
 * Load `fragment.ts` against a given document kind, with the tab already showing
 * `bootTitle` — which on a site cold load is the published page's own title.
 */
async function loadFragment(opts: {
	isSiteDocument: boolean
	siteSeed: SiteBootSeed | null
	bootTitle: string
}) {
	jest.resetModules()
	document.title = opts.bootTitle
	jest.unstable_mockModule('../site/detect.js', () => ({
		isSiteDocument: opts.isSiteDocument,
		siteSeed: opts.siteSeed
	}))
	return import('../site/fragment.js')
}

const PAGE_TITLE = 'Hello, world — the blog'

describe('clearPageMeta on a site document', () => {
	it('should not put the published page’s title back on a shell route', async () => {
		const { clearPageMeta } = await loadFragment({
			isSiteDocument: true,
			siteSeed: SEED,
			bootTitle: PAGE_TITLE
		})

		clearPageMeta()

		expect(document.title).not.toBe(PAGE_TITLE)
		// The owner's display name is the site's own name — the honest answer.
		expect(document.title).toBe('Alice')
	})

	it('should fall back to the application name with no seed to ask', async () => {
		const { clearPageMeta } = await loadFragment({
			isSiteDocument: true,
			siteSeed: null,
			bootTitle: PAGE_TITLE
		})

		clearPageMeta()

		expect(document.title).toBe('Cloudillo')
	})

	it('should also cover a fragment that carries no metadata of its own', async () => {
		const { applyPageMeta } = await loadFragment({
			isSiteDocument: true,
			siteSeed: SEED,
			bootTitle: PAGE_TITLE
		})

		// A fragment with no metadata script: the title must not be left reading the
		// previous page's, and must not fall back to the booted one either.
		applyPageMeta(document.createElement('div'), '/about')

		expect(document.title).toBe('Alice')
	})
})

describe('clearPageMeta on a shell document', () => {
	it('should restore whatever the document booted with', async () => {
		// The unchanged case, and the reason the constant is not replaced outright:
		// here `document.title` at module load *is* the right value.
		const { clearPageMeta } = await loadFragment({
			isSiteDocument: false,
			siteSeed: null,
			bootTitle: 'Cloudillo Shell'
		})

		document.title = 'Something a component set'
		clearPageMeta()

		expect(document.title).toBe('Cloudillo Shell')
	})
})

// vim: ts=4
