// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { FALLBACK_FACE_FAMILY } from '@cloudillo/fonts/metadata'
import { ptToFx } from '../fixed.js'
import type { CharProps, Marks, ParagraphProps, StyleDef } from '../model.js'

/** A paragraph style resolves to its paragraph props plus the base character props of its runs. */
export type ResolvedParagraphStyle = ParagraphProps & CharProps

/** Base values under every style chain. `leading` is absent here: unset → `size * 6 / 5`. */
export const DEFAULT_PARAGRAPH_STYLE: Omit<ResolvedParagraphStyle, 'leading'> = {
	font: FALLBACK_FACE_FAMILY,
	size: ptToFx(11),
	spaceBefore: 0,
	spaceAfter: 0,
	indentStart: 0,
	indentEnd: 0,
	indentFirst: 0,
	align: 'left',
	hyphenate: false,
	lang: '',
	keepNext: false,
	keepTogether: false,
	widows: 2,
	orphans: 2,
	breakBefore: 'none',
	spanColumns: false,
	dropCap: 0,
	weight: 400,
	italic: false,
	color: '#000000',
	underline: false,
	strike: false,
	tracking: 0,
	baselineShift: 0
}

/** Props of `id` and its `basedOn` ancestors, root first. Cycle-safe; unknown ids end the chain. */
function chain(styles: Record<string, StyleDef>, id: string | undefined): StyleDef['props'][] {
	const out: StyleDef['props'][] = []
	const seen = new Set<string>()
	while (id !== undefined && !seen.has(id)) {
		seen.add(id)
		const s = styles[id]
		if (!s) break
		out.unshift(s.props)
		id = s.basedOn
	}
	return out
}

export function resolveParagraphStyle(
	styles: Record<string, StyleDef>,
	id: string,
	overrides: Partial<ParagraphProps> = {}
): ResolvedParagraphStyle {
	const r: Partial<ResolvedParagraphStyle> = { ...DEFAULT_PARAGRAPH_STYLE }
	for (const props of chain(styles, id)) Object.assign(r, props)
	Object.assign(r, overrides)
	r.leading ??= Math.round(((r.size as number) * 6) / 5)
	return r as ResolvedParagraphStyle
}

/** Character props of a run: paragraph base ← `marks.cs` chain ← marks (`bold` → weight 700/400). */
export function resolveCharStyle(
	styles: Record<string, StyleDef>,
	base: CharProps,
	marks: Marks
): CharProps {
	const r: CharProps = {
		font: base.font,
		weight: base.weight,
		italic: base.italic,
		size: base.size,
		color: base.color,
		underline: base.underline,
		strike: base.strike,
		tracking: base.tracking,
		baselineShift: base.baselineShift
	}
	for (const props of chain(styles, marks.cs)) Object.assign(r, props)
	if (marks.bold !== undefined) r.weight = marks.bold ? 700 : 400
	if (marks.italic !== undefined) r.italic = marks.italic
	if (marks.underline !== undefined) r.underline = marks.underline
	if (marks.strike !== undefined) r.strike = marks.strike
	if (marks.color !== undefined) r.color = marks.color
	if (marks.font !== undefined) r.font = marks.font
	if (marks.size !== undefined) r.size = marks.size
	return r
}
