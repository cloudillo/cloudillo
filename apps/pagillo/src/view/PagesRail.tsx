// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Left Pages rail: thumbnails grouped by section separators, plus a "Laying out…" row
 * while the worker is behind. With `onSection` (layout editing allowed) a separator opens the
 * section popover, drags (handle + Move menu) to reorder sections, and Alt+↑/↓ moves its
 * section. With `onAddPage`/`onDeletePage` a thumbnail's context menu (right click, Shift+F10)
 * offers "+ Add page" / "Delete page" and, with `onEditLayout`, "Edit layout…". Pages are not
 * draggable (they follow the text).
 */

import { Button, Menu, MenuItem, SortableList, useDebouncedValue } from '@cloudillo/react'
import { FX } from '@cloudillo/typeset'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { type LayoutState, pageKey } from '../layout/useLayout'
import { PageCanvas } from './PageCanvas'
import type { ImageSource } from './PageSvg'
import { useDelayed } from './StatusBar'

/** Thumbnail width, CSS px. */
const THUMB_W = 96
/** Thumbnails repaint this long after the last layout snapshot, ms. */
const THUMB_DEBOUNCE_MS = 400

type RailSection = LayoutState['sections'][number]

export interface PagesRailProps {
	layout: LayoutState
	/** Global index of the current page. */
	current: number
	defaultPage: { w: number; h: number }
	src: ImageSource
	onJump(key: string): void
	/** Separator clicked: open the section popover anchored to `el`. Absent = read-only rail. */
	onSection?(id: string, el: HTMLElement): void
	/** Move a section to `toIndex` in the flow order (drag, Move menu, Alt+↑/↓). */
	onMoveSection?(id: string, toIndex: number): void
	/** "+ Add page" after global page `n`. Absent = no page menu. */
	onAddPage?(n: number): void
	/** "Delete page" `n` (the caller confirms). */
	onDeletePage?(n: number): void
	/** "Edit layout…" for the page layout of global page `n`. */
	onEditLayout?(n: number): void
	/** Edit layout: mark pages using this page layout (accent bar), dim the others. */
	highlightMaster?: string
	/** Page key of the thumbnail a frame move drag would drop on (accent outline + label). */
	dropTarget?: string
	/** The rail's scroller (the pages' drag auto-scroll). */
	railRef: React.RefObject<HTMLElement | null>
}

export function PagesRail({
	layout,
	current,
	defaultPage,
	src,
	onJump,
	onSection,
	onMoveSection,
	onAddPage,
	onDeletePage,
	onEditLayout,
	highlightMaster,
	dropTarget,
	railRef
}: PagesRailProps) {
	const { t } = useTranslation()
	const [menu, setMenu] = React.useState<{ n: number; x: number; y: number }>()
	// Keys of thumbnails within one screen of the rail's view: only those mount a `PageCanvas`.
	const [near, setNear] = React.useState<ReadonlySet<string>>(() => new Set())
	const sortable = !!(onSection && onMoveSection)
	// Thumbnails repaint once typing pauses, not on every layout snapshot.
	const pages = useDebouncedValue(layout.pages, THUMB_DEBOUNCE_MS)
	const laying = useDelayed(layout.pending, 500)
	React.useEffect(() => {
		const el = railRef.current
		if (!el) return
		const io = new IntersectionObserver(
			(es) => {
				setNear((prev) => {
					const next = new Set(prev)
					for (const e of es) {
						const k = (e.target as HTMLElement).dataset.key
						if (!k) continue
						if (e.isIntersecting) next.add(k)
						else next.delete(k)
					}
					return next
				})
			},
			{ root: el, rootMargin: '100% 0px' }
		)
		for (const th of el.querySelectorAll('.pagillo-thumb[data-key]')) io.observe(th)
		return () => io.disconnect()
	}, [layout.sections, sortable])

	React.useEffect(() => {
		document
			.querySelector('.pagillo-rail [aria-current="page"]')
			?.scrollIntoView({ block: 'nearest' })
	}, [current])

	// Global page number of each section's first page.
	const starts: number[] = []
	let total = 0
	for (const s of layout.sections) {
		starts.push(total)
		total += s.pages
	}
	const label = (si: number) => t('Section {{n}}', { n: si + 1 })

	const group = (s: RailSection, si: number, handle?: React.ReactNode) => (
		<>
			{onSection ? (
				<div className="c-hbox pagillo-rail-sep small">
					{handle}
					<Button
						variant="link"
						size="sm"
						onClick={(e) => onSection(s.id, e.currentTarget)}
						onKeyDown={(e) => {
							if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
							e.preventDefault()
							onMoveSection?.(s.id, si + (e.key === 'ArrowUp' ? -1 : 1))
						}}
					>
						{label(si)}
					</Button>
				</div>
			) : (
				<div className="pagillo-rail-sep small text-muted">{label(si)}</div>
			)}
			{Array.from({ length: s.pages }, (_, i) => {
				const key = pageKey(s.id, i)
				const n = starts[si] + i
				const dl = pages.get(key)
				const size = dl?.page ?? defaultPage
				const scale = THUMB_W / (size.w / FX)
				const uses = highlightMaster ? dl?.page.master === highlightMaster : undefined
				return (
					<Button
						key={key}
						variant="link"
						className={
							key === dropTarget ? 'pagillo-thumb drop-target' : 'pagillo-thumb'
						}
						data-key={key}
						style={
							uses === undefined
								? undefined
								: uses
									? { boxShadow: 'inset 3px 0 0 var(--col-accent)' }
									: { opacity: 0.45 }
						}
						aria-label={
							uses
								? t('Page {{n}} · uses this layout', { n: n + 1 })
								: t('Page {{n}}', { n: n + 1 })
						}
						aria-current={n === current ? 'page' : undefined}
						title={t('Pages follow the text and cannot be dragged')}
						onClick={() => onJump(key)}
						onContextMenu={
							onAddPage
								? (e) => {
										e.preventDefault()
										const r = e.currentTarget.getBoundingClientRect()
										// Keyboard (Shift+F10) opens at 0,0: anchor to the thumbnail.
										const kb = e.clientX === 0 && e.clientY === 0
										setMenu({
											n,
											x: kb ? r.right : e.clientX,
											y: kb ? r.top : e.clientY
										})
									}
								: undefined
						}
					>
						<div
							className="pagillo-thumb-page"
							style={{ width: THUMB_W, height: (size.h / FX) * scale }}
						>
							{dl && near.has(key) && (
								<PageCanvas
									dl={dl}
									scale={scale}
									src={src}
									glyphs={layout.glyphDefs}
								/>
							)}
						</div>
						<span className="small">
							{key === dropTarget ? t('Move to page {{n}}', { n: n + 1 }) : n + 1}
						</span>
					</Button>
				)
			})}
		</>
	)

	return (
		<nav ref={railRef} className="pagillo-rail" aria-label={t('Pages')}>
			{onSection && onMoveSection ? (
				<SortableList
					className="pagillo-rail-list"
					items={layout.sections}
					getKey={(s) => s.id}
					getLabel={(s) => label(layout.sections.indexOf(s))}
					onReorder={(from, to) => {
						const s = layout.sections[from]
						if (s) onMoveSection(s.id, to)
					}}
					renderItem={(s, st) => (
						// Same flow as `.pagillo-rail`.
						<div className="c-vbox" style={{ alignItems: 'center', gap: 4 }}>
							{group(s, st.index, st.handle)}
						</div>
					)}
				/>
			) : (
				layout.sections.map((s, si) => (
					<React.Fragment key={s.id}>{group(s, si)}</React.Fragment>
				))
			)}
			{menu && onAddPage && (
				<Menu position={{ x: menu.x, y: menu.y }} onClose={() => setMenu(undefined)}>
					<MenuItem label={t('+ Add page')} onClick={() => onAddPage(menu.n)} />
					{onDeletePage && (
						<MenuItem
							label={t('Delete page')}
							danger
							onClick={() => onDeletePage(menu.n)}
						/>
					)}
					{onEditLayout && (
						<MenuItem label={t('Edit layout…')} onClick={() => onEditLayout(menu.n)} />
					)}
				</Menu>
			)}
			{laying && (
				<div className="pagillo-rail-pending small text-muted">{t('Laying out…')}</div>
			)}
		</nav>
	)
}

// vim: ts=4
