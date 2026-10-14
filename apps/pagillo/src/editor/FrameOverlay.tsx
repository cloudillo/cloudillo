// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The frame layer. `useFrames` wraps the editor's page pointer callback (frames are hit first)
 * and owns the frame selection: canvas-tools gizmos (move, resize with aspect lock — images
 * locked, Shift toggles — rotate with 15° snap inside the arc's inner zone or on Shift),
 * snapping (magenta lines, 4 px, Alt suspends), marquee in Edit layout, hover cue and cursor,
 * frame keys on a focused key target, image insert (inline at the caret, else page-anchored),
 * text boxes, the ghost-page bar, contextual rulers and Edit layout (master items and drawn text
 * areas, rest dimmed).
 */

import {
	calculateResizeBounds,
	getAngleFromCenter,
	initResizeState,
	type ResizeHandle,
	type ResizeState,
	RotationHandle,
	rotatePointAroundCenter
} from '@cloudillo/canvas-tools'
import { getAppBus } from '@cloudillo/core'
import { Button, useFileImage } from '@cloudillo/react'
import { FX, type Region, trackCount } from '@cloudillo/typeset'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuPin } from 'react-icons/lu'
import type * as Y from 'yjs'

import {
	addFrame,
	canLinkTarget,
	chainOf,
	deleteFrame,
	embedImgAt,
	FULL_CROP,
	findInlineImage,
	frameToInline,
	inlineImageBid,
	inlineToFrame,
	insertImageParagraph,
	type LinkRefusal,
	linkFrame,
	soleInlineImage,
	updateFrame
} from '../crdt/frame-ops'
import { newId } from '../crdt/ids'
import { layoutTx as masterLayoutTx, updateMaster, withAreas } from '../crdt/master-ops'
import { flipRegion, isRtlLang, mirrorFrame, textChains } from '../crdt/type-converters'
import type {
	StoredFrame,
	StoredImageData,
	StoredTextFrameData,
	YPagilloDocument
} from '../crdt/stored-types'
import type { LayoutState } from '../layout/useLayout'
import { flattenPages, type PageHit, scrollToPage } from '../view/PageList'
import { cropGeom, type ImageSource, type Rect, useImageAspect } from '../view/PageSvg'
import { PageRulers, type RulerIndents } from '../view/Ruler'
import { lineAt, selFrom, selTo, storyText } from './caret'
import * as Cmd from './commands'
import {
	type Box,
	boxOf,
	clamp,
	containsPoint,
	flowRegions,
	gridLines,
	guideBoxes,
	gutterEdges,
	IMPLICIT_REGION,
	marginBox,
	type PageInfo,
	type PageItem,
	pageItems,
	pageMaster,
	readingOrder,
	rotArcRadius,
	rotateTo,
	rotatedBounds,
	type SnapLine,
	snapAt,
	snapBox,
	snapTargets
} from './frames'
import { hitFrame, nearArea, textAreas } from './hit-test'
import { IS_MAC } from './keymap'
import { deleteRange, insertText } from './text-edit'
import type { Editor } from './useEditor'

const PREFS_KEY = 'pagillo.view'
const DEFAULT_PREFS: ViewPrefs = { rulers: false, snap: true, keyHints: true, guides: true }
/** Resize handles: id, x and y fraction of the box. */
const HANDLES: [ResizeHandle, number, number][] = [
	['nw', 0, 0],
	['n', 0.5, 0],
	['ne', 1, 0],
	['e', 1, 0.5],
	['se', 1, 1],
	['s', 0.5, 1],
	['sw', 0, 1],
	['w', 0, 0.5]
]

/** Selected items of one page (frame ids, or region ids in Edit layout). */
export interface FrameSelection {
	ids: string[]
	/** Global page index. */
	page: number
}

/** View toggles: rulers pinned, snapping on, status-bar key hints. */
export interface ViewPrefs {
	rulers: boolean
	snap: boolean
	keyHints: boolean
	/** Edit layout: margin, column-grid and row-grid guides. */
	guides: boolean
}

type Drag =
	| {
			k: 'move'
			page: number
			x0: number
			y0: number
			start: Map<string, Box>
			moved: boolean
			pick?: string
	  }
	| {
			k: 'resize'
			page: number
			id: string
			st: ResizeState
			rot: number
			aspect?: number
			/** Start box of a text area (Edit layout): only areas snap while resizing. */
			region?: Box
	  }
	| { k: 'marquee'; page: number; x0: number; y0: number; moved: boolean }
	/** Link mode: drawing a new follower text box on empty page space. */
	| { k: 'link'; page: number; x0: number; y0: number; moved: boolean }
	/** Crop mode: pan (no `corner`) or zoom from a ghost corner; frame-local Fx. */
	| {
			k: 'crop'
			page: number
			x0: number
			y0: number
			/** Frame box at the press (its rotation maps the pointer to frame space). */
			b: Box
			c0: Rect
			r: Rect
			full: Rect
			corner?: [number, number]
	  }

/** Page point → the unrotated space of frame `b` (rotation is about its centre). */
const toLocal = (b: Box, x: number, y: number) =>
	rotatePointAroundCenter({ x, y }, { x: b.x + b.w / 2, y: b.y + b.h / 2 }, -b.rot)

/**
 * CSS px point `d` CSS px outside frame `b`'s right (`side` 1) or left (-1) edge at height
 * fraction `fy`, rotated with the frame (`scale` = CSS px per pt).
 */
const edgePt = (b: Box, scale: number, side: number, fy: number, d: number) => {
	const off = (d / scale) * FX
	const p = rotatePointAroundCenter(
		{ x: side > 0 ? b.x + b.w + off : b.x - off, y: b.y + b.h * fy },
		{ x: b.x + b.w / 2, y: b.y + b.h / 2 },
		b.rot
	)
	return { x: (p.x / FX) * scale, y: (p.y / FX) * scale }
}

/**
 * The crop for a crop drag at frame-space `x`/`y`: a pan moves the image within its free
 * travel; a ghost corner scales it about the opposite corner, zoom clamped to 100–800%.
 */
export function cropDrag(d: Extract<Drag, { k: 'crop' }>, x: number, y: number): Rect {
	const { c0, r, full, corner } = d
	if (!corner)
		return {
			...c0,
			x: clamp(c0.x - (x - d.x0) / full.w, 0, 1 - c0.w),
			y: clamp(c0.y - (y - d.y0) / full.h, 0, 1 - c0.h)
		}
	const ax = full.x + (1 - corner[0]) * full.w
	const ay = full.y + (1 - corner[1]) * full.h
	const s = Math.max(Math.abs(x - ax) / full.w, Math.abs(y - ay) / full.h, 1e-3)
	const w = clamp(c0.w / s, 1 / 8, 1)
	const fw = r.w / w
	const fh = r.h / w
	return {
		x: clamp((r.x - ax + (1 - corner[0]) * fw) / fw, 0, 1 - w),
		y: clamp((r.y - ay + (1 - corner[1]) * fh) / fh, 0, 1 - w),
		w,
		h: w
	}
}

/** Crop session: the frame, its page and the live crop (committed once on exit). */
interface CropState {
	id: string
	page: number
	c: Rect
}

interface Live {
	page: number
	boxes?: Map<string, Box>
	lines?: SnapLine[]
	rect?: Box
	rotating?: boolean
	snap?: boolean
	guides?: boolean
}

export interface UseFramesOptions {
	yDoc: Y.Doc
	doc: YPagilloDocument
	editor: Editor
	layout: LayoutState
	/** Frame editing allowed (`canLayout`). */
	canEdit: boolean
	/** Edit layout mode: the master id being edited. */
	layoutEdit?: string
	/** This document's file id (media picker visibility check). */
	fileId?: string
	/** Global index of the current page (insert target without a selection). */
	current: number
	/** Keys the frame layer does not handle while a frame is selected (undo/redo). */
	onKey?(e: KeyboardEvent): boolean
	/** Frames a remote user is dragging → their name; no gizmo on those. */
	locked?: Map<string, string>
	/** Image owner/token: the crop ghost loads the frame's image. */
	src?: ImageSource
}

export interface FrameCtl {
	sel?: FrameSelection
	select(s?: FrameSelection): void
	/** `PageList.onPagePointer`: frames first, then the editor. */
	onPointer(type: 'down' | 'move' | 'up', hit: PageHit, e: React.PointerEvent): void
	/** `PageList.overlay` part of the frame layer. */
	overlay(index: number, size: { w: number; h: number }, scale: number): React.ReactNode
	/** Esc in text: select the text box holding the caret (editor `onKey`). */
	fromText(e: KeyboardEvent): boolean
	/** Hidden focus target receiving the frame keys; render once. */
	keyTarget: React.ReactNode
	insertImage(): Promise<void>
	insertTextBox(): void
	/** Choose / replace the image of an `img` frame. */
	pick(id: string): Promise<void>
	toInline(id: string): void
	toFrame(story: string, offset: number): void
	sizeToImage(id: string): void
	remove(): void
	view: ViewPrefs
	setView(p: Partial<ViewPrefs>): void
	/** Bumped after an image insert: the Format tab focuses Alt text. */
	focusAlt: number
	/** A move / resize / rotate is in progress (awareness `active`). */
	active: boolean
	/** On-canvas crop session of an image frame. */
	crop?: { id: string; page: number }
	startCrop(id: string): void
	/** Leave crop mode, committing the crop as one undo step. */
	endCrop(): void
	/** Armed link mode: the text frame whose thread a click / drag continues. */
	link?: { id: string }
	startLink(id: string): void
	endLink(): void
	/** Link mode: why the hovered frame can't be linked. */
	linkRefusal?: LinkRefusal
	/** "New linked text box": a follower of `id`, same size, +24 pt, same page; selected. */
	newLinked(id: string): void
	/** Global page index of a frame's anchor page (-1 when not laid out). */
	pageOf(id: string): number
}

/** Link refusal hints (English keys, translated at use). */
export const LINK_REFUSALS: Record<LinkRefusal, string> = {
	hasText: 'This text box has its own text · empty it first',
	inThread: 'Already part of a thread',
	layoutItem: "Layout items can't be linked",
	notText: 'Only text boxes can be linked'
}

function readPrefs(): ViewPrefs {
	try {
		return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }
	} catch {
		return DEFAULT_PREFS
	}
}

const round = (b: Box): Box => ({
	x: Math.round(b.x),
	y: Math.round(b.y),
	w: Math.round(b.w),
	h: Math.round(b.h),
	rot: b.rot
})

export function useFrames({
	yDoc,
	doc,
	editor,
	layout,
	canEdit,
	layoutEdit,
	fileId,
	current,
	onKey,
	locked,
	src
}: UseFramesOptions): FrameCtl {
	const { t } = useTranslation()
	const [sel, setSel] = React.useState<FrameSelection>()
	const [live, setLive] = React.useState<Live>()
	const [view, setViewState] = React.useState<ViewPrefs>(readPrefs)
	const [focusAlt, setFocusAlt] = React.useState(0)
	/** Hovered frame (`id`) or inline image (`bid`) on `page` (hover cue). */
	const [hover, setHover] = React.useState<{ page: number; id?: string; bid?: string }>()
	const [, setVer] = React.useState(0)
	const drag = React.useRef<Drag | undefined>(undefined)
	const liveRef = React.useRef<Live | undefined>(undefined)
	const keyEl = React.useRef<HTMLDivElement>(null)
	const [crop, setCrop] = React.useState<CropState>()
	const [link, setLink] = React.useState<{ id: string }>()
	const [linkRefusal, setLinkRefusal] = React.useState<LinkRefusal>()
	/** Last frame press, for the double-click that enters crop mode. */
	const lastDown = React.useRef({ t: 0, x: 0, y: 0, id: '' })
	const cf = crop ? doc.f.get(crop.id) : undefined
	const cd = cf?.t === 'img' ? (cf.data as StoredImageData) : undefined
	// Variant sized for 2× the frame at 100% zoom; pass the page scale if it blurs.
	const cz = crop ? 2 / FX / Math.max(0.01, crop.c.w) : 0
	const { url: cropUrl } = useFileImage(
		cd?.fileId ? src?.ownerTag : undefined,
		cd?.fileId ?? '',
		(cf?.w ?? 0) * cz,
		(cf?.h ?? 0) * cz,
		src?.token
	)
	const natural = useImageAspect(cd?.px ? undefined : cropUrl)
	const cropAspect = cd?.px ? cd.px[0] / cd.px[1] : natural

	React.useEffect(() => {
		const up = () => setVer((v) => v + 1)
		doc.f.observeDeep(up)
		doc.ms.observeDeep(up)
		return () => {
			doc.f.unobserveDeep(up)
			doc.ms.unobserveDeep(up)
		}
	}, [doc])
	// Leaving / entering Edit layout drops the selection (and an uncommitted crop).
	React.useEffect(() => {
		setSel(undefined)
		setCrop(undefined)
		setLink(undefined)
		setLinkRefusal(undefined)
	}, [layoutEdit])
	// Link mode: a press outside the pages (panel, toolbar…) disarms; page presses go to `onPointer`.
	React.useEffect(() => {
		if (!link) return
		const down = (e: PointerEvent) => {
			if (!(e.target as Element).closest?.('.pagillo-pages')) {
				setLink(undefined)
				setLinkRefusal(undefined)
			}
		}
		document.addEventListener('pointerdown', down)
		return () => document.removeEventListener('pointerdown', down)
	}, [link])

	const pages = React.useMemo(() => flattenPages(layout.sections), [layout.sections])
	const info = (i: number): PageInfo | undefined => {
		const p = pages[i]
		return p && layout.pages.get(p.key)?.page
	}
	const items = (i: number): PageItem[] => {
		const pg = info(i)
		return pg && canEdit ? pageItems(doc, pg, layoutEdit) : []
	}
	/** Inline image items of page `i` (DL `image`/`embed` whose tag carries a paragraph bid). */
	const inlineImages = (i: number): { bid: string; box: Box }[] => {
		const p = pages[i]
		const dl = p && layout.pages.get(p.key)
		if (!dl) return []
		const out: { bid: string; box: Box }[] = []
		for (const it of dl.items) {
			if (it.k !== 'image' && it.k !== 'embed') continue
			const bid = dl.tags.find((n) => n.id === it.tag)?.bid
			if (bid) out.push({ bid, box: { ...it.box, rot: 0 } })
		}
		return out
	}
	/** Paragraph bid of the inline image the text selection covers (outlined). */
	const es = editor.sel
	const esTx = es && !layoutEdit ? doc.tx.get(es.story) : undefined
	const esImg = es && esTx ? soleInlineImage(esTx, selFrom(es), selTo(es)) : undefined
	const selBid = esTx && esImg !== undefined ? inlineImageBid(esTx, esImg) : undefined
	const show = (l?: Live) => {
		liveRef.current = l
		setLive(l)
	}
	const select = (s?: FrameSelection) => {
		if (crop && !s?.ids.includes(crop.id)) endCrop()
		setSel(s)
		if (s) keyEl.current?.focus({ preventScroll: true })
	}

	/** Crop mode on an image frame with an image. */
	const startCrop = (id: string) => {
		const f = doc.f.get(id)
		const d = f?.t === 'img' ? (f.data as StoredImageData) : undefined
		if (!f || !d?.fileId || locked?.has(id)) return
		const page = sel?.ids.includes(id)
			? sel.page
			: pages.findIndex((p) => p.sec === f.anchor.sec && p.index === f.anchor.page)
		if (page < 0) return
		select({ ids: [id], page })
		setCrop({ id, page, c: d.crop ?? FULL_CROP })
	}

	const endCrop = () => {
		if (!crop) return
		setCrop(undefined)
		const f = doc.f.get(crop.id)
		const d = f?.t === 'img' ? (f.data as StoredImageData) : undefined
		const r4 = (v: number) => Math.round(v * 1e4) / 1e4
		const w = r4(crop.c.w)
		const c = { x: r4(crop.c.x), y: r4(crop.c.y), w, h: w }
		const old = d?.crop ?? FULL_CROP
		if (d && (c.x !== old.x || c.y !== old.y || c.w !== old.w || c.h !== old.h))
			updateFrame(yDoc, doc, crop.id, { data: { ...d, crop: c } })
	}

	const pageOf = (id: string): number => {
		const f = doc.f.get(id)
		return f ? pages.findIndex((p) => p.sec === f.anchor.sec && p.index === f.anchor.page) : -1
	}

	/** Link mode from text frame `id` (page frames only; not in Edit layout). */
	const startLink = (id: string) => {
		if (layoutEdit || doc.f.get(id)?.t !== 'txt') return
		if (crop) endCrop()
		setLinkRefusal(undefined)
		setLink({ id })
	}

	const endLink = () => {
		setLink(undefined)
		setLinkRefusal(undefined)
	}

	/** Link `target` to the thread of `from`; leaves link mode and selects it. */
	const linkTo = (from: string, target: string, page: number) => {
		if (!linkFrame(yDoc, doc, from, target)) return
		endLink()
		select({ ids: [target], page })
	}

	/** A new empty follower text box of `from` at `b` on `page`: one undo step. */
	const addFollower = (from: string, page: number, b: Box) => {
		const pg = info(page)
		if (!pg) return
		let id: string | undefined
		yDoc.transact(() => {
			id = addFrame(yDoc, doc, {
				t: 'txt',
				anchor: { sec: pg.sec, page: pg.index },
				...round(b),
				z: 1,
				wrap: { mode: 'box', off: 6 * FX },
				data: {}
			})
			if (!linkFrame(yDoc, doc, from, id)) {
				deleteFrame(yDoc, doc, id)
				id = undefined
			}
		}, yDoc.clientID)
		endLink()
		if (id) select({ ids: [id], page })
	}

	const newLinked = (id: string) => {
		const f = doc.f.get(id)
		const page = pageOf(id)
		const pg = info(page)
		if (!f || !pg) return
		const off = 24 * FX
		addFollower(id, page, {
			x: clamp(f.x + off, 0, Math.max(0, pg.w - f.w)),
			y: clamp(f.y + off, 0, Math.max(0, pg.h - f.h)),
			w: f.w,
			h: f.h,
			rot: f.rot
		})
	}

	/** Crop geometry of page `i` in Fx (frame box `b` overrides the stored one). */
	const cropAt = (i: number, b?: Box) => {
		const on = crop?.page === i && sel?.ids.includes(crop.id)
		const it = on ? items(i).find((x) => x.id === crop.id) : undefined
		if (!crop || !it || !cd) return
		const box = b ?? boxOf(it)
		return { box, ...cropGeom(box, crop.c, cd.fit, cropAspect) }
	}
	const setView = (p: Partial<ViewPrefs>) =>
		setViewState((v) => {
			const next = { ...v, ...p }
			localStorage.setItem(PREFS_KEY, JSON.stringify(next))
			return next
		})

	/** One transaction for a write from Edit layout: the implicit area materializes first. */
	const layoutTx = <T,>(f: () => T): T => masterLayoutTx(yDoc, doc, layoutEdit, f)

	/**
	 * Write a master's text areas on the page's side (variant when it has its own). Runs
	 * `ensureRegions` first in the same transaction, so `fn` sees the implicit area as a region.
	 */
	const setRegions = (pg: PageInfo, fn: (rs: Region[]) => Region[]) =>
		masterLayoutTx(yDoc, doc, pg.master, () => {
			const pm = pageMaster(doc, pg)
			if (!pm) return
			const rs = fn(pm.regions)
			// Mirrored left page: back to base (right-hand) coordinates.
			updateMaster(
				yDoc,
				doc,
				pg.master,
				withAreas(
					pm.m,
					pm.side ?? 'base',
					pm.mirrored ? rs.map((r) => flipRegion(r, pg.w)) : rs
				)
			)
		})

	/** One undoable write of new boxes for items of `page`. */
	const commit = (page: number, boxes: Map<string, Box>) => {
		const pg = info(page)
		if (!pg) return
		const its = items(page)
		// Master items on a mirrored left page are shown flipped; store base coordinates.
		const mirrored = !!layoutEdit && !!pageMaster(doc, pg)?.mirrored
		// The implicit area becomes real first; its sentinel box maps to the new id.
		masterLayoutTx(yDoc, doc, layoutEdit ? pg.master : undefined, (nid) => {
			const regs = new Map<string, Box>()
			for (const [id, raw] of boxes) {
				const b = round(raw)
				const it = its.find((x) => x.id === id)
				if (it?.kind === 'region') regs.set(id, b)
				else if (it) {
					const s = it.master && mirrored ? mirrorFrame(b, pg.w) : b
					updateFrame(yDoc, doc, id, { x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot })
				}
			}
			if (regs.size)
				setRegions(pg, (rs) =>
					rs.map((r) => {
						const b =
							regs.get(r.id) ?? (r.id === nid ? regs.get(IMPLICIT_REGION) : undefined)
						return b ? { ...r, x: b.x, y: b.y, w: b.w, h: b.h } : r
					})
				)
		})
	}

	const remove = () => {
		if (!sel) return
		const pg = info(sel.page)
		const its = items(sel.page)
		// Deleting the implicit area materializes it and removes it again: a no-op.
		masterLayoutTx(yDoc, doc, layoutEdit && pg ? pg.master : undefined, (nid) => {
			const regs = new Set<string>()
			for (const id of sel.ids) {
				const it = its.find((x) => x.id === id)
				if (it?.kind === 'region') regs.add(id === IMPLICIT_REGION ? (nid ?? id) : id)
				else if (it) deleteFrame(yDoc, doc, id)
			}
			if (regs.size && pg) setRegions(pg, (rs) => rs.filter((r) => !regs.has(r.id)))
		})
		setCrop(undefined)
		endLink()
		setSel(undefined)
		editor.focus()
	}

	/** Insert target page: the selection's, else the current one (Edit layout: a page using it). */
	const targetPage = (): number => {
		if (sel) return sel.page
		if (layoutEdit) {
			const i = pages.findIndex((p) => layout.pages.get(p.key)?.page.master === layoutEdit)
			if (i >= 0) return i
		}
		return current
	}

	const pickImage = async () => {
		const r = await getAppBus().pickMedia({
			mediaType: 'image/*',
			documentFileId: fileId,
			title: t('Insert image')
		})
		return r && { fileId: r.fileId, px: r.dim }
	}

	const pick = async (id: string) => {
		const f = doc.f.get(id)
		if (f?.t !== 'img') return
		const r = await pickImage()
		if (!r) return
		updateFrame(yDoc, doc, id, {
			data: { ...(f.data as StoredImageData), fileId: r.fileId, px: r.px }
		})
		setFocusAlt((n) => n + 1)
	}

	const insertImage = async () => {
		const one = sel?.ids.length === 1 ? doc.f.get(sel.ids[0]) : undefined
		if (sel && one?.t === 'img' && !(one.data as StoredImageData).fileId)
			return pick(sel.ids[0])
		const r = await pickImage()
		if (!r) return
		const [pw, ph] = r.px ?? [400, 300]
		if (editor.sel && !layoutEdit && !sel) {
			// Inline: its own paragraph; the engine scales it to the column width.
			editor.run((tx, from, to) => {
				deleteRange(tx, from, to)
				let at = from
				if (at > 0 && storyText(tx)[at - 1] !== '\n') at = insertText(tx, at, '\n')
				insertImageParagraph(tx, at, { fileId: r.fileId, w: pw * FX, h: ph * FX, alt: '' })
				return at + 2
			})
			return
		}
		const page = targetPage()
		const pg = info(page)
		if (!pg) return
		const mb = marginBox(doc, pg)
		let w = Math.min(pw * FX, mb.w)
		let h = (w * ph) / pw
		if (h > mb.h) {
			h = mb.h
			w = (h * pw) / ph
		}
		const id = layoutTx(() =>
			addFrame(
				yDoc,
				doc,
				{
					t: 'img',
					anchor: { sec: pg.sec, page: pg.index },
					...round({ x: mb.x + (mb.w - w) / 2, y: mb.y + (mb.h - h) / 2, w, h, rot: 0 }),
					z: 1,
					wrap: { mode: 'box', off: 6 * FX },
					data: { fileId: r.fileId, px: r.px, crop: FULL_CROP, fit: 'contain', alt: '' }
				},
				{ master: layoutEdit }
			)
		)
		select({ ids: [id], page })
		setFocusAlt((n) => n + 1)
	}

	const insertTextBox = () => {
		// With a caret: on its page, under its line; else centred on the target page.
		const pl =
			es && !sel && !layoutEdit
				? lineAt(editor.index.stories.get(es.story) ?? [], es.head)
				: undefined
		const page = pl?.page ?? targetPage()
		const pg = info(page)
		if (!pg) return
		const mb = marginBox(doc, pg)
		const w = Math.min(200 * FX, mb.w)
		const h = 100 * FX
		const y = pl
			? Math.max(0, Math.min(pl.line.y + pl.line.descent, pg.h - h))
			: mb.y + (mb.h - h) / 2
		const id = layoutTx(() =>
			addFrame(
				yDoc,
				doc,
				{
					t: 'txt',
					anchor: { sec: pg.sec, page: pg.index },
					...round({ x: mb.x + (mb.w - w) / 2, y, w, h, rot: 0 }),
					z: 1,
					wrap: { mode: 'box', off: 6 * FX },
					data: { story: '' }
				},
				{ paras: [{}], master: layoutEdit }
			)
		)
		const story = (doc.f.get(id)?.data as StoredTextFrameData | undefined)?.story
		if (story && !layoutEdit) {
			setSel(undefined)
			editor.select({ story, anchor: 0, head: 0 })
			editor.focus()
		} else select({ ids: [id], page })
	}

	const toInline = (id: string) => {
		const f = doc.f.get(id)
		const story = f && doc.s.get(f.anchor.sec)?.story
		const tx = story && doc.tx.get(story)
		const page = pages.findIndex(
			(p) => f && p.sec === f.anchor.sec && p.index === f.anchor.page
		)
		if (!f || !story || !tx) return
		// The paragraph whose first line sits at or below the frame's top on its page.
		const lines = (editor.index.pages.get(page) ?? []).filter((l) => l.line.story === story)
		const pl = lines.find((l) => l.line.y >= f.y) ?? lines[lines.length - 1]
		const txt = storyText(tx)
		const at = pl ? txt.lastIndexOf('\n', pl.from - 1) + 1 : txt.length - 1
		if (frameToInline(yDoc, doc, id, story, Math.max(0, at))) setSel(undefined)
	}

	const toFrame = (story: string, offset: number) => {
		const tx = doc.tx.get(story)
		const img = tx && embedImgAt(tx, offset)
		if (!img) return
		// Image paragraphs have no LineGeom: place it under the last line before it.
		const before = (editor.index.stories.get(story) ?? []).filter((l) => l.to <= offset)
		const pl = before[before.length - 1]
		const page = pl?.page ?? 0
		const pg = info(page)
		if (!pg) return
		const mb = marginBox(doc, pg)
		const w = Math.min(img.w, mb.w)
		const h = (img.h * w) / Math.max(1, img.w)
		const y = pl ? pl.line.y + pl.line.descent : mb.y
		const id = inlineToFrame(yDoc, doc, story, offset, {
			anchor: { sec: pg.sec, page: pg.index },
			...round({
				x: mb.x + (mb.w - w) / 2,
				y: Math.max(0, Math.min(y, pg.h - h)),
				w,
				h,
				rot: 0
			})
		})
		if (!id) return
		select({ ids: [id], page })
		if (page !== current) scrollToPage(pages[page].key)
	}

	const sizeToImage = (id: string) => {
		const f = doc.f.get(id)
		const d = f?.data as StoredImageData | undefined
		if (!f || !d?.px) return
		updateFrame(yDoc, doc, id, {
			h: Math.round((f.w * d.px[1]) / d.px[0]),
			data: { ...d, fit: 'fill' }
		})
	}

	const fromText = (e: KeyboardEvent): boolean => {
		if (e.key !== 'Escape' || !editor.sel || !canEdit) return false
		const story = editor.sel.story
		for (const [id, f] of doc.f.entries()) {
			if (f.t !== 'txt' || (f.data as StoredTextFrameData).story !== story) continue
			const page = pages.findIndex((p) => p.sec === f.anchor.sec && p.index === f.anchor.page)
			if (page < 0) return false
			select({ ids: [id], page })
			return true
		}
		// The main story: leave the text (Insert image then anchors to the page).
		editor.clear()
		return true
	}

	/** Rotation runs on window listeners: canvas-tools' handle stops pointer propagation. */
	const startRotate = (e: React.PointerEvent, page: number, it: PageItem, scale: number) => {
		const svg = (e.target as SVGElement).ownerSVGElement
		const pg = info(page)
		if (!svg || !pg) return
		const c = { x: it.x + it.w / 2, y: it.y + it.h / 2 }
		const arc = rotArcRadius(it, scale)
		const at = (ev: PointerEvent) => {
			const r = svg.getBoundingClientRect()
			return {
				x: ((ev.clientX - r.left) / r.width) * pg.w,
				y: ((ev.clientY - r.top) / r.height) * pg.h
			}
		}
		const a0 = getAngleFromCenter(c, at(e.nativeEvent))
		const rotOf = (ev: PointerEvent) => rotateTo(it, a0, at(ev), arc, ev.shiftKey)
		const move = (ev: PointerEvent) => {
			const { rot, snap } = rotOf(ev)
			show({ page, rotating: true, snap, boxes: new Map([[it.id, { ...boxOf(it), rot }]]) })
		}
		const up = (ev: PointerEvent) => {
			window.removeEventListener('pointermove', move)
			window.removeEventListener('pointercancel', cancel)
			show(undefined)
			commit(
				page,
				new Map([[it.id, { ...boxOf(it), rot: Math.round(rotOf(ev).rot * 10) / 10 }]])
			)
		}
		const cancel = () => {
			window.removeEventListener('pointermove', move)
			window.removeEventListener('pointerup', up)
			show(undefined)
		}
		window.addEventListener('pointermove', move)
		window.addEventListener('pointerup', up, { once: true })
		window.addEventListener('pointercancel', cancel, { once: true })
	}

	/** A text box's outline grab band: 6 CSS px in page Fx. */
	const grab = (hit: PageHit) => (6 / (hit.scale ?? 1)) * FX

	const onPointer = (type: 'down' | 'move' | 'up', hit: PageHit, e: React.PointerEvent) => {
		const d = drag.current
		// 4 CSS px in page Fx (snap threshold).
		const thr = (4 / (hit.scale ?? 1)) * FX
		if (type === 'down') {
			if (e.button !== 0) return
			const its = items(hit.index)
			const handle = (e.target as Element)
				.closest?.('[data-handle]')
				?.getAttribute('data-handle')
			// Crop mode: a ghost corner zooms, inside the frame pans, outside leaves.
			if (crop && !handle) {
				const g = cropAt(hit.index)
				const corner = (e.target as Element)
					.closest?.('[data-crop]')
					?.getAttribute('data-crop')
				if (g && (corner || containsPoint(g.box, hit.x, hit.y))) {
					const p = toLocal(g.box, hit.x, hit.y)
					drag.current = {
						k: 'crop',
						page: hit.index,
						x0: p.x,
						y0: p.y,
						b: g.box,
						c0: crop.c,
						r: g.r,
						full: g.full,
						corner: corner
							? (corner.split(',').map(Number) as [number, number])
							: undefined
					}
					return
				}
				endCrop()
			}
			// Link mode: a frame links (or stays armed when refused); empty page space draws one.
			if (link && !handle) {
				const lh = hitFrame(its, hit.x, hit.y, { mod: true, alt: false, layout: false })
				if (lh) {
					if (lh.id !== link.id) linkTo(link.id, lh.id, hit.index)
					return
				}
				const pg = info(hit.index)
				if (pg && hit.x >= 0 && hit.y >= 0 && hit.x <= pg.w && hit.y <= pg.h) {
					const p = snapPoint(pg, hit.index, hit.x, hit.y, thr, e.altKey)
					drag.current = { k: 'link', page: hit.index, x0: p.x, y0: p.y, moved: false }
				} else endLink()
				return
			}
			const one =
				sel?.ids.length === 1 && sel.page === hit.index
					? its.find((it) => it.id === sel.ids[0])
					: undefined
			if (handle && one) {
				const d0 = one.frame?.t === 'img' ? (one.frame.data as StoredImageData) : undefined
				const lock = !!d0?.fileId !== e.shiftKey
				drag.current = {
					k: 'resize',
					page: hit.index,
					id: one.id,
					rot: one.rot,
					aspect: lock ? one.w / one.h : undefined,
					region: one.kind === 'region' ? boxOf(one) : undefined,
					st: initResizeState(
						{ x: hit.x, y: hit.y },
						handle as ResizeHandle,
						{ x: one.x, y: one.y, width: one.w, height: one.h },
						{ x: 0.5, y: 0.5 },
						one.rot
					)
				}
				return
			}
			const mod = IS_MAC ? e.metaKey : e.ctrlKey
			const h = hitFrame(its, hit.x, hit.y, {
				mod,
				alt: e.altKey,
				current: sel?.ids[0],
				layout: !!layoutEdit,
				edge: grab(hit)
			})
			if (h?.kind === 'frame') {
				// A double-click on an image frame enters crop mode.
				const ld = lastDown.current
				const dbl =
					ld.id === h.id &&
					e.timeStamp - ld.t < 500 &&
					Math.abs(e.clientX - ld.x) < 4 &&
					Math.abs(e.clientY - ld.y) < 4
				Object.assign(ld, { t: e.timeStamp, x: e.clientX, y: e.clientY, id: h.id })
				const hf = doc.f.get(h.id)
				if (dbl && !e.shiftKey && hf?.t === 'img' && (hf.data as StoredImageData).fileId) {
					startCrop(h.id)
					return
				}
				const same = sel?.page === hit.index
				const ids =
					e.shiftKey && same
						? [...new Set([...sel.ids, h.id])]
						: same && sel.ids.includes(h.id)
							? sel.ids
							: [h.id]
				select({ ids, page: hit.index })
				// Only pointer drags are soft-locked; arrow nudges still move a locked frame.
				if (locked?.has(h.id)) return
				const start = new Map<string, Box>()
				for (const it of its) if (ids.includes(it.id)) start.set(it.id, boxOf(it))
				const f = its.find((it) => it.id === h.id)?.frame
				const empty = f?.t === 'img' && !(f.data as StoredImageData).fileId
				drag.current = {
					k: 'move',
					page: hit.index,
					x0: hit.x,
					y0: hit.y,
					start,
					moved: false,
					pick: empty ? h.id : undefined
				}
				return
			}
			// A click on an inline image selects its embed (image paragraphs have no lines).
			const im =
				canEdit && !layoutEdit
					? inlineImages(hit.index).find((m) => containsPoint(m.box, hit.x, hit.y))
					: undefined
			const at = im && findInlineImage(doc, im.bid)
			if (at) {
				setSel(undefined)
				editor.select({ story: at.story, anchor: at.offset, head: at.offset + 1 })
				editor.focus()
				return
			}
			setSel(undefined)
			// The marquee only draws text areas in Edit layout; elsewhere a miss deselects.
			const pg = info(hit.index)
			if (canEdit && pg && layoutEdit && pg.master === layoutEdit) {
				const p = snapPoint(pg, hit.index, hit.x, hit.y, thr, e.altKey)
				drag.current = { k: 'marquee', page: hit.index, x0: p.x, y0: p.y, moved: false }
			}
			if (!layoutEdit) editor.onPointer('down', hit, e)
			return
		}
		if (type === 'move') {
			if (!d) {
				editor.onPointer('move', hit, e)
				if (!e.buttons) hoverAt(hit, e.currentTarget as HTMLElement, e.altKey, thr)
				return
			}
			// A drag never moves a frame to another page (anchor stays).
			if (hit.index !== d.page) return
			if (d.k === 'crop') {
				const p = toLocal(d.b, hit.x, hit.y)
				setCrop((s) => s && { ...s, c: cropDrag(d, p.x, p.y) })
				return
			}
			if (d.k === 'move') {
				let dx = hit.x - d.x0
				let dy = hit.y - d.y0
				if (!d.moved && Math.hypot(dx, dy) < thr) return
				d.moved = true
				const shift = (ox: number, oy: number) =>
					new Map([...d.start].map(([id, b]) => [id, { ...b, x: b.x + ox, y: b.y + oy }]))
				let lines: SnapLine[] = []
				const pg = info(d.page)
				if (view.snap && !e.altKey && pg) {
					const bs = [...shift(dx, dy).values()].map(rotatedBounds)
					const x = Math.min(...bs.map((b) => b.x))
					const y = Math.min(...bs.map((b) => b.y))
					const bb = {
						x,
						y,
						w: Math.max(...bs.map((b) => b.x + b.w)) - x,
						h: Math.max(...bs.map((b) => b.y + b.h)) - y,
						rot: 0
					}
					const s = snapBox(
						bb,
						snapTargets(doc, pg, items(d.page), new Set(d.start.keys()), !!layoutEdit),
						thr
					)
					dx += s.dx
					dy += s.dy
					lines = s.lines
				}
				show({
					page: d.page,
					boxes: shift(dx, dy),
					lines,
					guides: view.snap && !e.altKey
				})
			} else if (d.k === 'resize') {
				// Only text areas snap while resizing (unrotated); frames resize freely.
				const b = calculateResizeBounds(
					d.st,
					{ x: hit.x, y: hit.y },
					4 * FX,
					4 * FX,
					d.aspect
				)
				let [x0, y0, x1, y1] = [b.x, b.y, b.x + b.width, b.y + b.height]
				const lines: SnapLine[] = []
				const pg = info(d.page)
				const r0 = d.region
				if (r0 && view.snap && !e.altKey && pg) {
					const tg = snapTargets(doc, pg, items(d.page), new Set([d.id]), true)
					// Snaps a moved edge `v` (start `v0`); an unchanged edge stays put.
					const edge = (
						v: number,
						v0: number,
						ts: number[],
						line: (at: number) => SnapLine
					) => {
						if (Math.abs(v - v0) < 0.5) return v
						const at = snapAt(v, ts, thr)
						if (at === undefined) return v
						lines.push(line(at))
						return at
					}
					x0 = edge(x0, r0.x, tg.xs, (x) => ({ x }))
					x1 = edge(x1, r0.x + r0.w, tg.xs, (x) => ({ x }))
					y0 = edge(y0, r0.y, tg.ys, (y) => ({ y }))
					y1 = edge(y1, r0.y + r0.h, tg.ys, (y) => ({ y }))
				}
				show({
					page: d.page,
					boxes: new Map([
						[
							d.id,
							{
								x: x0,
								y: y0,
								w: Math.max(4 * FX, x1 - x0),
								h: Math.max(4 * FX, y1 - y0),
								rot: d.rot
							}
						]
					]),
					lines
				})
			} else {
				const moved = d.moved || Math.hypot(hit.x - d.x0, hit.y - d.y0) >= thr
				d.moved = moved
				if (!moved) return
				const pg = info(d.page)
				const { x, y, lines } = pg
					? snapPoint(pg, d.page, hit.x, hit.y, thr, e.altKey)
					: { x: hit.x, y: hit.y, lines: [] }
				show({
					page: d.page,
					rect: {
						x: Math.min(d.x0, x),
						y: Math.min(d.y0, y),
						w: Math.abs(x - d.x0),
						h: Math.abs(y - d.y0),
						rot: 0
					},
					lines
				})
			}
			return
		}
		drag.current = undefined
		const l = liveRef.current
		show(undefined)
		if (!d) {
			editor.onPointer('up', hit, e)
			return
		}
		// The crop is live in `crop`; it commits on leaving crop mode.
		if (d.k === 'crop') return
		if (d.k === 'move') {
			if (d.moved && l?.boxes) commit(d.page, l.boxes)
			else if (d.pick && canEdit) void pick(d.pick)
		} else if (d.k === 'resize') {
			if (l?.boxes) commit(d.page, l.boxes)
		} else if (d.k === 'link') {
			// A click (or a too-small box) on empty space leaves link mode.
			const r = l?.rect
			if (link && d.moved && r && r.w >= 18 * FX && r.h >= 18 * FX)
				addFollower(link.id, d.page, r)
			else endLink()
		} else {
			editor.onPointer('up', hit, e)
			const r = l?.rect
			const pg = info(d.page)
			if (!d.moved || !r || !pg) return
			// Drawn text area, appended; one column: the grid is a guide only.
			if (!layoutEdit || r.w < 18 * FX || r.h < 18 * FX) return
			const b = round(r)
			const mb = marginBox(doc, pg)
			setRegions(pg, (rs) => [
				...rs,
				{
					id: newId(),
					x: b.x,
					y: b.y,
					w: b.w,
					h: b.h,
					cols: 1,
					gutter: mb.gutter
				}
			])
		}
	}

	/** Hover cue and the pages' cursor for a pointer moving with no button. */
	// The cue (and the snap lines) stay until the next move over the pages (no pointerleave clear).
	const hoverAt = (hit: PageHit, el: HTMLElement, alt: boolean, thr: number) => {
		const pg = info(hit.index)
		const onPage = !!pg && hit.x >= 0 && hit.y >= 0 && hit.x <= pg.w && hit.y <= pg.h
		if (link) {
			const lh = hitFrame(items(hit.index), hit.x, hit.y, {
				mod: true,
				alt: false,
				layout: false
			})
			const r = lh && lh.id !== link.id ? canLinkTarget(doc, link.id, lh.id) : undefined
			el.style.cursor = !lh
				? onPage
					? 'crosshair'
					: 'default'
				: lh.id === link.id
					? 'default'
					: r
						? 'not-allowed'
						: 'copy'
			setLinkRefusal(r)
			setHover((p) =>
				p?.page === hit.index && p.id === lh?.id ? p : lh && { page: hit.index, id: lh.id }
			)
			return
		}
		const h = hitFrame(items(hit.index), hit.x, hit.y, {
			mod: false,
			alt: false,
			layout: !!layoutEdit,
			edge: grab(hit)
		})
		const im =
			!h && canEdit && !layoutEdit
				? inlineImages(hit.index).find((m) => containsPoint(m.box, hit.x, hit.y))
				: undefined
		const next = h
			? { page: hit.index, id: h.id }
			: im
				? { page: hit.index, bid: im.bid }
				: undefined
		el.style.cursor =
			h?.kind === 'frame'
				? 'move'
				: h?.kind === 'text' || im
					? 'text'
					: layoutEdit
						? onPage && pg?.master === layoutEdit
							? 'crosshair'
							: 'default'
						: pg &&
								nearArea(
									textAreas(doc, pg),
									hit.x,
									hit.y,
									(8 / (hit.scale ?? 1)) * FX
								)
							? 'text'
							: 'default'
		setHover((p) =>
			p?.page === next?.page && p?.id === next?.id && p?.bid === next?.bid ? p : next
		)
		// Where a press would start a marquee, show the guides its corner snaps to.
		const draw = canEdit && !h && layoutEdit && onPage && pg?.master === layoutEdit
		const lines = draw && pg ? snapPoint(pg, hit.index, hit.x, hit.y, thr, alt).lines : []
		const key = (ls?: SnapLine[]) => ls?.map((l) => `${l.x}:${l.y}`).join() ?? ''
		const cur = liveRef.current
		if (lines.length) {
			if (cur?.page !== hit.index || key(cur.lines) !== key(lines)) {
				show({ page: hit.index, lines })
			}
		} else if (cur?.lines?.length) show(undefined)
	}

	/** `x`/`y` snapped to the page's guides (Edit layout), with the lines that show it. */
	const snapPoint = (
		pg: PageInfo,
		page: number,
		x: number,
		y: number,
		thr: number,
		alt: boolean
	) => {
		if (!view.snap || alt) return { x, y, lines: [] as SnapLine[] }
		const tg = snapTargets(doc, pg, items(page), new Set(), true)
		const sx = snapAt(x, tg.xs, thr)
		const sy = snapAt(y, tg.ys, thr)
		const lines: SnapLine[] = []
		if (sx !== undefined) lines.push({ x: sx })
		if (sy !== undefined) lines.push({ y: sy })
		return { x: sx ?? x, y: sy ?? y, lines }
	}

	const frameKey = (e: React.KeyboardEvent) => {
		if (!sel) return
		const its = items(sel.page)
		const cur = its.filter((it) => sel.ids.includes(it.id))
		const done = () => {
			e.preventDefault()
			e.stopPropagation()
		}
		switch (e.key) {
			case 'Escape':
				done()
				if (crop) return endCrop()
				if (link) return endLink()
				setSel(undefined)
				editor.focus()
				return
			case 'Tab': {
				done()
				if (e.ctrlKey) {
					for (let p = sel.page + 1; p < pages.length; p++) {
						const o = readingOrder(items(p))
						if (!o.length) continue
						select({ ids: [o[0].id], page: p })
						scrollToPage(pages[p].key)
						return
					}
					return
				}
				const o = readingOrder(its)
				if (!o.length) return
				const i = o.findIndex((it) => it.id === sel.ids[0])
				const n = o[(i + (e.shiftKey ? o.length - 1 : 1) + o.length) % o.length]
				select({ ids: [n.id], page: sel.page })
				return
			}
			case 'ArrowLeft':
			case 'ArrowRight':
			case 'ArrowUp':
			case 'ArrowDown': {
				done()
				const step = (e.shiftKey ? 10 : 1) * FX
				const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
				const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
				commit(
					sel.page,
					new Map(cur.map((it) => [it.id, { ...boxOf(it), x: it.x + dx, y: it.y + dy }]))
				)
				return
			}
			case 'Enter': {
				done()
				if (crop) return endCrop()
				const f = cur.length === 1 ? cur[0].frame : undefined
				if (f?.t === 'img' && (f.data as StoredImageData).fileId) startCrop(cur[0].id)
				else if (f?.t === 'txt') {
					// A follower edits its head's story.
					const head = chainOf(doc, cur[0].id)?.head
					const hf = head ? doc.f.get(head) : f
					const story = (hf?.data as StoredTextFrameData | undefined)?.story
					if (!story) return
					setSel(undefined)
					editor.select({ story, anchor: 0, head: 0 })
					editor.focus()
				} else if (f?.t === 'img' && !(f.data as StoredImageData).fileId)
					void pick(cur[0].id)
				return
			}
			case 'Delete':
			case 'Backspace':
				done()
				remove()
				return
		}
		if (onKey?.(e.nativeEvent)) done()
	}

	/** Ghost page: past its section's text, kept alive only by anchored images. */
	const ghostOf = (i: number) => {
		const p = pages[i]
		const pg = info(i)
		const sec = p && doc.s.get(p.sec)
		if (!pg || !sec) return
		if ((editor.index.pages.get(i) ?? []).some((l) => l.line.story === sec.story)) return
		let last = -1
		for (const pl of editor.index.stories.get(sec.story) ?? [])
			if (pages[pl.page]?.sec === p.sec) last = Math.max(last, pl.page)
		if (last < 0 || last > i) return
		const its = pageItems(doc, pg)
		if (!its.length || its.some((it) => it.frame?.t !== 'img')) return
		return { ids: its.map((it) => it.id), to: last }
	}

	/**
	 * Indent markers for the caret's paragraph when its line is on page `i`. The column
	 * is the text area (or text box) holding the caret line, split by its `cols`/`gutter`.
	 */
	const rulerIndents = (i: number, pg: PageInfo): RulerIndents | undefined => {
		if (!view.rulers || layoutEdit || !es) return
		const pl = lineAt(editor.index.stories.get(es.story) ?? [], es.head)
		const st = pl?.page === i ? Cmd.textState(doc, es) : undefined
		if (!pl || !st) return
		const l = pl.line
		const areas = textAreas(doc, pg)
		const boxed = areas.some((a) => a.story === l.story)
		const a = nearArea(
			areas.filter((b) => (boxed ? b.story === l.story : !b.story)),
			l.x,
			l.y,
			Number.POSITIVE_INFINITY
		)
		if (!a) return
		const r = a as Partial<Region>
		const cols = trackCount(r.cols)
		const gut = r.gutter ?? 0
		const cw = (a.w - (cols - 1) * gut) / cols
		const n = Math.max(0, Math.min(cols - 1, Math.floor((l.x - a.x) / (cw + gut))))
		// Mirrors typeset's unexported LIST_INDENT (18 pt/level); export it if it varies.
		const lo = st.list ? (Math.min(8, st.indent) + 1) * 18 * FX : 0
		const num = (k: string) => Number(st.eff[k]) || 0
		return {
			x: a.x + n * (cw + gut) + lo,
			w: cw - lo,
			start: num('indentStart'),
			end: num('indentEnd'),
			first: num('indentFirst'),
			onChange: (p) => Cmd.setParagraphProps({ yDoc, doc, editor }, p)
		}
	}

	/** Text chains for this render (ports, thread badges, ghost labels). */
	const chains = textChains(doc)

	/**
	 * Thread ports of a selected page text box, outside its box (clear of the resize handles):
	 * out-port at ¾ height past the end edge, in-port (followers) at ¼ past the start edge; RTL
	 * swaps sides. 24 CSS px at every zoom; symbols, never colour alone: empty = thread ends
	 * here, ▸ = continues, + (red) = text doesn't fit.
	 */
	const portsOf = (it: PageItem, b: Box, scale: number) => {
		if (layoutEdit || it.kind !== 'frame' || it.frame?.t !== 'txt' || it.master) return null
		const c = chainOf(doc, it.id, chains)
		const n = c ? c.frames.indexOf(it.id) : 0
		const m = c?.frames.length ?? 1
		// The last laid-out frame carries the overset — not always the chain's last (a follower
		// past its section's pages is never laid out).
		const over = layout.overset.some((o) => o.frame === it.id)
		const rtl = isRtlLang(String(doc.m.get('lang') || 'en'))
		const out = rtl ? -1 : 1
		const arrow = rtl ? '◂' : '▸'
		// The port centre sits 14 CSS px outside the edge.
		const at = (side: number, fy: number): React.CSSProperties => {
			const p = edgePt(b, scale, side, fy, 14)
			return { left: p.x - 12, top: p.y - 12 }
		}
		const outLabel = over
			? t("Text doesn't fit · link to another text box")
			: n < m - 1
				? t('Continues in frame {{n}} of {{m}}', { n: n + 2, m })
				: t('End of text · link to another text box')
		const inLabel = t('Continued from frame {{n}} of {{m}}', { n, m })
		const armed = link?.id === it.id
		return (
			<>
				{n > 0 && (
					<span
						className="pagillo-port pagillo-port-in"
						style={at(-out, 0.25)}
						role="img"
						aria-label={inLabel}
						title={inLabel}
					>
						{arrow}
					</span>
				)}
				<button
					type="button"
					className={`pagillo-port${over ? ' pagillo-port-over' : ''}`}
					style={at(out, 0.75)}
					aria-label={outLabel}
					title={outLabel}
					aria-pressed={armed}
					onPointerDown={(e) => e.stopPropagation()}
					onClick={() => (armed ? endLink() : startLink(it.id))}
				>
					{over ? '+' : n < m - 1 ? arrow : ''}
				</button>
			</>
		)
	}

	const overlay = (i: number, size: { w: number; h: number }, scale: number) => {
		const pg = info(i)
		if (!pg || !canEdit) return null
		const its = items(i)
		const editable = !layoutEdit || pg.master === layoutEdit
		const L = live?.page === i ? live : undefined
		const bx = (it: PageItem): Box => L?.boxes?.get(it.id) ?? boxOf(it)
		const selected = sel?.page === i ? its.filter((it) => sel.ids.includes(it.id)) : []
		const one = selected.length === 1 ? selected[0] : undefined
		const ghost = layoutEdit ? undefined : ghostOf(i)
		const rulers = editable && (view.rulers || !!layoutEdit || selected.length > 0 || !!L)
		const ibox = selBid ? inlineImages(i).find((m) => m.bid === selBid)?.box : undefined
		const hv = hover?.page === i ? hover : undefined
		const hbox =
			hv?.bid && hv.bid !== selBid
				? inlineImages(i).find((m) => m.bid === hv.bid)?.box
				: undefined
		if (!its.length && !layoutEdit && !ghost && !rulers && !ibox && !hbox) return null
		const k = 1 / FX
		const px = 1 / scale
		const hs = 8 * px
		// Edit layout on a page using the edited layout: flow order, area columns, guides.
		const lay = layoutEdit && editable
		const flow = lay ? flowRegions(doc, pg) : []
		const regionNo = new Map(flow.map((r, n) => [r.id, n + 1]))
		const mb = lay ? marginBox(doc, pg) : undefined
		const colsOf = (id: string) =>
			id === IMPLICIT_REGION ? (mb?.cols ?? 1) : (flow.find((r) => r.id === id)?.cols ?? 1)
		const grid = lay && view.guides ? gridLines(doc, pg) : undefined
		// Snap guides while moving: `guideBoxes`, as `snapTargets` snaps to.
		const sg = L?.guides && !layoutEdit ? guideBoxes(doc, pg) : []
		const regionBox = new Map(
			its.filter((it) => it.kind === 'region').map((it) => [it.id, bx(it)])
		)
		const thread = flow
			.map((r) => regionBox.get(r.id))
			.flatMap((b, n, bs) => {
				const nb = bs[n + 1]
				return b && nb
					? [`${(b.x + b.w) * k},${(b.y + b.h) * k} ${nb.x * k},${nb.y * k}`]
					: []
			})
		const ob = one && bx(one)
		const lockedBy = one && locked?.get(one.id)
		const turn = (b: Box) => `rotate(${b.rot} ${(b.x + b.w / 2) * k} ${(b.y + b.h / 2) * k})`
		// Thread of the selected text box: its frames on this page (chain order), a dashed line
		// between their centres, numbered badges, and jump badges to neighbours on other pages.
		const chain =
			!layoutEdit && sel?.ids.length === 1 ? chainOf(doc, sel.ids[0], chains) : undefined
		const here = (chain?.frames ?? []).flatMap((id, n) => {
			const it = its.find((x) => x.id === id)
			return it ? [{ id, n, b: bx(it) }] : []
		})
		const mid = (b: Box) => `${(b.x + b.w / 2) * k},${(b.y + b.h / 2) * k}`
		const threadLines = here.flatMap((a, j) => {
			const z = here[j + 1]
			return z && z.n === a.n + 1 ? [`${mid(a.b)} ${mid(z.b)}`] : []
		})
		const outSide = isRtlLang(String(doc.m.get('lang') || 'en')) ? -1 : 1
		const jumps = here.flatMap(({ n, b }) =>
			([-1, 1] as const).flatMap((dir) => {
				const id = chain?.frames[n + dir]
				const p = id ? pageOf(id) : -1
				if (!id || p < 0 || p === i) return []
				const side = dir * outSide
				const fy = dir > 0 ? 0.75 : 0.25
				return [
					{
						id,
						p,
						dir,
						side,
						a: edgePt(b, scale, side, fy, 0),
						c: edgePt(b, scale, side, fy, 56)
					}
				]
			})
		)
		// Followers on this page: those no line of the story reaches get the ghost label.
		const pageLines = editor.index.pages.get(i) ?? []
		const flowed = new Set<string>()
		const ghosts: { id: string; b: Box; n: number; m: number; story: string }[] = []
		for (const it of layoutEdit ? [] : its) {
			if (it.frame?.t !== 'txt' || it.master || (it.frame.data as StoredTextFrameData).story)
				continue
			const c = chainOf(doc, it.id, chains)
			const story = c && (doc.f.get(c.head)?.data as StoredTextFrameData | undefined)?.story
			if (!c || !story) continue
			// Lines are in the frame's unrotated space (rotation is render-only).
			const b = { ...boxOf(it), rot: 0 }
			const l = pageLines.find(
				(pl) =>
					pl.line.story === story &&
					containsPoint(b, pl.line.x + 1, pl.line.y - pl.line.ascent / 2)
			)
			if (l) flowed.add(it.id)
			else
				ghosts.push({
					id: it.id,
					b: boxOf(it),
					n: c.frames.indexOf(it.id) + 1,
					m: c.frames.length,
					story
				})
		}
		const cIt = crop ? its.find((it) => it.id === crop.id) : undefined
		const cg = cIt && cropAt(i, bx(cIt))
		const cImg = (f: Rect, opacity?: number) => (
			<image
				href={cropUrl}
				x={f.x * k}
				y={f.y * k}
				width={f.w * k}
				height={f.h * k}
				opacity={opacity}
				preserveAspectRatio="none"
			/>
		)
		return (
			<>
				<svg
					width="100%"
					height="100%"
					viewBox={`0 0 ${size.w * k} ${size.h * k}`}
					style={{
						position: 'absolute',
						inset: 0,
						pointerEvents: 'none',
						overflow: 'visible'
					}}
					aria-hidden="true"
				>
					{layoutEdit && (
						<rect
							width={size.w * k}
							height={size.h * k}
							fill="var(--col-surface, #fff)"
							opacity={editable ? 0.55 : 0.75}
						/>
					)}
					{grid && mb && (
						<g stroke="var(--col-primary, #06f)" strokeWidth={px}>
							{grid.xs.map((x, n) =>
								n % 2 ? null : (
									<rect
										key={`c${x}`}
										x={x * k}
										y={mb.y * k}
										width={(grid.xs[n + 1] - x) * k}
										height={mb.h * k}
										fill="var(--col-primary, #06f)"
										fillOpacity={0.12}
									/>
								)
							)}
							{grid.ys.map((y, n) =>
								n % 2 ? null : (
									<rect
										key={`r${y}`}
										x={mb.x * k}
										y={y * k}
										width={mb.w * k}
										height={(grid.ys[n + 1] - y) * k}
										fill="var(--col-primary, #06f)"
										fillOpacity={0.12}
									/>
								)
							)}
							<rect
								x={mb.x * k}
								y={mb.y * k}
								width={mb.w * k}
								height={mb.h * k}
								fill="none"
							/>
						</g>
					)}
					{sg.length > 0 && <SnapGuides boxes={sg} k={k} px={px} />}
					{thread.map((pts) => (
						<polyline
							key={pts}
							points={pts}
							fill="none"
							stroke="var(--col-accent, #0a7)"
							strokeWidth={px}
							strokeDasharray={`${2 * px} ${3 * px}`}
						/>
					))}
					{its.map((it) => {
						const b = bx(it)
						const d =
							it.frame?.t === 'img' ? (it.frame.data as StoredImageData) : undefined
						const isSel = selected.includes(it)
						const isHover = hv?.id === it.id
						// The text box holding the caret keeps its outline while typing.
						const typing =
							it.frame?.t === 'txt' &&
							(it.frame.data as StoredTextFrameData).story === es?.story
						// An empty text box (just its paragraph mark) would be invisible: always outline it.
						// A follower is empty when no line of its thread's story reaches it.
						const fd =
							it.frame?.t === 'txt'
								? (it.frame.data as StoredTextFrameData)
								: undefined
						const blank =
							editable &&
							!!fd &&
							(fd.story
								? (doc.tx.get(fd.story)?.length ?? 0) <= 1
								: !flowed.has(it.id))
						const cue = !(isSel || isHover || typing || layoutEdit)
						return (
							<g key={it.id} transform={turn(b)}>
								{blank && cue && (
									<rect
										x={b.x * k}
										y={b.y * k}
										width={b.w * k}
										height={b.h * k}
										fill="none"
										stroke="var(--col-on-container, #888)"
										strokeOpacity={0.4}
										strokeDasharray={`${4 * px} ${3 * px}`}
										strokeWidth={px}
									/>
								)}
								{!cue && (
									<rect
										x={b.x * k}
										y={b.y * k}
										width={b.w * k}
										height={b.h * k}
										fill="none"
										stroke={
											it.kind === 'region' || (isHover && !isSel && !typing)
												? 'var(--col-accent, #0a7)'
												: 'var(--col-primary, #06f)'
										}
										strokeDasharray={
											it.kind === 'region' ? `${4 * px} ${3 * px}` : undefined
										}
										strokeWidth={(isSel ? 2 : 1) * px}
									/>
								)}
								{it.kind === 'region' && (
									<text
										x={b.x * k + 4 * px}
										y={b.y * k + 14 * px}
										fontSize={12 * px}
										fill="var(--col-accent, #0a7)"
									>
										{it.id === IMPLICIT_REGION
											? t('Main text area')
											: regionNo.get(it.id)}
										{colsOf(it.id) > 1 &&
											` · ${t('{{n}} col', { n: colsOf(it.id) })}`}
									</text>
								)}
								{d?.fileId && !d.alt && !d.deco && (
									<g>
										<title>{t('Missing alt text')}</title>
										<rect
											x={(b.x + b.w) * k - 30 * px}
											y={b.y * k + 4 * px}
											width={26 * px}
											height={14 * px}
											rx={3 * px}
											fill="var(--col-warning, #c80)"
										/>
										<text
											x={(b.x + b.w) * k - 17 * px}
											y={b.y * k + 14.5 * px}
											fontSize={9 * px}
											textAnchor="middle"
											fill="#fff"
										>
											ALT
										</text>
									</g>
								)}
								{(isSel || isHover) && !it.master && (
									<g
										transform={`translate(${(b.x + b.w) * k + 4 * px} ${b.y * k - 18 * px})`}
									>
										<title>{t('Anchored to this page')}</title>
										<LuPin size={14 * px} color="var(--col-primary, #06f)" />
									</g>
								)}
							</g>
						)
					})}
					{cg && cropUrl && (
						// Ghost: the whole image at 40%, the live crop at full strength in the frame.
						<g transform={turn(cg.box)}>
							{cImg(cg.full, 0.4)}
							<svg
								x={cg.clip.x * k}
								y={cg.clip.y * k}
								width={cg.clip.w * k}
								height={cg.clip.h * k}
								viewBox={`${cg.clip.x * k} ${cg.clip.y * k} ${cg.clip.w * k} ${cg.clip.h * k}`}
							>
								{cImg(cg.full)}
							</svg>
							<rect
								x={cg.box.x * k}
								y={cg.box.y * k}
								width={cg.box.w * k}
								height={cg.box.h * k}
								fill="none"
								stroke="var(--col-primary, #06f)"
								strokeWidth={2 * px}
							/>
							<g style={{ pointerEvents: 'all' }}>
								{[
									[0, 0],
									[1, 0],
									[1, 1],
									[0, 1]
								].map(([fx, fy]) => (
									<circle
										key={`${fx},${fy}`}
										data-crop={`${fx},${fy}`}
										cx={(cg.full.x + cg.full.w * fx) * k}
										cy={(cg.full.y + cg.full.h * fy) * k}
										r={hs / 2 + px}
										fill="var(--col-primary, #06f)"
										stroke="#fff"
										strokeWidth={px}
										style={{
											cursor: fx === fy ? 'nwse-resize' : 'nesw-resize'
										}}
									/>
								))}
							</g>
						</g>
					)}
					{ibox && (
						<rect
							className="pagillo-inline-sel"
							x={ibox.x * k}
							y={ibox.y * k}
							width={ibox.w * k}
							height={ibox.h * k}
						/>
					)}
					{hbox && (
						<rect
							className="pagillo-inline-hover"
							x={hbox.x * k}
							y={hbox.y * k}
							width={hbox.w * k}
							height={hbox.h * k}
						/>
					)}
					{one && ob && lockedBy && (
						<text
							x={ob.x * k}
							y={ob.y * k - 6 * px}
							fontSize={11 * px}
							fill="var(--col-primary, #06f)"
						>
							{t('{{name}} is moving this', { name: lockedBy })}
						</text>
					)}
					{one && ob && !lockedBy && (
						<g transform={turn(ob)} style={{ pointerEvents: 'all' }}>
							{/* Cropping: frame corners give way to the ghost's zoom corners (edges still resize). */}
							{HANDLES.filter(([h]) => !cg || h.length === 1).map(([h, fx, fy]) => (
								<rect
									key={h}
									data-handle={h}
									x={(ob.x + ob.w * fx) * k - hs / 2}
									y={(ob.y + ob.h * fy) * k - hs / 2}
									width={hs}
									height={hs}
									fill="#fff"
									stroke="var(--col-primary, #06f)"
									strokeWidth={px}
									style={{ cursor: `${h}-resize` }}
								/>
							))}
						</g>
					)}
					{one && ob && !lockedBy && one.kind === 'frame' && (
						<g style={{ pointerEvents: 'all' }}>
							<RotationHandle
								bounds={{
									x: ob.x * k,
									y: ob.y * k,
									width: ob.w * k,
									height: ob.h * k
								}}
								rotation={ob.rot}
								scale={scale}
								isRotating={!!L?.rotating}
								isSnapActive={!!L?.snap}
								onRotateStart={(e) => startRotate(e, i, one, scale)}
							/>
						</g>
					)}
					{L?.lines?.map((l, j) =>
						l.x !== undefined ? (
							<line
								key={j}
								x1={l.x * k}
								x2={l.x * k}
								y1={0}
								y2={size.h * k}
								stroke="magenta"
								strokeWidth={px}
							/>
						) : (
							<line
								key={j}
								x1={0}
								x2={size.w * k}
								y1={(l.y ?? 0) * k}
								y2={(l.y ?? 0) * k}
								stroke="magenta"
								strokeWidth={px}
							/>
						)
					)}
					{L?.rect && (
						<rect
							x={L.rect.x * k}
							y={L.rect.y * k}
							width={L.rect.w * k}
							height={L.rect.h * k}
							fill="var(--col-primary, #06f)"
							fillOpacity={0.08}
							stroke="var(--col-primary, #06f)"
							strokeDasharray={`${4 * px} ${3 * px}`}
							strokeWidth={px}
						/>
					)}
					{/* Thread: a surface-coloured halo under the primary dash keeps ≥ 3:1 on any page content. */}
					{threadLines.map((pts) => (
						<ThreadStroke key={pts} pts={pts} px={px} />
					))}
					{jumps.map((j) => (
						<ThreadStroke
							key={`${j.id}${j.dir}`}
							pts={`${j.a.x * px},${j.a.y * px} ${j.c.x * px},${j.c.y * px}`}
							px={px}
						/>
					))}
					{here.map(({ id, n, b }) => (
						<g key={id} className="pagillo-thread-badge">
							<circle
								cx={(b.x + b.w / 2) * k}
								cy={(b.y + b.h / 2) * k}
								r={9 * px}
								strokeWidth={1.5 * px}
							/>
							<text
								x={(b.x + b.w / 2) * k}
								y={(b.y + b.h / 2) * k + 4 * px}
								fontSize={11 * px}
								textAnchor="middle"
							>
								{n + 1}
							</text>
						</g>
					))}
				</svg>
				{one && ob && !lockedBy && portsOf(one, ob, scale)}
				{jumps.map((j) => {
					const label =
						j.dir > 0
							? t('Continues on page {{n}}', { n: j.p + 1 })
							: t('Continued from page {{n}}', { n: j.p + 1 })
					return (
						<button
							key={`${j.id}${j.dir}`}
							type="button"
							className="pagillo-thread-jump"
							style={{ left: j.c.x, top: j.c.y }}
							aria-label={label}
							title={label}
							onPointerDown={(e) => e.stopPropagation()}
							onClick={() => {
								scrollToPage(pages[j.p].key)
								select({ ids: [j.id], page: j.p })
							}}
						>
							{j.side > 0 ? '→' : '←'} {t('p.{{n}}', { n: j.p + 1 })}
						</button>
					)
				})}
				{ghosts.map((g) => (
					<button
						key={g.id}
						type="button"
						className="pagillo-thread-ghost"
						style={{
							left: ((g.b.x + g.b.w / 2) / FX) * scale,
							top: ((g.b.y + g.b.h / 2) / FX) * scale
						}}
						onPointerDown={(e) => e.stopPropagation()}
						onClick={() => {
							// Caret at the story end (before its trailing paragraph mark).
							const at = Math.max(0, (doc.tx.get(g.story)?.length ?? 1) - 1)
							endLink()
							setSel(undefined)
							editor.select({ story: g.story, anchor: at, head: at })
							editor.focus()
						}}
					>
						{t('Text continues here · {{n}} of {{m}}', { n: g.n, m: g.m })}
					</button>
				))}
				{rulers && (
					<PageRulers
						w={size.w}
						h={size.h}
						scale={scale}
						hi={ob}
						indents={rulerIndents(i, pg)}
					/>
				)}
				{ghost && (
					<div
						className="c-hbox g-2 p-1"
						style={{
							position: 'absolute',
							top: 8,
							left: 8,
							right: 8,
							alignItems: 'center',
							background: 'var(--col-container)',
							borderRadius: 6,
							fontSize: 13
						}}
						onPointerDown={(e) => e.stopPropagation()}
					>
						<span className="flex-fill">
							{t('This page only holds {{n}} image(s)', { n: ghost.ids.length })}
						</span>
						<Button
							size="sm"
							onClick={() => {
								const to = pages[ghost.to].index
								yDoc.transact(() => {
									for (const id of ghost.ids) {
										const f = doc.f.get(id)
										if (f)
											updateFrame(yDoc, doc, id, {
												anchor: { ...f.anchor, page: to }
											})
									}
								}, yDoc.clientID)
							}}
						>
							{t('Move to page {{n}}', { n: ghost.to + 1 })}
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={() =>
								yDoc.transact(() => {
									for (const id of ghost.ids) deleteFrame(yDoc, doc, id)
								}, yDoc.clientID)
							}
						>
							{t('Delete image')}
						</Button>
					</div>
				)}
			</>
		)
	}

	const keyTarget = (
		<div
			ref={keyEl}
			tabIndex={-1}
			role="application"
			aria-label={t('Selected frame')}
			style={{
				position: 'fixed',
				left: -9999,
				top: 0,
				width: 1,
				height: 1,
				overflow: 'hidden'
			}}
			onKeyDown={frameKey}
		/>
	)

	return {
		sel,
		select,
		onPointer,
		overlay,
		fromText,
		keyTarget,
		insertImage,
		insertTextBox,
		pick,
		toInline,
		toFrame,
		sizeToImage,
		remove,
		view,
		setView,
		focusAlt,
		active: !!live?.boxes || !!live?.rotating,
		crop: crop && sel?.ids.includes(crop.id) ? { id: crop.id, page: crop.page } : undefined,
		startCrop,
		endCrop,
		link,
		startLink,
		endLink,
		linkRefusal: link ? linkRefusal : undefined,
		newLinked,
		pageOf
	}
}

/** Snap guides while moving: dashed region boxes and their column gutters. */
/** A thread link: dashed line over a halo, `pts` in overlay px. */
function ThreadStroke({ pts, px }: { pts: string; px: number }) {
	return (
		<g>
			<polyline points={pts} className="pagillo-thread-halo" strokeWidth={4 * px} />
			<polyline
				points={pts}
				className="pagillo-thread"
				strokeWidth={1.5 * px}
				strokeDasharray={`${5 * px} ${4 * px}`}
			/>
		</g>
	)
}

function SnapGuides({ boxes, k, px }: { boxes: Region[]; k: number; px: number }) {
	return (
		<g stroke="var(--col-primary, #06f)" strokeWidth={px} fill="none" opacity={0.35}>
			{boxes.map((b) => {
				const e = gutterEdges(b.x, b.w, b.cols, b.gutter)
				return (
					<g key={b.id}>
						<rect
							x={b.x * k}
							y={b.y * k}
							width={b.w * k}
							height={b.h * k}
							strokeDasharray={`${4 * px} ${3 * px}`}
						/>
						{e.map((x, n) =>
							n % 2 ? null : (
								<rect
									key={x}
									x={x * k}
									y={b.y * k}
									width={(e[n + 1] - x) * k}
									height={b.h * k}
									fill="var(--col-primary, #06f)"
									fillOpacity={0.15}
								/>
							)
						)}
					</g>
				)
			})}
		</g>
	)
}

/** Frame types as the UI names them. */
export const FRAME_LABELS: Record<StoredFrame['t'], string> = {
	img: 'Image',
	txt: 'Text box',
	shp: 'Shape',
	emb: 'Embed'
}

// vim: ts=4
