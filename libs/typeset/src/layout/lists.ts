// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PageDL } from '../display-list.js'
import { ptToFx } from '../fixed.js'
import type { ListProps, Paragraph, StyleDef, Story } from '../model.js'
import type { ItemizedParagraph, ItemizeEnv } from '../text/itemize.js'
import { resolveParagraphStyle } from '../text/styles.js'
import { textGlyphs } from './fields.js'
import { formatNumber } from './locale.js'

/** Indent per list level; the marker hangs in the innermost one. */
// Fixed 18 pt; make it a ListProps/style prop when designers need other hangs.
export const LIST_INDENT = ptToFx(18)

/** 0-based nesting level, clamped to 0–8. */
const levelOf = (l: ListProps) => Math.max(0, Math.min(8, Math.floor(l.level || 0)))

/** `p` with its list indent: `indentStart` grows by `LIST_INDENT` × (level + 1). */
export function withListIndent(p: Paragraph, styles: Record<string, StyleDef>): Paragraph {
	if (!Array.isArray(p.runs)) return p
	const st = resolveParagraphStyle(styles, p.style, p.overrides)
	if (!st.list) return p
	const indentStart = st.indentStart + (levelOf(st.list) + 1) * LIST_INDENT
	return { ...p, overrides: { ...p.overrides, indentStart } }
}

/**
 * Marker text per paragraph (`undefined` = none). Counters run per level over the whole story
 * (one section): an ordered item counts up its level, any list item resets the deeper levels;
 * non-list paragraphs reset nothing. Bullets print `format` (default '•'), ordered items
 * `formatNumber(count, format)`.
 */
// No list restart; add `ListProps.start?` when users need a second list from 1.
export function listMarkers(story: Story, paras: ItemizedParagraph[]): (string | undefined)[] {
	const c: number[] = []
	return paras.map((ip, i) => {
		const l = ip.style.list
		if (!l || !Array.isArray(story.paragraphs[i].runs)) return undefined
		const lv = levelOf(l)
		if (c.length > lv + 1) c.length = lv + 1
		if (l.kind === 'bullet') return l.format || '•'
		c[lv] = (c[lv] ?? 0) + 1
		return formatNumber(c[lv], l.format || '1.')
	})
}

/**
 * Paint the list markers of an already filled story: at the first line of each list paragraph
 * found in `pages`, `LIST_INDENT` left of the line's text, on its baseline, in the paragraph
 * style's face, size and colour, sharing the paragraph's tag (index + 1).
 */
export function placeMarkers(
	story: Story,
	paras: ItemizedParagraph[],
	pages: PageDL[],
	env: ItemizeEnv
): void {
	const text = listMarkers(story, paras)
	const at = new Map<string, number>()
	for (let i = 0; i < text.length; i++) {
		if (text[i] !== undefined) at.set(story.paragraphs[i].bid, i)
	}
	if (!at.size) return
	for (const pg of pages) {
		for (const l of pg.lines) {
			const i = l.story === story.id ? at.get(l.bid) : undefined
			if (i === undefined) continue
			at.delete(l.bid)
			const ip = paras[i]
			const { size, color } = ip.style
			pg.items.push({
				k: 'glyphs',
				font: ip.font,
				size,
				color,
				x: l.x - LIST_INDENT,
				y: l.y,
				tag: i + 1,
				...textGlyphs(env, ip.font, size, text[i] ?? '', [], ip.lang)
			})
		}
	}
}
