// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { SearchMatch } from '@cloudillo/core'

import { getAncestorIds } from '../rtdb/page-ops.js'
import type { PageRecord } from '../rtdb/types.js'

export type PageWithId = PageRecord & { id: string }

const COMBINING_MARKS = /[\u0300-\u036f]/g

/**
 * Fold one code unit. Both public folders go through this so query and text can
 * never fold differently: whole-string folding lowercases a trailing Greek `Σ`
 * to `ς` where per-unit gives `σ`, and shifts every index past an NFD expansion.
 */
function foldUnit(ch: string): string {
	return ch.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase()
}

/** Lowercase + strip diacritics, so `kereses` matches `Keresés`. */
export function foldDiacritics(s: string): string {
	// ASCII fast path: no NFD decomposition, no combining marks, and every ASCII
	// letter lowercases to one character, so `toLowerCase()` is identical to the
	// per-unit fold. Every page title is folded on every keystroke.
	let ascii = true
	for (let i = 0; i < s.length; i++) {
		if (s.charCodeAt(i) > 0x7f) {
			ascii = false
			break
		}
	}
	if (ascii) return s.toLowerCase()

	let folded = ''
	for (let i = 0; i < s.length; i++) folded += foldUnit(s[i])
	return folded
}

/**
 * Fold `s` for matching while keeping a folded-index → original-index map, so a
 * range found in the folded string can be highlighted in the original one.
 */
export function foldWithMap(s: string): { folded: string; map: number[] } {
	let folded = ''
	const map: number[] = []
	for (let i = 0; i < s.length; i++) {
		const f = foldUnit(s[i])
		for (let j = 0; j < f.length; j++) map.push(i)
		folded += f
	}
	return { folded, map }
}

/** Split a raw query into folded terms. Multiple terms are AND-combined. */
export function queryTerms(query: string): string[] {
	return foldDiacritics(query.trim()).split(/\s+/).filter(Boolean)
}

// Shared with the shell's global search, which renders the same text-plus-offsets shape.
export type { SearchMatch }

/**
 * Match every term against `text` (AND). Returns the earliest match as a range
 * into the *original* `text`, or null if any term is missing.
 */
export function matchTerms(text: string, terms: string[]): SearchMatch | null {
	if (!terms.length) return null
	const { folded, map } = foldWithMap(text)
	let earliest: SearchMatch | null = null
	for (const term of terms) {
		const idx = folded.indexOf(term)
		if (idx < 0) return null
		const start = map[idx]
		const end = map[idx + term.length - 1] + 1
		if (!earliest || start < earliest.start) earliest = { start, end }
	}
	return earliest
}

/**
 * True when every term occurs in an already-folded string. Allocates nothing: this
 * is the per-page scan run on every keystroke, so unlike `matchTerms` it must not
 * build a fold index map.
 */
export function foldedHasAllTerms(folded: string, terms: string[]): boolean {
	return terms.length > 0 && terms.every((term) => folded.includes(term))
}

// Page *content* is matched server-side (`GET /api/search`, SQLite FTS5), one hit
// per page with a ready-made snippet: a client-side index would need every block
// of every page in memory. Titles and tags stay client-side because the page map
// is already resident for the sidebar tree, which keeps type-ahead responsive
// between round trips.

/** What the server found on one page. */
export interface ContentHit {
	/**
	 * BM25 relevance, higher is better. Content hits are ranked by it: the server
	 * returns up to 100 and the sidebar shows 50, so ordering alphabetically would
	 * let a page that barely matches push out the best hit.
	 */
	score: number
	/** Excerpt around the match, already trimmed and ellipsised by the server. */
	snippet?: string
	/** Ranges within `snippet` to emphasise. */
	snippetMatches?: SearchMatch[]
	/** Block the match landed in, for anchoring a jump-to-block. */
	blockId?: string
}

/** Server content hits, keyed by page id. */
export type ContentHits = Map<string, ContentHit>

export type SearchResultKind = 'title' | 'content' | 'tag'

export interface SearchResult {
	id: string
	title: string
	icon?: string
	tags?: string[]
	kind: SearchResultKind
	/** Ancestor titles, outermost first. Empty for root and unfiled pages. */
	path: string[]
	titleMatch?: SearchMatch
	snippet?: string
	snippetMatches?: SearchMatch[]
	/** Block the content match landed in, for anchoring a future jump-to-block. */
	blockId?: string
}

export interface SearchPagesOptions {
	pages: Map<string, PageWithId>
	query: string
	/**
	 * AND-combined tag filter, applied to locally matched titles only; content
	 * hits arrive already filtered (see the scan loop).
	 */
	tags?: ReadonlySet<string>
	/** Server content hits. Omit to search titles and tags only. */
	contentHits?: ContentHits
	limit?: number
}

/** What the scan phase records: enough to rank and slice, nothing that costs a pass. */
interface Candidate {
	id: string
	title: string
	icon?: string
	tags?: string[]
	kind: SearchResultKind
	/** Some term matches at the very start of the title — ranks above a substring hit. */
	titlePrefix: boolean
	/** Server relevance; content hits only. */
	score?: number
}

/**
 * The one place notillo decides what "matching" means. Everything user-facing
 * (sidebar filter, tag cloud) goes through here so they can never drift apart.
 */
export function searchPages({
	pages,
	query,
	tags,
	contentHits,
	limit
}: SearchPagesOptions): SearchResult[] {
	const terms = queryTerms(query)
	const hasTags = !!tags?.size
	if (!terms.length && !hasTags) return []

	// Scan phase: decide *what* matches using containment checks only. Anything
	// costing a pass over a page (the fold index map behind `matchTerms`, the
	// ancestor walk behind `path`) is deferred to the enrich phase below, which
	// runs only for the results that survive the limit.
	const candidates: Candidate[] = []

	for (const page of pages.values()) {
		let matchesTags = true
		if (hasTags) {
			for (const tag of tags!) {
				if (!page.tags?.includes(tag)) {
					matchesTags = false
					break
				}
			}
		}

		const base = {
			id: page.id,
			title: page.title,
			...(page.icon !== undefined && { icon: page.icon }),
			...(page.tags !== undefined && { tags: page.tags })
		}

		if (!terms.length) {
			// Tag-only browse, matched locally because every page is resident: no
			// result cap to work around and no index lag to inherit.
			if (matchesTags) candidates.push({ ...base, kind: 'tag', titlePrefix: false })
			continue
		}

		if (matchesTags) {
			const foldedTitle = foldDiacritics(page.title)
			if (foldedHasAllTerms(foldedTitle, terms)) {
				candidates.push({
					...base,
					kind: 'title',
					titlePrefix: terms.some((term) => foldedTitle.startsWith(term))
				})
				continue
			}
		}

		// Deliberately no local tag check: the server applied the tag filter
		// *inside* the full-text match, before truncating to the top hits by
		// relevance. Re-filtering here could only remove rows it already vetted,
		// never restore the matching page that truncation dropped.
		const hit = contentHits?.get(page.id)
		if (!hit) continue

		candidates.push({ ...base, kind: 'content', titlePrefix: false, score: hit.score })
	}

	// Title-prefix hits first, then other title hits, then content hits.
	function rank(c: Candidate): number {
		if (c.kind === 'content') return 2
		return c.titlePrefix ? 0 : 1
	}

	candidates.sort(
		(a, b) =>
			rank(a) - rank(b) ||
			// `rank` already grouped the scored (content) hits together, so this
			// never compares a scored hit against an unscored one.
			(b.score ?? 0) - (a.score ?? 0) ||
			a.title.localeCompare(b.title)
	)

	const top = limit !== undefined ? candidates.slice(0, limit) : candidates

	return top.map(({ titlePrefix: _titlePrefix, score: _score, ...base }) => {
		const result: SearchResult = {
			...base,
			path: getAncestorIds(base.id, pages).ancestorIds.map((id) => pages.get(id)?.title ?? '')
		}

		if (base.kind === 'title') {
			const titleMatch = matchTerms(base.title, terms)
			if (titleMatch) result.titleMatch = titleMatch
			return result
		}

		if (base.kind === 'content') {
			const hit = contentHits?.get(base.id)
			if (hit?.snippet) {
				result.snippet = hit.snippet
				if (hit.snippetMatches?.length) result.snippetMatches = hit.snippetMatches
			}
			if (hit?.blockId) result.blockId = hit.blockId
		}

		return result
	})
}

// vim: ts=4
