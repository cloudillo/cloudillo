// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { MAX_SLUG_LENGTH, slugify, slugProblem, uniqueSlug } from '../publish/slug.js'

/** What a slug is allowed to be, mirroring `SLUG_PATTERN` in `publish/slug.ts`. */
const SLUG_PATTERN = /^[a-z0-9-]+$/

function conforms(slug: string) {
	return (
		SLUG_PATTERN.test(slug) &&
		!slug.startsWith('-') &&
		!slug.endsWith('-') &&
		slug.length <= MAX_SLUG_LENGTH
	)
}

describe('slugify', () => {
	it('should fold Hungarian accents rather than drop the letters', () => {
		expect(slugify('Árvíztűrő tükörfúrógép')).toBe('arvizturo-tukorfurogep')
		expect(slugify('Napló')).toBe('naplo')
	})

	it('should collapse punctuation and trim the edges', () => {
		expect(slugify('  Hello, World!  ')).toBe('hello-world')
		expect(slugify("Bob's page")).toBe('bobs-page')
	})

	it('should fold away entirely for a script with no Latin decomposition', () => {
		// The pageId fallback in `uniqueSlug` is what covers these.
		expect(slugify('Привет')).toBe('')
		expect(slugify('日本語')).toBe('')
		expect(slugify('🎉🎉')).toBe('')
	})
})

describe('slugProblem', () => {
	it('should accept a conforming slug', () => {
		expect(slugProblem('hello-world')).toBeUndefined()
		expect(slugProblem('a1')).toBeUndefined()
	})

	it('should name the charset and the edge problems', () => {
		expect(slugProblem('Hello')).toBe('chars')
		expect(slugProblem('a/b')).toBe('chars')
		expect(slugProblem('../../evil')).toBe('chars')
		expect(slugProblem('a b')).toBe('chars')
		expect(slugProblem('-lead')).toBe('edges')
		expect(slugProblem('trail-')).toBe('edges')
	})
})

// `uniqueSlug` is the one funnel every emitted slug passes through, and a slug is a
// public URL segment and a container zip entry name at once. Only the property panel
// validates what it *writes*, so a value that reached the record another way — an
// older build, an import, a collaborator's own RTDB client — arrives here unchecked.
// A stored `a/b` would escape the sibling dedup (`taken` compares whole slugs) and
// then collide inside the container's `files` map, silently replacing another page's
// fragment.

describe('uniqueSlug', () => {
	it('should use a conforming stored slug verbatim', () => {
		expect(uniqueSlug('p1', 'Ignored Title', 'my-slug', new Set(), true)).toBe('my-slug')
	})

	it('should derive from the title when no slug is stored', () => {
		expect(uniqueSlug('p1', 'Hello World', undefined, new Set(), true)).toBe('hello-world')
		expect(uniqueSlug('p1', 'Hello World', '   ', new Set(), true)).toBe('hello-world')
	})

	it('should fold a stored slug that carries path separators', () => {
		expect(uniqueSlug('p1', 'T', 'a/b', new Set(), true)).toBe('a-b')
		expect(uniqueSlug('p1', 'T', '../../evil', new Set(), true)).toBe('evil')
		expect(uniqueSlug('p1', 'T', '/leading', new Set(), true)).toBe('leading')
	})

	it('should fold a stored slug that is not lowercase', () => {
		expect(uniqueSlug('p1', 'T', 'MySlug', new Set(), true)).toBe('myslug')
	})

	it('should cap a stored slug that is conforming but too long', () => {
		const long = 'a'.repeat(300)
		const slug = uniqueSlug('p1', 'T', long, new Set(), true)
		expect(slug.length).toBe(MAX_SLUG_LENGTH)
		expect(conforms(slug)).toBe(true)
	})

	it('should lowercase the pageId fallback', () => {
		// `shortId` draws from `[0-9a-zA-Z]`, which `SLUG_PATTERN` does not admit —
		// and the first publish freezes whatever this returns into the record.
		expect(uniqueSlug('aB3xY9Qm1p', '🎉', undefined, new Set(), true)).toBe('ab3xy9qm1p')
		expect(uniqueSlug('aB3xY9Qm1p', '', undefined, new Set(), true)).toBe('ab3xy9qm1p')
	})

	it('should avoid minting the container root name at any depth', () => {
		expect(uniqueSlug('p1', 'Index', undefined, new Set(), true)).toBe('index-page')
		expect(uniqueSlug('p1', 'Index', undefined, new Set(), false)).toBe('index-page')
	})

	// The container writes the tag entries and `SITE_NOT_FOUND_ENTRY` into `files`
	// *after* the page loop, so a top-level page that minted one of their names would
	// have its own fragment silently replaced by the one appended later.
	it('should avoid minting the rest of the reserved container roots at the root', () => {
		expect(uniqueSlug('p1', '404', undefined, new Set(), true)).toBe('404-page')
		expect(uniqueSlug('p1', 'Tags', undefined, new Set(), true)).toBe('tags-page')
		// `_site` never reaches the reserved check: `_` is outside the slug charset,
		// so `slugify` has already folded it to `site` by then.
		expect(uniqueSlug('p1', 'T', '_site', new Set(), true)).toBe('site')
	})

	// Only `index` means anything deeper down: `blog/404.part.html` collides with
	// nothing, so refusing the name there would cost the author their URL for free.
	it('should allow a reserved container root name on a nested page', () => {
		expect(uniqueSlug('p1', '404', undefined, new Set(), false)).toBe('404')
		expect(uniqueSlug('p1', 'Tags', undefined, new Set(), false)).toBe('tags')
	})

	it('should suffix past a reserved name rather than stack the guard', () => {
		// The suffix loop re-derives from `base`, not from `candidate`, so the second
		// "404" gets `404-2` — which is not reserved either.
		const taken = new Set<string>()
		expect(uniqueSlug('p1', '404', undefined, taken, true)).toBe('404-page')
		expect(uniqueSlug('p2', '404', undefined, taken, true)).toBe('404-2')
	})

	it('should suffix a collision rather than drop the page', () => {
		const taken = new Set<string>()
		expect(uniqueSlug('p1', 'Hello', undefined, taken, true)).toBe('hello')
		expect(uniqueSlug('p2', 'Hello', undefined, taken, true)).toBe('hello-2')
		expect(uniqueSlug('p3', 'Hello', undefined, taken, true)).toBe('hello-3')
	})

	it('should dedupe a folded slug against its siblings too', () => {
		// The fold happens before the dedup, so `a/b` and `a-b` cannot both emit
		// `a-b` and overwrite one another's fragment in the container.
		const taken = new Set<string>()
		expect(uniqueSlug('p1', 'T', 'a-b', taken, true)).toBe('a-b')
		expect(uniqueSlug('p2', 'T', 'a/b', taken, true)).toBe('a-b-2')
	})

	it('should emit a conforming slug for every input, however stored', () => {
		const stored = [
			undefined,
			'',
			'   ',
			'a/b',
			'../../evil',
			'MySlug',
			'-lead',
			'trail-',
			'a'.repeat(300),
			'a b c',
			'%2e%2e',
			'.',
			'..',
			'/',
			'\\evil',
			'a\u0000b'
		]
		const titles = ['Hello World', '', '🎉', 'Привет', 'Árvíztűrő']
		for (const slug of stored) {
			for (const title of titles) {
				for (const atRoot of [true, false]) {
					const result = uniqueSlug('aB3xY9Qm1p', title, slug, new Set(), atRoot)
					expect(conforms(result)).toBe(true)
				}
			}
		}
	})
})
