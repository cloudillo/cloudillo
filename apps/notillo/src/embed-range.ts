// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Block-range embed views: `blk:<pageId>:<startBlockId>:<endBlockId>` addresses the
 * top-level blocks of one page from start to end (start = end ⇒ a single block).
 * Each part is URI-encoded, so an id containing `:` still parses; plain ids read as-is.
 */

const PREFIX = 'blk:'

export interface BlockRangeNav {
	pageId: string
	start: string
	end: string
}

export function formatBlockRangeNav(pageId: string, start: string, end: string): string {
	return PREFIX + [pageId, start, end].map(encodeURIComponent).join(':')
}

export function parseBlockRangeNav(nav: string | undefined): BlockRangeNav | null {
	if (!nav?.startsWith(PREFIX)) return null
	const parts = nav.slice(PREFIX.length).split(':')
	if (parts.length !== 3) return null
	try {
		const [pageId, start, end] = parts.map(decodeURIComponent)
		return pageId && start && end ? { pageId, start, end } : null
	} catch {
		return null
	}
}

/**
 * Indices of the range within `blocks` (top-level, in document order). Start gone ⇒
 * null (missing); end gone ⇒ start to the last block; end before start ⇒ start only.
 */
export function resolveBlockRange(
	blocks: readonly { id: string }[],
	start: string,
	end: string
): { from: number; to: number } | null {
	const from = blocks.findIndex((b) => b.id === start)
	if (from < 0) return null
	const to = blocks.findIndex((b) => b.id === end)
	if (to < 0) return { from, to: blocks.length - 1 }
	return { from, to: Math.max(from, to) }
}

/** Escapes a CSS string (a `[data-id="…"]` value). */
export const cssString = (s: string) =>
	s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\A ')

/** Plain text of the first heading among `blocks` (text runs and link labels). */
export function firstHeading(
	blocks: readonly { type: string; content?: unknown }[]
): string | undefined {
	const heading = blocks.find((b) => b.type === 'heading')
	if (!heading || !Array.isArray(heading.content)) return undefined
	const text = (items: unknown[]): string =>
		items
			.map((item) => {
				const node = item as { text?: unknown; content?: unknown }
				if (typeof node.text === 'string') return node.text
				return Array.isArray(node.content) ? text(node.content) : ''
			})
			.join('')
	return text(heading.content).trim() || undefined
}

// vim: ts=4
