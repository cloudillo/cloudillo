// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The screen-only SVG layer above a page's `PageCanvas` (which draws the display list): link hit
 * boxes, ghost prompts of empty paragraphs (`LineGeom.placeholder`) and "Click to add image" boxes
 * of empty image frames. User units are points. Also home of the image crop geometry shared by
 * the canvas and the frame overlay.
 */

import { type DLItem, FX, type PageDL } from '@cloudillo/typeset'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import type { StoredFrame, YPagilloDocument } from '../crdt/stored-types'
import { masterItems } from '../crdt/type-converters'
import { rotAttr } from '../editor/caret'
import { pageKey } from '../layout/useLayout'

/** Fx → pt. */
const pt = (fx: number) => fx / FX

/** An empty image frame (no `fileId`) on a page, page space Fx. */
export interface EmptyImage {
	id: string
	x: number
	y: number
	w: number
	h: number
	rot: number
}

/** Empty page-anchored image frames by `pageKey`; master items are not drawn. */
export function useEmptyImages(doc: YPagilloDocument | undefined): Map<string, EmptyImage[]> {
	const read = React.useCallback(() => {
		const out = new Map<string, EmptyImage[]>()
		if (!doc) return out
		const master = masterItems(doc)
		doc.f.forEach((f: StoredFrame, id) => {
			if (f.t !== 'img' || master.has(id) || (f.data as { fileId?: string }).fileId) return
			const key = pageKey(f.anchor.sec, f.anchor.page)
			const list = out.get(key) ?? []
			list.push({ id, x: f.x, y: f.y, w: f.w, h: f.h, rot: f.rot })
			out.set(key, list)
		})
		return out
	}, [doc])
	const [frames, setFrames] = React.useState(read)
	React.useEffect(() => {
		if (!doc) return
		const update = () => setFrames(read())
		update()
		doc.f.observeDeep(update)
		doc.ms.observeDeep(update)
		return () => {
			doc.f.unobserveDeep(update)
			doc.ms.unobserveDeep(update)
		}
	}, [doc, read])
	return frames
}

export interface ImageSource {
	ownerTag?: string
	token?: string
}

type ImageItem = Extract<DLItem, { k: 'image' }>
type LinkItem = Extract<DLItem, { k: 'link' }>

export interface Rect {
	x: number
	y: number
	w: number
	h: number
}

/**
 * Crop geometry of frame `box` showing crop `c` (fractions of the source) under `fit`:
 * `r` where the cropped region lands, `full` where the whole source image lands, `clip` the
 * visible part (`r` ∩ `box`). `aspect` = source width / height; without it `r` is the box.
 */
export function cropGeom(
	box: Rect,
	c: Rect,
	fit: ImageItem['fit'],
	aspect?: number
): { r: Rect; full: Rect; clip: Rect } {
	let r = box
	if (fit !== 'fill' && aspect) {
		const ra = (aspect * c.w) / c.h
		const w = (fit === 'cover') === ra > box.w / box.h ? box.h * ra : box.w
		const h = w / ra
		r = { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
	}
	const fw = r.w / c.w
	const fh = r.h / c.h
	const x = Math.max(r.x, box.x)
	const y = Math.max(r.y, box.y)
	return {
		r,
		full: { x: r.x - c.x * fw, y: r.y - c.y * fh, w: fw, h: fh },
		clip: {
			x,
			y,
			w: Math.min(r.x + r.w, box.x + box.w) - x,
			h: Math.min(r.y + r.h, box.y + box.h) - y
		}
	}
}

/** Natural width / height of the image at `url`; undefined until it loads. */
export function useImageAspect(url?: string): number | undefined {
	const [aspect, setAspect] = React.useState<number>()
	React.useEffect(() => {
		if (!url) return
		let live = true
		const img = new Image()
		img.onload = () => {
			if (live && img.naturalHeight) setAspect(img.naturalWidth / img.naturalHeight)
		}
		img.src = url
		return () => {
			live = false
		}
	}, [url])
	return aspect
}

function Link({ it }: { it: LinkItem }) {
	// Authored hrefs: only http(s)/mailto/fragment links are clickable (no `javascript:`).
	if (!/^(https?:|mailto:|#)/i.test(it.href)) return null
	const b = it.box
	const external = !it.href.startsWith('#')
	const a = (
		<a
			href={it.href}
			target={external ? '_blank' : undefined}
			rel={external ? 'noopener noreferrer' : undefined}
		>
			<rect x={pt(b.x)} y={pt(b.y)} width={pt(b.w)} height={pt(b.h)} fill="transparent" />
		</a>
	)
	return it.rot ? (
		<g transform={`rotate(${it.rot.deg} ${pt(it.rot.cx)} ${pt(it.rot.cy)})`}>{a}</g>
	) : (
		a
	)
}

export interface PageSvgOverlayProps {
	dl: PageDL
	emptyImages?: EmptyImage[]
	canEdit?: boolean
}

/** Fills its `position: relative` page box (CSS `.pagillo-page-svg`); only links take pointers. */
export const PageSvgOverlay = React.memo(function PageSvgOverlay({
	dl,
	emptyImages,
	canEdit
}: PageSvgOverlayProps) {
	const { t } = useTranslation()
	const w = pt(dl.page.w)
	const h = pt(dl.page.h)
	return (
		<svg
			className="pagillo-page-svg"
			viewBox={`0 0 ${w} ${h}`}
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			{dl.items.map((it, i) => (it.k === 'link' ? <Link key={i} it={it} /> : null))}
			{dl.lines.map((l, i) =>
				l.placeholder ? (
					<text
						key={`l${i}`}
						x={pt(l.x)}
						y={pt(l.y)}
						fontSize={pt(l.ascent + l.descent) / 1.2}
						transform={rotAttr(l.rot)}
						className="pagillo-ghost"
					>
						{l.placeholder}
					</text>
				) : null
			)}
			{canEdit &&
				emptyImages?.map((f) => (
					<g
						key={f.id}
						transform={`rotate(${f.rot} ${pt(f.x + f.w / 2)} ${pt(f.y + f.h / 2)})`}
					>
						<rect
							x={pt(f.x)}
							y={pt(f.y)}
							width={pt(f.w)}
							height={pt(f.h)}
							className="pagillo-empty-img"
						/>
						<text
							x={pt(f.x + f.w / 2)}
							y={pt(f.y + f.h / 2)}
							textAnchor="middle"
							dominantBaseline="middle"
							className="pagillo-empty-img-label"
						>
							{t('Click to add image')}
						</text>
					</g>
				))}
		</svg>
	)
})

// vim: ts=4
