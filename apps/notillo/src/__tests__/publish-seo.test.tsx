// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `sitemap.xml` and `feed.xml` are XML, and XML 1.0 is stricter than HTML about what
 * a text node may contain: the C0 controls are illegal outright, with no escape for
 * them. `escapeHtml` covers `& < > " '` and nothing else, so one such character in
 * one page title — a markdown import, a paste, a direct RTDB write — made the whole
 * file a fatal parse error for every consumer, taking the container's discoverability
 * with it while its HTML fragments rendered fine.
 */

import { buildFeed, buildSitemap } from '../publish/seo.js'

const CONTROLS = '\x01\x0B\x0C\x1F'

function parse(xml: string): Document {
	return new DOMParser().parseFromString(xml, 'application/xml')
}

function parseError(xml: string): string | undefined {
	return parse(xml).querySelector('parsererror')?.textContent ?? undefined
}

describe('buildSitemap', () => {
	it('should emit parseable XML for a path carrying control characters', () => {
		const xml = buildSitemap([{ path: `/blog/${CONTROLS}hello`, lastmod: '2026-01-01' }])

		expect(parseError(xml)).toBeUndefined()
		// biome-ignore lint/suspicious/noControlCharactersInRegex: asserting these are gone is the test
		expect(xml).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F]/)
		expect(xml).toContain('/blog/hello')
	})
})

describe('buildFeed', () => {
	const entry = {
		pageId: 'p1',
		path: '/blog/hello',
		title: `Hel${CONTROLS}lo & <goodbye>`,
		author: `Ann${CONTROLS}a`,
		summary: `A sum${CONTROLS}mary`,
		tags: [`ta${CONTROLS}g`]
	}

	it('should strip control characters from every interpolation', () => {
		const xml = buildFeed({
			pageId: 'f1',
			path: '/blog',
			title: `Blo${CONTROLS}g`,
			entries: [entry]
		})

		expect(parseError(xml)).toBeUndefined()
		// biome-ignore lint/suspicious/noControlCharactersInRegex: asserting these are gone is the test
		expect(xml).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F]/)
	})

	it('should keep escaping what XML does have an escape for', () => {
		const xml = buildFeed({
			pageId: 'f1',
			path: '/blog',
			title: 'Blog',
			entries: [entry]
		})

		// Dropping the illegal characters must not have taken the escaping with it.
		expect(xml).toContain('&amp;')
		expect(xml).toContain('&lt;goodbye&gt;')
		const title = parse(xml).querySelector('entry > title')?.textContent
		expect(title).toBe('Hello & <goodbye>')
	})
})

// vim: ts=4
