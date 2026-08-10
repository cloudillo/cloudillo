// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PageRecord } from '../rtdb/types.js'
import {
	type ContentHits,
	foldDiacritics,
	foldedHasAllTerms,
	foldWithMap,
	matchTerms,
	queryTerms,
	searchPages
} from '../utils/search.js'

type PageWithId = PageRecord & { id: string }

function page(id: string, title: string, parentPageId?: string, tags?: string[]): PageWithId {
	return {
		id,
		title,
		...(parentPageId !== undefined && { parentPageId }),
		...(tags !== undefined && { tags }),
		order: 0,
		createdAt: '',
		updatedAt: '',
		createdBy: 'u'
	}
}

const pages = new Map<string, PageWithId>(
	[
		page('home', 'Home', '__root__'),
		page('hu', 'Keresés', 'home', ['docs', 'magyar']),
		page('deep', 'Deep child', 'hu'),
		page('unfiled', 'Floating note'),
		page('lost', 'Lost page', 'gone')
	].map((p) => [p.id, p])
)

// What the server returns for a content match: the page it landed on, an
// already-built snippet, and the block to anchor on.
const contentHits: ContentHits = new Map([
	[
		'deep',
		{
			score: 1,
			snippet: 'the quick brown fox jumps',
			snippetMatches: [{ start: 10, end: 15 }],
			blockId: 'blk'
		}
	]
])

describe('foldDiacritics', () => {
	it('folds Hungarian accents so `kereses` matches `Keresés`', () => {
		expect(foldDiacritics('Keresés')).toBe('kereses')
		expect(foldDiacritics('ÁRVÍZTŰRŐ')).toBe('arvizturo')
	})

	it('folds identically to foldWithMap, including Greek final sigma', () => {
		// The plain-ASCII entries take the whole-string fast path; the rest go
		// per-unit. Both must agree with `foldWithMap`, or a match found in one
		// could not be highlighted through the other.
		for (const s of ['Keresés', 'ΟΔΟΣ', 'ÁRVÍZTŰRŐ', 'straße', 'Hello World 42', '']) {
			expect(foldDiacritics(s)).toBe(foldWithMap(s).folded)
		}
	})
})

describe('foldedHasAllTerms', () => {
	it('AND-combines terms against an already-folded string', () => {
		expect(foldedHasAllTerms('the quick brown fox', ['quick', 'fox'])).toBe(true)
		expect(foldedHasAllTerms('the quick brown fox', ['quick', 'cat'])).toBe(false)
	})

	it('matches nothing for no terms, like matchTerms', () => {
		expect(foldedHasAllTerms('anything', [])).toBe(false)
	})

	// The sidebar's tag group runs the same pair over tag names, so `proj man` has
	// to reach `#project-management` there just as it reaches a page title.
	it('matches a tag on separate terms, in any order', () => {
		const tag = foldDiacritics('project-management')
		expect(foldedHasAllTerms(tag, queryTerms('proj man'))).toBe(true)
		expect(foldedHasAllTerms(tag, queryTerms('  man   proj '))).toBe(true)
		expect(foldedHasAllTerms(tag, queryTerms('proj nope'))).toBe(false)
	})
})

describe('queryTerms', () => {
	it('folds and splits on whitespace, dropping empties', () => {
		expect(queryTerms('  Keresés   Régi ')).toEqual(['kereses', 'regi'])
		expect(queryTerms('   ')).toEqual([])
	})
})

describe('matchTerms', () => {
	it('returns a range into the ORIGINAL string, not the folded one', () => {
		const match = matchTerms('Keresés', ['eses'])
		expect(match).toEqual({ start: 3, end: 7 })
		// The highlight must land on the accented text, not shift past it.
		expect('Keresés'.slice(match!.start, match!.end)).toBe('esés')
	})

	it('AND-combines terms and reports the earliest match', () => {
		expect(matchTerms('Hello world', ['world', 'hello'])!.start).toBe(0)
		expect(matchTerms('Hello world', ['world', 'nope'])).toBeNull()
	})

	it('returns null for no terms', () => {
		expect(matchTerms('anything', [])).toBeNull()
	})
})

describe('searchPages', () => {
	it('matches titles ignoring accents', () => {
		const results = searchPages({ pages, query: 'kereses' })
		expect(results.map((r) => r.id)).toEqual(['hu'])
		expect(results[0].path).toEqual(['Home'])
	})

	it('finds unfiled pages, which the sidebar tree cannot show', () => {
		expect(searchPages({ pages, query: 'floating' })[0].id).toBe('unfiled')
	})

	it('carries the server snippet, highlight range and block anchor through', () => {
		const results = searchPages({ pages, query: 'brown', contentHits })
		expect(results).toHaveLength(1)
		expect(results[0].kind).toBe('content')
		expect(results[0].blockId).toBe('blk')
		const { snippet, snippetMatches } = results[0]
		expect(snippetMatches).toHaveLength(1)
		expect(snippet!.slice(snippetMatches![0].start, snippetMatches![0].end)).toBe('brown')
	})

	it('finds nothing in content until the server has answered', () => {
		expect(searchPages({ pages, query: 'brown' })).toHaveLength(0)
	})

	it('ranks title hits above content hits', () => {
		// 'Deep child' has no 'o'; its content does — so it can only match on content.
		const results = searchPages({ pages, query: 'o', contentHits })
		const firstContent = results.findIndex((r) => r.kind === 'content')
		expect(results[firstContent].id).toBe('deep')
		expect(results.slice(0, firstContent).every((r) => r.kind === 'title')).toBe(true)
	})

	it('ranks content hits by server relevance, not by title', () => {
		// 'Alpha' sorts first and would win on `localeCompare`, but the server
		// considers 'Zulu' the far better match. With 100 hits from the server and
		// 50 rows in the sidebar, ordering alphabetically would drop the good one.
		const scored = new Map<string, PageWithId>(
			[page('a', 'Alpha'), page('z', 'Zulu')].map((p) => [p.id, p])
		)
		const hits: ContentHits = new Map([
			['a', { score: 0.2, snippet: 'weak mention' }],
			['z', { score: 9.5, snippet: 'strong mention' }]
		])
		const results = searchPages({ pages: scored, query: 'mention', contentHits: hits })
		expect(results.map((r) => r.id)).toEqual(['z', 'a'])
	})

	it('falls back to title order when scores tie', () => {
		const tied = new Map<string, PageWithId>(
			[page('z', 'Zulu'), page('a', 'Alpha')].map((p) => [p.id, p])
		)
		const hits: ContentHits = new Map([
			['z', { score: 3 }],
			['a', { score: 3 }]
		])
		const results = searchPages({ pages: tied, query: 'mention', contentHits: hits })
		expect(results.map((r) => r.id)).toEqual(['a', 'z'])
	})

	it('ranks a title prefix above a title substring', () => {
		expect(searchPages({ pages, query: 'lo' }).map((r) => r.id)).toEqual(['lost', 'unfiled'])
	})

	it('AND-combines multiple tags', () => {
		expect(searchPages({ pages, query: '', tags: new Set(['docs', 'magyar']) })).toHaveLength(1)
		expect(searchPages({ pages, query: '', tags: new Set(['docs', 'nope']) })).toHaveLength(0)
	})

	it('combines a tag filter with a query', () => {
		expect(searchPages({ pages, query: 'kereses', tags: new Set(['docs']) })).toHaveLength(1)
		expect(searchPages({ pages, query: 'floating', tags: new Set(['docs']) })).toHaveLength(0)
	})

	it('trusts the server tag filter for content hits', () => {
		// The server applies the tag filter inside the full-text match, before
		// truncating to the top hits by relevance. Re-checking tags here would only
		// drop rows it already vetted, never restore the page truncation hid.
		// 'Deep child' carries no tags at all, yet it is a legitimate hit.
		const results = searchPages({
			pages,
			query: 'brown',
			tags: new Set(['docs']),
			contentHits
		})
		expect(results.map((r) => r.id)).toEqual(['deep'])
	})

	it('still applies the tag filter to locally matched titles', () => {
		// Titles are matched here, against a page map that is complete — so the
		// filter has to be applied on this side or it is not applied at all.
		// 'Floating note' matches the query by title but carries no tags.
		const ids = searchPages({
			pages,
			query: 'floating',
			tags: new Set(['docs']),
			contentHits
		}).map((r) => r.id)
		expect(ids).not.toContain('unfiled')
	})

	it('returns nothing for an empty query with no tags', () => {
		expect(searchPages({ pages, query: '   ' })).toHaveLength(0)
	})

	it('applies the limit after ranking', () => {
		const limited = searchPages({ pages, query: 'e', limit: 1 })
		expect(limited).toHaveLength(1)
		expect(limited[0].id).toBe(searchPages({ pages, query: 'e' })[0].id)
	})
})

// vim: ts=4
