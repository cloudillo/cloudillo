// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Collaboration layer. Publishes this user's awareness state — selection as encoded
 * `Y.RelativePosition`s, selected frames, whether one is being dragged, Edit layout, page — and
 * draws everyone else's: carets and selections with name tags, frame outlines, and a bar on the
 * pages whose layout someone is editing. Peer state is untrusted beyond `user` (CLAUDE.md
 * presence rules): every field is validated here, colours come from `presenceColor` (idTag, theme).
 */

import { type PresenceEntry, presenceColor } from '@cloudillo/core'
import { useDarkMode } from '@cloudillo/react'
import { awarenessPresenceFeed } from '@cloudillo/crdt'
import { FX } from '@cloudillo/typeset'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import * as Y from 'yjs'

import type { YPagilloDocument } from '../crdt/stored-types'
import type { LayoutState } from '../layout/useLayout'
import { flattenPages, scrollToPage } from '../view/PageList'
import * as C from './caret'
import type { FrameSelection } from './FrameOverlay'
import { boxOf, pageItems } from './frames'
import type { Editor } from './useEditor'

/** y-protocols `Awareness` (pagillo has no direct y-protocols dependency). */
export type Awareness = Parameters<typeof awarenessPresenceFeed>[0]

/** Pagillo's awareness fields next to `user`. `sel` positions: base64 `Y.encodeRelativePosition`. */
export interface PagilloPresence {
	sel?: { story: string; anchor: string; head: string }
	frames: string[]
	active?: true
	mode: 'text' | 'frame' | 'layout'
	layout?: string
	/** Global page index. */
	page: number
}

const toB64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export interface PublishOptions {
	sel?: C.EditorSelection
	frames?: FrameSelection
	active: boolean
	layout?: string
	/** Current page (used when no frame is selected). */
	page: number
}

export function usePublishPresence(
	awareness: Awareness | undefined,
	doc: YPagilloDocument,
	{ sel, frames, active, layout, page }: PublishOptions
): void {
	const story = sel?.story
	const anchor = sel?.anchor
	const head = sel?.head
	const ids = frames?.ids.join('\n') ?? ''
	const fpage = frames?.page
	React.useEffect(() => {
		if (!awareness) return
		const t = story ? doc.tx.get(story) : undefined
		const enc = (i: number) =>
			toB64(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(t as Y.Text, i)))
		const state: PagilloPresence = {
			sel:
				story && t && anchor !== undefined && head !== undefined
					? { story, anchor: enc(anchor), head: enc(head) }
					: undefined,
			frames: ids ? ids.split('\n') : [],
			active: active || undefined,
			mode: ids ? 'frame' : layout ? 'layout' : 'text',
			layout,
			page: fpage ?? page
		}
		awareness.setLocalState({ ...awareness.getLocalState(), ...state })
	}, [awareness, doc, story, anchor, head, ids, active, layout, fpage, page])
}

interface Peer {
	/** Selection rects by global page (non-collapsed `sel`), filled in `useRemote`. */
	rects?: Map<number, C.Rect[]>
	/** Caret box of `sel.head`, filled in `useRemote`. */
	caret?: C.CaretBox
	entry: PresenceEntry
	color: string
	sel?: C.EditorSelection
	frames: string[]
	active: boolean
	layout?: string
	page?: number
}

const str = (v: unknown) => (typeof v === 'string' && v.length <= 4096 ? v : undefined)

function resolve(yDoc: Y.Doc, t: Y.Text, b64: string): number | undefined {
	try {
		const abs = Y.createAbsolutePositionFromRelativePosition(
			Y.decodeRelativePosition(fromB64(b64)),
			yDoc
		)
		return abs && abs.type === t ? abs.index : undefined
	} catch {
		return undefined
	}
}

function readPeer(entry: PresenceEntry, yDoc: Y.Doc, doc: YPagilloDocument, dark: boolean): Peer {
	const s = entry.state ?? {}
	const frames = Array.isArray(s.frames)
		? s.frames.filter((x): x is string => !!str(x)).slice(0, 200)
		: []
	const page =
		typeof s.page === 'number' && Number.isInteger(s.page) && s.page >= 0 ? s.page : undefined
	let sel: C.EditorSelection | undefined
	if (s.sel && typeof s.sel === 'object') {
		const r = s.sel as Record<string, unknown>
		const story = str(r.story)
		const a = str(r.anchor)
		const h = str(r.head)
		const t = story ? doc.tx.get(story) : undefined
		if (story && t && a && h) {
			const anchor = resolve(yDoc, t, a)
			const head = resolve(yDoc, t, h)
			if (anchor !== undefined && head !== undefined) sel = { story, anchor, head }
		}
	}
	return {
		entry,
		color: presenceColor(entry.idTag, Number(entry.connId), dark),
		sel,
		frames,
		active: s.active === true,
		layout: str(s.layout),
		page
	}
}

export interface UseRemoteOptions {
	awareness?: Awareness
	yDoc: Y.Doc
	doc: YPagilloDocument
	editor: Editor
	layout: LayoutState
}

export interface RemoteCtl {
	/** Frames a remote user is dragging → that user's name (`useFrames` `locked`). */
	locked: Map<string, string>
	/** `PageList.overlay` part: remote carets, selections, frame outlines, layout bars. */
	overlay(index: number, size: { w: number; h: number }, scale: number): React.ReactNode
	/** Avatar click (`AppDocBar.onUserClick`): scroll to that user's caret, else page. */
	scrollTo(user: PresenceEntry): void
}

export function useRemote({ awareness, yDoc, doc, editor, layout }: UseRemoteOptions): RemoteCtl {
	const { t } = useTranslation()
	const dark = useDarkMode()
	const [entries, setEntries] = React.useState<PresenceEntry[]>([])
	React.useEffect(() => {
		if (!awareness) return
		let raf = 0
		let last: PresenceEntry[] = []
		const unsub = awarenessPresenceFeed(awareness).subscribe((es) => {
			last = es
			if (!raf)
				raf = requestAnimationFrame(() => {
					raf = 0
					// Own caret moves echo here too: keep `prev` unless a peer changed.
					setEntries((prev) => {
						const next = last.filter((e) => !e.self)
						return next.length === prev.length &&
							next.every(
								(e, i) => e.connId === prev[i].connId && e.state === prev[i].state
							)
							? prev
							: next
					})
				})
		})
		return () => {
			unsub()
			cancelAnimationFrame(raf)
		}
	}, [awareness])

	const pages = React.useMemo(() => flattenPages(layout.sections), [layout.sections])
	const { index } = editor
	// Relative positions move with local and remote edits, which relayout (new `index`).
	// Caret and selection rects once per peer here, not per page in `overlay`.
	const peers = React.useMemo(
		() =>
			entries.map((e) => {
				const p = readPeer(e, yDoc, doc, dark)
				if (!p.sel) return p
				const L = index.stories.get(p.sel.story) ?? []
				const from = C.selFrom(p.sel)
				const to = C.selTo(p.sel)
				return {
					...p,
					rects: from !== to ? C.selectionRects(L, from, to) : undefined,
					caret: C.caretBox(L, p.sel.head)
				}
			}),
		[entries, yDoc, doc, dark, index]
	)
	const info = (i: number) => {
		const p = pages[i]
		return p && layout.pages.get(p.key)?.page
	}

	const locked = new Map<string, string>()
	for (const p of peers) if (p.active) for (const id of p.frames) locked.set(id, p.entry.name)

	const overlay = (i: number, size: { w: number; h: number }, scale: number) => {
		if (!peers.length) return null
		const pg = info(i)
		const k = 1 / FX
		const px = 1 / scale
		const tag = (key: string, x: number, y: number, p: Peer) => (
			<g key={key}>
				<rect
					x={x}
					y={y - 13 * px}
					width={(p.entry.name.length * 6.5 + 8) * px}
					height={13 * px}
					rx={2 * px}
					fill={p.color}
				/>
				<text x={x + 4 * px} y={y - 3 * px} fontSize={10 * px} fill="#fff">
					{p.entry.name}
				</text>
			</g>
		)
		const svg: React.ReactNode[] = []
		for (const p of peers) {
			const id = p.entry.connId
			if (p.sel) {
				for (const r of p.rects?.get(i) ?? [])
					svg.push(
						<rect
							key={`${id}:s:${r.x}:${r.y}`}
							x={r.x * k}
							y={r.y * k}
							width={r.w * k}
							height={r.h * k}
							fill={p.color}
							fillOpacity={0.2}
						/>
					)
				const c = p.caret
				if (c?.page === i) {
					svg.push(
						<line
							key={`${id}:c`}
							x1={c.x * k}
							x2={c.x * k}
							y1={c.top * k}
							y2={c.bottom * k}
							stroke={p.color}
							strokeWidth={2 * px}
						/>
					)
					svg.push(tag(`${id}:ct`, c.x * k, c.top * k, p))
				}
			}
			if (pg && p.page === i && p.frames.length) {
				for (const it of pageItems(doc, pg, p.layout)) {
					if (!p.frames.includes(it.id)) continue
					const b = boxOf(it)
					svg.push(
						<g
							key={`${id}:f:${it.id}`}
							transform={`rotate(${b.rot} ${(b.x + b.w / 2) * k} ${(b.y + b.h / 2) * k})`}
						>
							<rect
								x={b.x * k}
								y={b.y * k}
								width={b.w * k}
								height={b.h * k}
								fill="none"
								stroke={p.color}
								strokeWidth={2 * px}
							/>
							{tag('t', b.x * k, b.y * k, p)}
						</g>
					)
				}
			}
		}
		const editing = pg ? peers.filter((p) => p.layout && p.layout === pg.master) : []
		if (!svg.length && !editing.length) return null
		return (
			<>
				{svg.length > 0 && (
					<svg
						viewBox={`0 0 ${size.w * k} ${size.h * k}`}
						preserveAspectRatio="none"
						aria-hidden="true"
						style={{
							position: 'absolute',
							inset: 0,
							width: '100%',
							height: '100%',
							pointerEvents: 'none',
							overflow: 'visible'
						}}
					>
						{svg}
					</svg>
				)}
				{editing.length > 0 && (
					<div
						className="p-1"
						style={{
							position: 'absolute',
							top: 0,
							left: 0,
							right: 0,
							pointerEvents: 'none',
							fontSize: '0.8em',
							color: '#fff',
							background: editing[0].color,
							opacity: 0.9
						}}
					>
						{t('{{names}} is editing this page layout', {
							names: editing.map((p) => p.entry.name).join(', ')
						})}
					</div>
				)}
			</>
		)
	}

	const scrollTo = (user: PresenceEntry) => {
		// DocBar entries are deduplicated (no `state`): match the connection, else the idTag.
		const p =
			peers.find((x) => x.entry.connId === user.connId) ??
			peers.find((x) => !!user.idTag && x.entry.idTag === user.idTag)
		if (!p) return
		const c = p.caret
		const n = c?.page ?? p.page
		const ref = n !== undefined ? pages[n] : undefined
		if (!ref) return
		const h = info(n as number)?.h
		scrollToPage(ref.key, c && h ? (c.top + c.bottom) / 2 / h : undefined)
	}

	return { locked, overlay, scrollTo }
}

// vim: ts=4
