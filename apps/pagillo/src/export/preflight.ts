// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { TagNode } from '@cloudillo/typeset'

import type { StoredFrame, StoredImageData } from '../crdt/stored-types'
import { effectiveDpi } from '../editor/frames'
import type { LayoutState } from '../layout/useLayout'
import type { EmptyImage } from '../view/PageSvg'
import { pageKey } from '../worker/protocol'

/** One preflight finding; `page` (page key) and `frame` say where Jump goes. */
export interface PreflightRow {
	key: string
	label: string
	page?: string
	frame?: string
}

/** "3–7, 10" (1-based) → 0-based indices, ascending; a string = the error. */
export function parsePageRange(s: string, count: number): number[] | string {
	const out = new Set<number>()
	for (const part of s.split(',')) {
		const p = part.trim()
		if (!p) continue
		const m = /^(\d+)\s*(?:[-–]\s*(\d+))?$/.exec(p)
		if (!m) return p
		const a = Number(m[1])
		const b = m[2] ? Number(m[2]) : a
		if (a < 1 || b < a || b > count) return p
		for (let i = a; i <= b; i++) out.add(i - 1)
	}
	return out.size ? [...out].sort((x, y) => x - y) : s
}

/** A `parsePageRange` error that is just an empty field. */
export const isEmptyRange = (r: number[] | string) => typeof r === 'string' && !/[^,\s]/.test(r)

/**
 * Where the first overset text is: its frame (when it has one) plus the last page of its section,
 * the fallback when the frame is gone or not page-anchored.
 */
export function oversetTarget(
	layout: LayoutState
): Pick<PreflightRow, 'page' | 'frame'> | undefined {
	const o = layout.overset[0]
	if (!o) return
	const pages = layout.sections.find((s) => s.id === o.sec)?.pages ?? 1
	return { page: pageKey(o.sec, pages - 1), frame: o.frame }
}

function findTag(tags: TagNode[], id: number): TagNode | undefined {
	for (const n of tags) {
		if (n.id === id) return n
		const c = n.children && findTag(n.children, id)
		if (c) return c
	}
}

export type Translate = (key: string, opts?: { n: number }) => string

export interface PreflightInput {
	layout: LayoutState
	/** `framesOf(doc)`. */
	frames: [string, StoredFrame][]
	emptyImages: Map<string, EmptyImage[]>
}

/** Export warnings: overset text, empty image frames, low dpi, missing alt text, changed fonts. */
export function preflightRows(
	{ layout, frames, emptyImages }: PreflightInput,
	t: Translate
): PreflightRow[] {
	const rows: PreflightRow[] = []
	const overset = oversetTarget(layout)
	if (overset)
		rows.push({
			key: 'overset',
			label: t('Text does not fit in {{n}} places', { n: layout.overset.length }),
			...overset
		})
	const empties = [...emptyImages].flatMap(([page, list]) =>
		list.map((e) => ({ page, id: e.id }))
	)
	if (empties.length)
		rows.push({
			key: 'empty',
			label: t('{{n}} empty image frames (not exported)', { n: empties.length }),
			page: empties[0].page,
			frame: empties[0].id
		})
	const low: { page: string; id: string }[] = []
	for (const [id, f] of frames) {
		const d = f.data as StoredImageData
		if (f.t !== 'img' || !('sec' in f.anchor) || !d.fileId || !d.px) continue
		if (effectiveDpi(d.px[0], f.w) < 150)
			low.push({ page: pageKey(f.anchor.sec, f.anchor.page), id })
	}
	if (low.length)
		rows.push({
			key: 'dpi',
			label: t('{{n}} images below 150 dpi', { n: low.length }),
			page: low[0].page,
			frame: low[0].id
		})
	const noAlt: { page: string; frame?: string }[] = []
	for (const [key, pg] of layout.pages) {
		for (const it of pg.items) {
			if (it.k !== 'image') continue
			const tag = findTag(pg.tags, it.tag)
			if (tag?.role === 'Figure' && !tag.alt) noAlt.push({ page: key, frame: tag.frame })
		}
	}
	if (noAlt.length)
		rows.push({
			key: 'alt',
			label: t('{{n}} images have no alt text', { n: noAlt.length }),
			...noAlt[0]
		})
	if (layout.fontsChanged)
		rows.push({ key: 'fonts', label: t('Fonts changed since this document was laid out') })
	return rows
}

// vim: ts=4
