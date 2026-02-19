// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import type {
	StoredBlockRecord,
	BlockRecord,
	StoredPageRecord,
	PageRecord,
	InlineContent,
	StyledText,
	CompactInlineContent,
	CompactColorStyles
} from './types.js'
import { BLOCK_TYPE_TO_SHORT, BLOCK_TYPE_TO_LONG } from './types.js'

// ── Style flag encoding ──

const STYLE_FLAG_MAP: Record<string, string> = {
	bold: 'b',
	italic: 'i',
	underline: 'u',
	strikethrough: 's',
	code: 'c'
}

const FLAG_TO_STYLE: Record<string, string> = Object.fromEntries(
	Object.entries(STYLE_FLAG_MAP).map(([k, v]) => [v, k])
)

export function encodeStyleFlags(styles: Record<string, any>): string {
	let flags = ''
	for (const [style, flag] of Object.entries(STYLE_FLAG_MAP)) {
		if (styles[style]) flags += flag
	}
	return flags
}

export function decodeStyleFlags(flags: string): Record<string, any> {
	const styles: Record<string, any> = {}
	for (const ch of flags) {
		const style = FLAG_TO_STYLE[ch]
		if (style) styles[style] = true
	}
	return styles
}

// ── Block type compaction ──

export function compactBlockType(t: string): string {
	return BLOCK_TYPE_TO_SHORT[t] ?? t
}

export function expandBlockType(t: string): string {
	return BLOCK_TYPE_TO_LONG[t] ?? t
}

// ── Inline content compaction ──

export function compactContentItem(item: InlineContent): CompactInlineContent {
	if (item.type === 'text') {
		const styles = item.styles
		const boolFlags = encodeStyleFlags(styles ?? {})
		const hasColor = styles?.textColor || styles?.backgroundColor

		if (!boolFlags && !hasColor) {
			// Plain unstyled text → bare string
			return item.text
		}

		if (hasColor) {
			// Styled text with colors → [text, flags, {tc, bg}]
			const colors: CompactColorStyles = {}
			if (styles.textColor) colors.tc = styles.textColor
			if (styles.backgroundColor) colors.bg = styles.backgroundColor
			return [item.text, boolFlags, colors]
		}

		// Styled text with boolean flags only → [text, flags]
		return [item.text, boolFlags]
	}

	if (item.type === 'link') {
		return {
			l: item.href,
			c: item.content.map(compactContentItem)
		}
	}

	if (item.type === 'wikiLink') {
		return { wl: item.props.pageId, wt: item.props.pageTitle }
	}

	if (item.type === 'tag') {
		return { tg: item.props.tag }
	}

	// Unknown type — pass through
	return item as any
}

export function expandContentItem(item: CompactInlineContent): InlineContent {
	// Bare string → unstyled text
	if (typeof item === 'string') {
		return { type: 'text', text: item, styles: {} }
	}

	// Tuple → styled text
	if (Array.isArray(item)) {
		const [text, flags, colors] = item as [string, string, CompactColorStyles?]
		const styles: Record<string, any> = decodeStyleFlags(flags)
		if (colors?.tc) styles.textColor = colors.tc
		if (colors?.bg) styles.backgroundColor = colors.bg
		return { type: 'text', text, styles }
	}

	// Object — disambiguate by key
	if (typeof item === 'object' && item !== null) {
		// Old format (backward compat)
		if ('type' in item) return item as unknown as InlineContent

		// Compact link
		if ('l' in item) {
			const link = item as { l: string; c: CompactInlineContent[] }
			return {
				type: 'link',
				href: link.l,
				content: link.c.map(expandContentItem) as StyledText[]
			}
		}

		// Compact wikiLink
		if ('wl' in item) {
			const wl = item as { wl: string; wt: string }
			return { type: 'wikiLink', props: { pageId: wl.wl, pageTitle: wl.wt } }
		}

		// Compact tag
		if ('tg' in item) {
			const tag = item as { tg: string }
			return { type: 'tag', props: { tag: tag.tg } }
		}
	}

	// Fallback — return as-is (shouldn't happen)
	return item as any
}

export function compactContent(
	content: InlineContent[] | undefined
): CompactInlineContent[] | undefined {
	if (!content || content.length === 0) return undefined
	return content.map(compactContentItem)
}

export function expandContent(
	content: CompactInlineContent[] | undefined
): InlineContent[] | undefined {
	if (!content || content.length === 0) return undefined
	return content.map(expandContentItem)
}

// ── Sanitization helpers ──

export function cleanProps(
	props: Record<string, any> | undefined
): Record<string, any> | undefined {
	if (!props) return undefined
	const cleaned: Record<string, any> = {}
	for (const [key, value] of Object.entries(props)) {
		if (value === 'default') continue
		if (key === 'textAlignment' && value === 'left') continue
		cleaned[key] = value
	}
	return Object.keys(cleaned).length > 0 ? cleaned : undefined
}

// ── Block transformers ──

export function fromStoredBlock(stored: StoredBlockRecord, ownerTag?: string): BlockRecord {
	return {
		pageId: stored.p,
		type: expandBlockType(stored.t),
		...(stored.pr !== undefined && { props: stored.pr }),
		...(stored.c !== undefined && { content: expandContent(stored.c) }),
		...(stored.pb !== undefined && { parentBlockId: stored.pb }),
		order: stored.o,
		updatedAt: stored.ua,
		updatedBy: stored.ub ?? ownerTag ?? ''
	}
}

export function toStoredBlock(block: BlockRecord, ownerTag?: string): StoredBlockRecord {
	const pr = cleanProps(block.props)
	const c = compactContent(block.content)
	return {
		p: block.pageId,
		t: compactBlockType(block.type),
		...(pr !== undefined && { pr }),
		...(c !== undefined && { c }),
		...(block.parentBlockId != null && { pb: block.parentBlockId }),
		o: block.order,
		ua: block.updatedAt,
		...(block.updatedBy !== ownerTag && { ub: block.updatedBy })
	}
}

// ── Page transformers ──

export function fromStoredPage(stored: StoredPageRecord): PageRecord {
	return {
		title: stored.ti,
		...(stored.ic !== undefined && { icon: stored.ic }),
		...(stored.ci !== undefined && { coverImage: stored.ci }),
		...(stored.pp !== undefined && { parentPageId: stored.pp }),
		...(stored.hc !== undefined && { hasChildren: stored.hc }),
		...(stored.ae !== undefined && { autoExpand: stored.ae }),
		order: stored.o,
		createdAt: stored.ca,
		updatedAt: stored.ua,
		createdBy: stored.cb,
		...(stored.tg !== undefined && { tags: stored.tg })
	}
}

export function toStoredPage(page: PageRecord): StoredPageRecord {
	return {
		ti: page.title,
		...(page.icon !== undefined && { ic: page.icon }),
		...(page.coverImage !== undefined && { ci: page.coverImage }),
		...(page.parentPageId !== undefined && { pp: page.parentPageId }),
		...(page.hasChildren !== undefined && { hc: page.hasChildren }),
		...(page.autoExpand !== undefined && { ae: page.autoExpand }),
		o: page.order,
		ca: page.createdAt,
		ua: page.updatedAt,
		cb: page.createdBy,
		...(page.tags !== undefined && { tg: page.tags })
	}
}

// vim: ts=4
