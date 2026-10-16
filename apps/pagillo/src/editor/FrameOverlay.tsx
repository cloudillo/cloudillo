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
import { type DocLinkResult, docRef, type EmbedViewReportPayload, getAppBus } from '@cloudillo/core'
import { Button, SvgViewEmbed, useFileImage, useToast } from '@cloudillo/react'
import { cropGeom, FX, type Rect, type Region, trackCount } from '@cloudillo/typeset'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuPin } from 'react-icons/lu'
import type * as Y from 'yjs'

import { FULL_CROP, frameOf, framesOf, sectionOf } from '../crdt/entities'
import {
	addFrame,
	canLinkTarget,
	chainOf,
	deleteFrame,
	embedImgAt,
	embedRecordAt,
	findInlineImage,
	frameToInline,
	inlineToFrame,
	insertEmbedParagraph,
	insertImageParagraph,
	type LinkRefusal,
	linkFrame,
	setInlineEmbed,
	soleInlineObject,
	updateFrame
} from '../crdt/frame-ops'
import { newId } from '../crdt/ids'
import { layoutTx as masterLayoutTx, updateMaster, withAreas } from '../crdt/master-ops'
import type {
	StoredFrame,
	StoredImageData,
	StoredTextFrameData,
	YPagilloDocument
} from '../crdt/stored-types'
import { flipRegion, isRtlLang, mirrorFrame, textChains } from '../crdt/type-converters'
import {
	appLabel,
	DEFAULT_NATURAL,
	type EmbedRecord,
	embedTarget,
	isReflowApp,
	newEmbedRecord,
	REFLOW_NOTICE
} from '../embeds/record'
import { type EmbedRenders, embedRecordOf } from '../embeds/useEmbedRenders'
import type { LayoutState } from '../layout/useLayout'
import { flattenPages, type PageHit, scrollToPage } from '../view/PageList'
import { type ImageSource, useImageAspect } from '../view/PageSvg'
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
	moveDrop,
	type PageInfo,
	type PageItem,
	pageItems,
	pageMaster,
	reachBoxes,
	readingOrder,
	rotArcRadius,
	rotatedBounds,
	rotateTo,
	type SnapLine,
	sameBox,
	snapAt,
	snapBox,
	snapTargets
} from './frames'
import { hitFrame, nearArea, textAreas } from './hit-test'
import { IS_MAC } from './keymap'
import { breakBefore, deleteRange } from './text-edit'
import type { Editor } from './useEditor'

const PREFS_KEY = 'pagillo.view'
/** Set once the "undo inside an embed" hint has been shown. */
const UNDO_HINT_KEY = 'pagillo.embedUndoHint'
const DEFAULT_PREFS: ViewPrefs = {
	rulers: false,
	snap: true,
	keyHints: true,
	guides: true,
	spell: true
}
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
	/** Spell-check squiggles and suggestions. */
	spell: boolean
}

type Drag =
	| {
			k: 'move'
			page: number
			/** Key of the page the preview is on; differs from `page`'s for a cross-page move. */
			target: string
			x0: number
			y0: number
			start: Map<string, Box>
			moved: boolean
			pick?: string
			/** Key of the page the drag started on. */
			src: string
			/** All moved items are unlocked page frames: may leave the page. */
			pageFrames: boolean
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
	/** A move drag's preview (drives `dragScroll`; may sit on another page than the selection). */
	move?: boolean
	/** Page key of the Pages-rail thumbnail a move drag hovers (drop target). */
	rail?: string
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
	/** Embed renders: deactivating a live embed re-renders it. */
	embeds?: EmbedRenders
}

export interface FrameCtl {
	sel?: FrameSelection
	select(s?: FrameSelection): void
	/** `PageList.onPagePointer`: frames first, then the editor. */
	onPointer(type: 'down' | 'move' | 'up' | 'cancel', hit: PageHit, e: React.PointerEvent): void
	/** `PageList.overlay` part of the frame layer. */
	overlay(index: number, size: { w: number; h: number }, scale: number): React.ReactNode
	/** Esc in text: select the text box holding the caret (editor `onKey`). */
	fromText(e: KeyboardEvent): boolean
	/** Hidden focus target receiving the frame keys; render once. */
	keyTarget: React.ReactNode
	insertImage(inline: boolean): Promise<void>
	/**
	 * Embed…: `pickDocument`, or a pasted ref's `link` (`owner` = its owner idTag, default this
	 * document's). Inline with a caret, else on the page in view; Quillo / Notillo only notify.
	 */
	insertEmbed(inline: boolean, link?: DocLinkResult, owner?: string): Promise<void>
	/** Whether an embed (of `appId`) may be inserted now; shows why not. Before any share. */
	canInsertEmbed(inline: boolean, appId?: string): boolean
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
	/** A move drag is in progress: `PageList` auto-scrolls and re-runs the move on scroll. */
	dragScroll: boolean
	/** Page key of the Pages-rail thumbnail a move drag would drop on. */
	railTarget?: string
	/** On-canvas crop session of an image frame. */
	crop?: { id: string; page: number }
	startCrop(id: string): void
	/** Leave crop mode, committing the crop as one undo step. */
	endCrop(): void
	/**
	 * Live embed: DL embed `id` (an `emb` frame id, or an inline embed's paragraph bid), its
	 * global page and source app id.
	 */
	activeEmbed?: { id: string; page: number; appId: string }
	/** Swap in the live `SvgViewEmbed` for embed `id` (double-click / Enter); false = refused. */
	activate(id: string): boolean
	/** Patch the embed record behind DL embed `id` (frame data, or the inline `{ emb }` by bid). */
	patchEmbed(id: string, patch: Partial<EmbedRecord>): void
	/** Back to the render SVG (Esc, Done, click outside); re-renders it. */
	deactivate(): void
	/** Change view…: pick another view of the same source and store its address. */
	changeView(id: string): Promise<void>
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
	/**
	 * Move the selected page frames to global page `target` (same x/y + `reachBoxes`), then
	 * select them there and scroll to it. No-op in Edit layout or for master / locked items.
	 */
	moveToPage(target: number): void
	/**
	 * Page select: global page indices per `layout.sections` entry (`ready` once laid out);
	 * undefined unless the selection can move (`movable`).
	 */
	pageSections?: { n: number; ready: boolean }[][]
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

/** Last frame / inline-image press, for double-click detection. */
interface LastDown {
	t: number
	x: number
	y: number
	id: string
}

/** Whether this press on `id` completes a double-click (500 ms, 4 px); records it as the last. */
function isDoubleClick(ld: LastDown, e: PointerEvent | React.PointerEvent, id: string): boolean {
	const dbl =
		ld.id === id &&
		e.timeStamp - ld.t < 500 &&
		Math.abs(e.clientX - ld.x) < 4 &&
		Math.abs(e.clientY - ld.y) < 4
	Object.assign(ld, { t: e.timeStamp, x: e.clientX, y: e.clientY, id })
	return dbl
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
	src,
	embeds
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
	/** Escape cancelled a drag: its remaining move / up events go nowhere. */
	const swallowDrag = React.useRef(false)
	const liveRef = React.useRef<Live | undefined>(undefined)
	const keyEl = React.useRef<HTMLDivElement>(null)
	const [crop, setCrop] = React.useState<CropState>()
	/** Live embed session: DL embed id (frame id or inline bid) and its global page. */
	const [act, setAct] = React.useState<{ id: string; page: number }>()
	/** The activation whose first `reportView` may still fill in the alt text. */
	const firstReport = React.useRef<string | undefined>(undefined)
	const [link, setLink] = React.useState<{ id: string }>()
	const [linkRefusal, setLinkRefusal] = React.useState<LinkRefusal>()
	/** Last frame press, for the double-click that enters crop mode. */
	const lastDown = React.useRef<LastDown>({ t: 0, x: 0, y: 0, id: '' })
	/** This render's values, for code resuming after an await (the image dialog). */
	const now = React.useRef({ sel, layoutEdit, current, editor })
	now.current = { sel, layoutEdit, current, editor }
	const cf = crop ? frameOf(doc, crop.id) : undefined
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
		setAct(undefined)
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
	const pageSections = React.useMemo(() => {
		let n = 0
		return layout.sections.map((s) =>
			Array.from({ length: s.pages }, () => {
				const k = pages[n]?.key
				return { n: n++, ready: !!(k && layout.pages.get(k)?.page) }
			})
		)
	}, [layout.sections, layout.pages, pages])
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
	const selBid = es && esTx ? soleInlineObject(esTx, selFrom(es), selTo(es))?.bid : undefined
	const show = (l?: Live) => {
		liveRef.current = l
		setLive(l)
	}
	/** Drop the drag and its preview; nothing is written. */
	const cancelDrag = () => {
		drag.current = undefined
		show(undefined)
	}
	const select = (s?: FrameSelection) => {
		if (crop && !s?.ids.includes(crop.id)) endCrop()
		if (act && !s?.ids.includes(act.id)) deactivate()
		setSel(s)
		if (s) keyEl.current?.focus({ preventScroll: true })
	}

	/** Live embed on DL embed `id`: a page `emb` frame (selected) or an inline embed. */
	const activate = (id: string): boolean => {
		if (layoutEdit || locked?.has(id) || !embedTarget(embedRecordOf(doc, id))) return false
		if (crop) endCrop()
		const f = frameOf(doc, id)
		const page = f
			? sel?.ids.includes(id)
				? sel.page
				: pageOfFrame(f)
			: pages.findIndex((_, i) => inlineImages(i).some((m) => m.bid === id))
		if (page < 0) return false
		if (f) select({ ids: [id], page })
		else if (act) deactivate()
		firstReport.current = id
		setAct({ id, page })
		// Once per browser, say where undo for the embedded content lives.
		try {
			if (!localStorage.getItem(UNDO_HINT_KEY)) {
				localStorage.setItem(UNDO_HINT_KEY, '1')
				toast.info(
					t('Undo inside the embed belongs to its source app, not to this publication.')
				)
			}
		} catch {}
		return true
	}

	const deactivate = () => {
		if (!act) return
		setAct(undefined)
		embeds?.refresh(act.id)
		if (frameOf(doc, act.id)) keyEl.current?.focus({ preventScroll: true })
		else editor.focus()
	}

	/** Patch the embed record behind DL embed `id` (frame data, or the inline `{ emb }`). */
	const patchEmbed = (id: string, patch: Partial<EmbedRecord>): void => {
		if (frameOf(doc, id)?.t === 'emb') {
			updateFrame(yDoc, doc, id, { data: patch })
			return
		}
		const at = findInlineImage(doc, id, 'emb')
		const yt = at && doc.tx.get(at.story)
		const rec = at && yt && embedRecordAt(yt, at.offset)
		if (!at || !yt || !rec) return
		const ed = now.current.editor
		const next = { ...rec, ...patch }
		// Through the editor when its selection is in that story, so the selection survives;
		// either way the editor's own guard decides (a refused edit writes nothing).
		if (ed.sel?.story === at.story) {
			ed.run((t2) => {
				setInlineEmbed(t2, at.offset, next)
				return undefined
			})
		} else if (ed.canEdit(at.story)) {
			yDoc.transact(() => setInlineEmbed(yt, at.offset, next), yDoc.clientID)
		}
	}

	const changeView = async (id: string) => {
		const tg = embedTarget(embedRecordOf(doc, id))
		if (!tg) return
		const nav = await getAppBus().pickEmbedView({
			fileId: tg.fileId,
			contentType: tg.contentType,
			nav: tg.nav,
			sourceFileId: fileId
		})
		if (nav !== undefined)
			patchEmbed(id, {
				address: docRef(tg.appId, `${tg.owner}:${tg.fileId}`, nav || undefined)
			})
	}

	/** First report of an activation: the source's a11yLabel replaces an alt still at the title. */
	const onEmbedReport = (id: string, r: EmbedViewReportPayload) => {
		if (firstReport.current !== id) return
		firstReport.current = undefined
		const rec = embedRecordOf(doc, id)
		if (rec && r.a11yLabel && rec.alt === rec.lastTitle && r.a11yLabel !== rec.alt)
			patchEmbed(id, { alt: r.a11yLabel })
	}

	/** Crop mode on an image frame with an image. */
	const startCrop = (id: string) => {
		const f = frameOf(doc, id)
		const d = f?.t === 'img' ? (f.data as StoredImageData) : undefined
		if (!f || !d?.fileId || locked?.has(id)) return
		const page = sel?.ids.includes(id) ? sel.page : pageOfFrame(f)
		if (page < 0) return
		select({ ids: [id], page })
		setCrop({ id, page, c: d.crop ?? FULL_CROP })
	}

	const endCrop = () => {
		if (!crop) return
		setCrop(undefined)
		const f = frameOf(doc, crop.id)
		const d = f?.t === 'img' ? (f.data as StoredImageData) : undefined
		const r4 = (v: number) => Math.round(v * 1e4) / 1e4
		const w = r4(crop.c.w)
		const c = { x: r4(crop.c.x), y: r4(crop.c.y), w, h: w }
		const old = d?.crop ?? FULL_CROP
		if (d && (c.x !== old.x || c.y !== old.y || c.w !== old.w || c.h !== old.h))
			updateFrame(yDoc, doc, crop.id, { data: { crop: c } })
	}

	/** Global page index of a page frame's anchor (-1 for master items / not laid out). */
	const pageOfFrame = (f: StoredFrame): number => {
		const a = f.anchor
		return 'sec' in a ? pages.findIndex((p) => p.sec === a.sec && p.index === a.page) : -1
	}

	const pageOf = (id: string): number => {
		const f = frameOf(doc, id)
		return f ? pageOfFrame(f) : -1
	}

	/** Page frames (not regions / master items): kept reachable, may move between pages. */
	const isPageFrame = (id: string) => {
		const f = frameOf(doc, id)
		return !!f && 'sec' in f.anchor
	}

	/** Unlocked page frames: may move between pages. */
	const canRelocate = (ids: Iterable<string>) =>
		[...ids].every((id) => isPageFrame(id) && !locked?.has(id))

	/** The selection is all unlocked page frames: it may move to another page. */
	const movable = !!sel && canEdit && !layoutEdit && canRelocate(sel.ids)

	/** Re-anchor page frames to global page `to` at `boxes`, and select them there. */
	const relocate = (boxes: Map<string, Box>, to: number) => {
		const p = pages[to]
		// Re-checked at drop: a peer may have locked a frame, or deleted the page, mid-drag.
		if (!p || !info(to) || !canRelocate(boxes.keys())) return
		if (crop) endCrop()
		const anchor = { sec: p.sec, page: p.index }
		yDoc.transact(() => {
			for (const [id, b] of boxes) {
				const { x, y, w, h, rot } = round(b)
				updateFrame(yDoc, doc, id, { anchor, x, y, w, h, rot })
			}
		}, yDoc.clientID)
		select({ ids: [...boxes.keys()], page: to })
	}

	const moveToPage = (target: number) => {
		const p = pages[target]
		const pg = info(target)
		if (!sel || !movable || target === pageOf(sel.ids[0]) || !p || !pg) return
		const all = new Map<string, Box>()
		for (const id of sel.ids) {
			const f = frameOf(doc, id)
			if (f) all.set(id, boxOf(f))
		}
		relocate(
			reachBoxes(all, pg, () => true),
			target
		)
		scrollToPage(p.key, undefined, true)
	}

	/** Link mode from text frame `id` (page frames only; not in Edit layout). */
	const startLink = (id: string) => {
		if (layoutEdit || frameOf(doc, id)?.t !== 'txt') return
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
		const f = frameOf(doc, id)
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

	/** One undoable write of new boxes for items of `page`; `reach` keeps page frames reachable. */
	const commit = (page: number, boxes0: Map<string, Box>, reach = false) => {
		const pg = info(page)
		if (!pg) return
		const its = items(page)
		// Master items on a mirrored left page are shown flipped; store base coordinates.
		const mirrored = !!layoutEdit && !!pageMaster(doc, pg)?.mirrored
		const boxes = reach ? reachBoxes(boxes0, pg, isPageFrame) : boxes0
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

	const toast = useToast()

	/** Insert target page: the one in view (Edit layout: a page using it). */
	const targetPage = (): number => {
		const { current } = now.current
		if (layoutEdit) {
			if (layout.pages.get(pages[current]?.key)?.page.master === layoutEdit) return current
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
		const f = frameOf(doc, id)
		if (f?.t !== 'img') return
		const r = await pickImage()
		if (!r) return
		// A new image resets the crop (`patchFrame`); only `src` is rewritten.
		updateFrame(yDoc, doc, id, { data: { fileId: r.fileId, px: r.px } })
		setFocusAlt((n) => n + 1)
	}

	const insertImage = async (inline: boolean) => {
		// Inline needs a visible caret: not in Edit layout, not while a frame is selected.
		if (inline && (!editor.sel || layoutEdit || sel)) return
		const one = !inline && sel?.ids.length === 1 ? frameOf(doc, sel.ids[0]) : undefined
		if (sel && one?.t === 'img' && !(one.data as StoredImageData).fileId)
			return pick(sel.ids[0])
		const r = await pickImage()
		if (!r) return
		// The dialog awaited: the caret or selection may have changed meanwhile.
		const n = now.current
		if (inline && (!n.editor.sel || n.layoutEdit || n.sel)) return
		const [pw, ph] = r.px ?? [400, 300]
		if (inline) {
			// Inline: its own paragraph; the engine scales it to the column width.
			n.editor.run((tx, from, to) => {
				deleteRange(tx, from, to)
				const at = breakBefore(tx, from)
				insertImageParagraph(tx, at, { fileId: r.fileId, w: pw * FX, h: ph * FX, alt: '' })
				return at + 2
			})
			return
		}
		placeOnPage('img', pw, ph, {
			fileId: r.fileId,
			px: r.px,
			crop: FULL_CROP,
			fit: 'contain',
			alt: ''
		})
	}

	/** A new `kind` frame, `pw`×`ph` fitted and centred in the margins of the page in view; selected. */
	const placeOnPage = (
		kind: StoredFrame['t'],
		pw: number,
		ph: number,
		data: StoredFrame['data']
	) => {
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
					t: kind,
					anchor: { sec: pg.sec, page: pg.index },
					...round({ x: mb.x + (mb.w - w) / 2, y: mb.y + (mb.h - h) / 2, w, h, rot: 0 }),
					z: 1,
					wrap: { mode: 'box', off: 6 * FX },
					data
				},
				{ master: layoutEdit }
			)
		)
		select({ ids: [id], page })
		setFocusAlt((n) => n + 1)
	}

	const refuseEmbed = () => void toast.warning(t('The embed could not be inserted here.'))

	/**
	 * Whether an embed (of `appId`, when known) may be inserted now; shows the reason if not.
	 * Checked before any pick or paste link, so a refusal grants no share.
	 */
	const canInsertEmbed = (inline: boolean, appId?: string): boolean => {
		// Same placement rule as images: inline needs a visible caret.
		// A pasted ref would otherwise vanish without a word; a toolbar insert can't get here.
		if ((inline && (!editor.sel || layoutEdit || sel)) || !fileId) {
			refuseEmbed()
			return false
		}
		if (appId && isReflowApp(appId)) {
			toast.info(t(REFLOW_NOTICE))
			return false
		}
		return true
	}

	const insertEmbed = async (inline: boolean, link?: DocLinkResult, owner = src?.ownerTag) => {
		if (!canInsertEmbed(inline) || !fileId) return
		if (!owner) return refuseEmbed()
		const r =
			link ??
			(await getAppBus().pickDocument({ sourceFileId: fileId, title: t('Insert embed') }))
		if (!r) return
		const rec = await newEmbedRecord(r, {
			owner,
			sourceFileId: fileId,
			sizing: inline ? 'fit-width' : 'box'
		})
		if (rec === 'reflow') {
			// share stays granted; needs a shell doc:unlink / share revoke message
			toast.info(t(REFLOW_NOTICE))
			return
		}
		// The picker and the size render awaited: the caret or selection may have changed.
		const n = now.current
		if (inline && (!n.editor.sel || n.layoutEdit || n.sel)) return refuseEmbed()
		if (inline) {
			n.editor.run((tx, from, to) => {
				deleteRange(tx, from, to)
				const at = breakBefore(tx, from)
				insertEmbedParagraph(tx, at, rec)
				return at + 2
			})
			return
		}
		// CSS px at 96 dpi → pt.
		placeOnPage('emb', rec.lastNatural.w * 0.75, rec.lastNatural.h * 0.75, { ...rec })
	}

	const insertTextBox = () => {
		// On the page in view: under the caret's line if it is there, else centred.
		const page = targetPage()
		const at =
			es && !layoutEdit
				? lineAt(editor.index.stories.get(es.story) ?? [], es.head)
				: undefined
		const pl = at?.page === page ? at : undefined
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
		const story = (frameOf(doc, id)?.data as StoredTextFrameData | undefined)?.story
		if (story && !layoutEdit) {
			setSel(undefined)
			editor.select({ story, anchor: 0, head: 0 })
			editor.focus()
		} else select({ ids: [id], page })
	}

	const toInline = (id: string) => {
		const f = frameOf(doc, id)
		const story = f && 'sec' in f.anchor ? sectionOf(doc, f.anchor.sec)?.story : undefined
		const tx = story && doc.tx.get(story)
		const page = f ? pageOfFrame(f) : -1
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
		const f = frameOf(doc, id)
		const d = f?.data as StoredImageData | undefined
		if (!f || !d?.px) return
		updateFrame(yDoc, doc, id, {
			h: Math.round((f.w * d.px[1]) / d.px[0]),
			data: { fit: 'fill' }
		})
	}

	const fromText = (e: KeyboardEvent): boolean => {
		if (e.key === 'Escape' && act) {
			deactivate()
			return true
		}
		// Enter on a selected inline embed activates it.
		if (e.key === 'Enter' && editor.sel && canEdit && !layoutEdit) {
			const s = editor.sel
			const yt = doc.tx.get(s.story)
			const o = yt && soleInlineObject(yt, selFrom(s), selTo(s))
			if (o?.kind === 'emb' && o.bid && activate(o.bid)) return true
		}
		if (e.key !== 'Escape' || !editor.sel || !canEdit) return false
		const story = editor.sel.story
		for (const [id, f] of framesOf(doc)) {
			if (f.t !== 'txt' || (f.data as StoredTextFrameData).story !== story) continue
			const page = pageOfFrame(f)
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

	const onPointer = (
		type: 'down' | 'move' | 'up' | 'cancel',
		hit: PageHit,
		e: React.PointerEvent
	) => {
		if (type === 'cancel') {
			swallowDrag.current = false
			cancelDrag()
			editor.onPointer('cancel', hit, e)
			return
		}
		// A move with no button held: the cancelled drag is over.
		if (type === 'move' && !e.buttons) swallowDrag.current = false
		if (swallowDrag.current) {
			if (type !== 'move') swallowDrag.current = false
			if (type !== 'down') return
		}
		const d = drag.current
		// 4 CSS px in page Fx (snap threshold).
		const thr = (4 / (hit.scale ?? 1)) * FX
		if (type === 'down') {
			if (e.button !== 0) return
			const its = items(hit.index)
			const handle = (e.target as Element)
				.closest?.('[data-handle]')
				?.getAttribute('data-handle')
			// A live embed takes its own presses (its layer stops them): any page press leaves.
			if (act && !handle) deactivate()
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
				// Images and (fixed-view) embeds keep their aspect; Shift toggles.
				const lock = (!!d0?.fileId || one.frame?.t === 'emb') !== e.shiftKey
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
				const dbl = isDoubleClick(lastDown.current, e, h.id)
				const hf = frameOf(doc, h.id)
				// Double-click: an image enters crop mode, an embed goes live.
				if (dbl && !e.shiftKey && hf?.t === 'img' && (hf.data as StoredImageData).fileId) {
					startCrop(h.id)
					return
				}
				if (dbl && !e.shiftKey && hf?.t === 'emb') {
					activate(h.id)
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
					src: pages[hit.index].key,
					target: pages[hit.index].key,
					x0: hit.x,
					y0: hit.y,
					start,
					moved: false,
					pick: empty ? h.id : undefined,
					pageFrames: canRelocate(start.keys())
				}
				return
			}
			// A click on an inline image selects its embed (image paragraphs have no lines).
			const im =
				canEdit && !layoutEdit
					? inlineImages(hit.index).find((m) => containsPoint(m.box, hit.x, hit.y))
					: undefined
			const at = im && (findInlineImage(doc, im.bid) ?? findInlineImage(doc, im.bid, 'emb'))
			if (im && at) {
				const dbl = isDoubleClick(lastDown.current, e, im.bid)
				if (dbl && embedRecordOf(doc, im.bid)) {
					activate(im.bid)
					return
				}
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
			// Only a move of page frames follows the pointer to another page (below).
			if (hit.index !== d.page && d.k !== 'move') return
			if (d.k === 'crop') {
				const p = toLocal(d.b, hit.x, hit.y)
				setCrop((s) => s && { ...s, c: cropDrag(d, p.x, p.y) })
				return
			}
			if (d.k === 'move') {
				const snapBack = (rail?: string) => {
					d.target = d.src
					show({ page: d.page, boxes: new Map(d.start), move: true, rail })
				}
				// Over a laid-out Pages-rail thumbnail: snap the preview back; the drop moves there.
				// The pointer is captured by the pages, so the thumbnail is found by hit test.
				const el = document.elementFromPoint(e.clientX, e.clientY)
				const key = el?.closest('.pagillo-thumb[data-key]')?.getAttribute('data-key')
				const rail = key ? pages.findIndex((p) => p.key === key) : -1
				if (
					key &&
					rail >= 0 &&
					rail !== d.page &&
					d.pageFrames &&
					!layoutEdit &&
					info(rail)
				) {
					// Leaving the rail over the source commits in place.
					d.moved = true
					snapBack(key)
					return
				}
				// Off the pages (rail gaps, panels): snap back; a drop there changes nothing.
				if (!el?.closest('.pagillo-pages')) {
					snapBack()
					return
				}
				// The page under the pointer is the target; Edit layout and master items stay put.
				const to = hit.index
				if (to !== d.page && (layoutEdit || !d.pageFrames || !info(to))) {
					snapBack()
					return
				}
				// Keeps the grab offset: start + pointer delta, in the target page's coordinates.
				let dx = hit.x - d.x0
				let dy = hit.y - d.y0
				if (!d.moved && to === d.page && Math.hypot(dx, dy) < thr) return
				d.moved = true
				d.target = pages[to].key
				const shift = (ox: number, oy: number) =>
					new Map([...d.start].map(([id, b]) => [id, { ...b, x: b.x + ox, y: b.y + oy }]))
				let lines: SnapLine[] = []
				const pg = info(to)
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
						snapTargets(doc, pg, items(to), new Set(d.start.keys()), !!layoutEdit),
						thr
					)
					dx += s.dx
					dy += s.dy
					lines = s.lines
				}
				// Page frames stay reachable; the drop saves this preview as is.
				const free = shift(dx, dy)
				const boxes = pg ? reachBoxes(free, pg, isPageFrame) : free
				// Pulled back into reach: the snap guides no longer match.
				if (
					[...boxes].some(([id, b]) => b.x !== free.get(id)?.x || b.y !== free.get(id)?.y)
				)
					lines = []
				show({
					page: to,
					boxes,
					lines,
					guides: view.snap && !e.altKey,
					move: true
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
			const r = moveDrop({ ...d, rail: l?.rail }, pages)
			// Rail drop: same x/y + shift on that page.
			if (r.k === 'rail') moveToPage(r.to)
			// Cross-page drop: the preview is already shifted; re-anchor in one transaction.
			else if (r.k === 'cross' && l?.boxes) relocate(l.boxes, r.to)
			// A drop back at the start (snapped back) writes nothing: no empty undo step.
			else if (
				r.k === 'commit' &&
				l?.boxes &&
				[...l.boxes].some(([id, b]) => !sameBox(b, d.start.get(id)))
			)
				commit(r.page, l.boxes)
			else if (r.k === 'pick' && d.pick && canEdit) void pick(d.pick)
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
				// Cancels a move drag: nothing is written, the selection stays.
				if (drag.current?.k === 'move') {
					swallowDrag.current = true
					return cancelDrag()
				}
				if (act) return deactivate()
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
					new Map(cur.map((it) => [it.id, { ...boxOf(it), x: it.x + dx, y: it.y + dy }])),
					true
				)
				return
			}
			case 'Enter': {
				done()
				if (crop) return endCrop()
				if (act) return deactivate()
				const f = cur.length === 1 ? cur[0].frame : undefined
				if (f?.t === 'emb') return activate(cur[0].id)
				if (f?.t === 'img' && (f.data as StoredImageData).fileId) startCrop(cur[0].id)
				else if (f?.t === 'txt') {
					// A follower edits its head's story.
					const head = chainOf(doc, cur[0].id)?.head
					const hf = head ? frameOf(doc, head) : f
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
			case 'PageUp':
			case 'PageDown': {
				const from = pageOf(sel.ids[0])
				const to = from + (e.key === 'PageUp' ? -1 : 1)
				if (!e.altKey || drag.current || !movable || from < 0 || to < 0 || !info(to)) break
				done()
				moveToPage(to)
				return
			}
		}
		if (onKey?.(e.nativeEvent)) done()
	}

	/** Ghost page: past its section's text, kept alive only by anchored images. */
	const ghostOf = (i: number) => {
		const p = pages[i]
		const pg = info(i)
		const sec = p && sectionOf(doc, p.sec)
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
		const pageIts = items(i)
		const editable = !layoutEdit || pg.master === layoutEdit
		const L = live?.page === i ? live : undefined
		// A cross-page move previews (and selects) its frames on the target page.
		const its =
			L?.move && sel && sel.page !== i
				? [...pageIts, ...items(sel.page).filter((it) => L.boxes?.has(it.id))]
				: pageIts
		const selPage = live?.move ? live.page : sel?.page
		const bx = (it: PageItem): Box => L?.boxes?.get(it.id) ?? boxOf(it)
		const selected = sel && selPage === i ? its.filter((it) => sel.ids.includes(it.id)) : []
		const one = selected.length === 1 ? selected[0] : undefined
		const ghost = layoutEdit ? undefined : ghostOf(i)
		const rulers = editable && (view.rulers || !!layoutEdit || selected.length > 0 || !!L)
		const ibox = selBid ? inlineImages(i).find((m) => m.bid === selBid)?.box : undefined
		const hv = hover?.page === i ? hover : undefined
		const hbox =
			hv?.bid && hv.bid !== selBid
				? inlineImages(i).find((m) => m.bid === hv.bid)?.box
				: undefined
		// The live embed of this page: its record, source and (live) box.
		// An inline embed's page moves with reflow: find it, don't trust the activation's page.
		const aRec =
			act &&
			(frameOf(doc, act.id) ? act.page === i : inlineImages(i).some((m) => m.bid === act.id))
				? embedRecordOf(doc, act.id)
				: undefined
		const aTg = embedTarget(aRec)
		const aIt = aTg ? its.find((it) => it.id === act?.id) : undefined
		const ab = aTg
			? aIt
				? bx(aIt)
				: inlineImages(i).find((m) => m.bid === act?.id)?.box
			: undefined
		if (!its.length && !layoutEdit && !ghost && !rulers && !ibox && !hbox && !ab) return null
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
		for (const it of layoutEdit ? [] : pageIts) {
			if (it.frame?.t !== 'txt' || it.master || (it.frame.data as StoredTextFrameData).story)
				continue
			const c = chainOf(doc, it.id, chains)
			const story =
				c && (frameOf(doc, c.head)?.data as StoredTextFrameData | undefined)?.story
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
					{ab && (
						<>
							{/* The rest of the page dimmed (even-odd hole for the rotated frame). */}
							<path
								d={`M0 0H${size.w * k}V${size.h * k}H0Z M${[
									[ab.x, ab.y],
									[ab.x + ab.w, ab.y],
									[ab.x + ab.w, ab.y + ab.h],
									[ab.x, ab.y + ab.h]
								]
									.map(([x, y]) => {
										const p = rotatePointAroundCenter(
											{ x, y },
											{ x: ab.x + ab.w / 2, y: ab.y + ab.h / 2 },
											ab.rot
										)
										return `${p.x * k} ${p.y * k}`
									})
									.join('L')}Z`}
								fillRule="evenodd"
								fill="#000"
								opacity={0.3}
							/>
							<rect
								x={ab.x * k}
								y={ab.y * k}
								width={ab.w * k}
								height={ab.h * k}
								transform={turn(ab)}
								fill="none"
								stroke="var(--col-accent)"
								strokeWidth={2 * px}
							/>
						</>
					)}
				</svg>
				{one && ob && !lockedBy && portsOf(one, ob, scale)}
				{act && ab && aRec && aTg && (
					<LiveEmbed
						id={act.id}
						ab={ab}
						scale={scale}
						aRec={aRec}
						aTg={aTg}
						fileId={fileId}
						canEdit={canEdit}
						deactivate={deactivate}
						changeView={changeView}
						patchEmbed={patchEmbed}
						onEmbedReport={onEmbedReport}
						onRemove={
							aIt
								? () => {
										setAct(undefined)
										remove()
									}
								: undefined
						}
					/>
				)}
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
										const f = frameOf(doc, id)
										if (f && 'sec' in f.anchor)
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

	const actTg = act && embedTarget(embedRecordOf(doc, act.id))
	return {
		sel,
		select,
		onPointer,
		overlay,
		fromText,
		keyTarget,
		insertImage,
		insertEmbed,
		canInsertEmbed,
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
		dragScroll: !!live?.move,
		railTarget: live?.rail,
		crop: crop && sel?.ids.includes(crop.id) ? { id: crop.id, page: crop.page } : undefined,
		startCrop,
		endCrop,
		activeEmbed: act && actTg ? { ...act, appId: actTg.appId } : undefined,
		activate,
		patchEmbed,
		deactivate,
		changeView,
		link,
		startLink,
		endLink,
		linkRefusal: link ? linkRefusal : undefined,
		newLinked,
		pageOf,
		moveToPage,
		pageSections: movable ? pageSections : undefined
	}
}

/** Snap guides while moving: dashed region boxes and their column gutters. */
/** A thread link: dashed line over a halo, `pts` in overlay px. */
/** The live source of embed `id` in its box `ab` (CSS px at `scale`), with its "Done" chip. */
function LiveEmbed({
	id,
	ab,
	scale,
	aRec,
	aTg,
	fileId,
	canEdit,
	deactivate,
	changeView,
	patchEmbed,
	onEmbedReport,
	onRemove
}: {
	id: string
	ab: Box
	scale: number
	aRec: EmbedRecord
	aTg: NonNullable<ReturnType<typeof embedTarget>>
	fileId?: string
	canEdit: boolean
	deactivate: () => void
	changeView: (id: string) => Promise<void>
	patchEmbed: (id: string, patch: Partial<EmbedRecord>) => void
	onEmbedReport: (id: string, r: EmbedViewReportPayload) => void
	onRemove?: () => void
}) {
	const { t } = useTranslation()
	// `editInPlace` is peer-writable: write access also needs this viewer's own edit right.
	const write = aRec.editInPlace && canEdit
	const left = (ab.x / FX) * scale
	const top = (ab.y / FX) * scale
	const w = (ab.w / FX) * scale
	const h = (ab.h / FX) * scale
	const natural = aRec.lastNatural ?? DEFAULT_NATURAL
	return (
		<>
			<div
				style={{
					position: 'absolute',
					left,
					top,
					transform: `rotate(${ab.rot}deg)`,
					pointerEvents: 'auto'
				}}
				onPointerDown={(e) => e.stopPropagation()}
			>
				<svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
					<SvgViewEmbed
						x={0}
						y={0}
						width={w}
						height={h}
						fileId={aTg.fileId}
						contentType={aTg.contentType}
						appId={aTg.appId}
						owner={aTg.owner}
						sourceFileId={fileId ?? ''}
						nav={aTg.nav}
						title={aRec.lastTitle}
						access={write ? 'write' : 'read'}
						settings={{
							sizing: 'box',
							lastNatural: [natural.w, natural.h],
							editInPlace: aRec.editInPlace
						}}
						canInteract
						active
						canEdit={canEdit}
						selected
						onReport={(r) => onEmbedReport(id, r)}
						actions={{
							onDeactivate: deactivate,
							onChangeView: () => void changeView(id),
							onUseCurrentView: (nav) =>
								patchEmbed(id, {
									address: docRef(
										aTg.appId,
										`${aTg.owner}:${aTg.fileId}`,
										nav || undefined
									)
								}),
							onRemove
						}}
					/>
				</svg>
			</div>
			<div
				style={{ position: 'absolute', left, top: top - 40, pointerEvents: 'auto' }}
				onPointerDown={(e) => e.stopPropagation()}
			>
				<div className="c-panel">
					<div className="c-hbox g-2 p-1">
						<span>
							{write
								? t('Editing in {{app}}', { app: appLabel(aTg.appId) })
								: t('Viewing {{app}}', { app: appLabel(aTg.appId) })}
						</span>
						<Button size="sm" onClick={deactivate}>
							{t('Done')}
						</Button>
					</div>
				</div>
			</div>
		</>
	)
}

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
