// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Left Pages rail: thumbnails grouped by section separators, plus a "Laying out…" row
 * while the worker is behind. With `onSection` (layout editing allowed) a separator opens the
 * section popover (sections are reordered in the Sections tab only). With `onAddPage`/
 * `onDeletePage` a thumbnail's context menu (right click, Shift+F10) offers "+ Add page" /
 * "Delete page" and, with `onEditLayout`, "Edit layout…". Pages are not draggable (they follow
 * the text). Rendered inside the rail `<nav>` that the app owns (with the tab bar).
 */

import {
	Button,
	isKeyboardContextMenu,
	Menu,
	MenuItem,
	useDebouncedValue,
	useNearSet
} from '@cloudillo/react'
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
	/** Display name of section `id` (separator label). */
	sectionName(id: string): string
	/** Separator clicked: open the section popover anchored to `el`. Absent = read-only rail. */
	onSection?(id: string, el: HTMLElement): void
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
	sectionName,
	onSection,
	onAddPage,
	onDeletePage,
	onEditLayout,
	highlightMaster,
	dropTarget,
	railRef
}: PagesRailProps) {
	const { t } = useTranslation()
	const [menu, setMenu] = React.useState<{
		n: number
		position?: { x: number; y: number }
		anchor?: HTMLElement
	}>()
	// Thumbnails repaint once typing pauses, not on every layout snapshot.
	const pages = useDebouncedValue(layout.pages, THUMB_DEBOUNCE_MS)
	const laying = useDelayed(layout.pending, 500)
	// Keys of thumbnails within one screen of the rail's view: only those mount a `PageCanvas`.
	const near = useNearSet(railRef, '.pagillo-thumb[data-key]', 'key', [layout.sections])

	React.useEffect(() => {
		railRef.current
			?.querySelector('[aria-current="page"]')
			?.scrollIntoView({ block: 'nearest' })
	}, [current])

	// Global page number of each section's first page.
	const starts: number[] = []
	let total = 0
	for (const s of layout.sections) {
		starts.push(total)
		total += s.pages
	}
	const label = (si: number) => {
		const s = layout.sections[si]
		return s ? sectionName(s.id) : t('Section {{n}}', { n: si + 1 })
	}

	const group = (s: RailSection, si: number) => (
		<>
			{onSection ? (
				<div className="c-hbox pagillo-rail-sep small">
					<Button
						variant="link"
						size="sm"
						onClick={(e) => onSection(s.id, e.currentTarget)}
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
										// Keyboard (Shift+F10): anchor to the thumbnail
										setMenu(
											isKeyboardContextMenu(e)
												? { n, anchor: e.currentTarget }
												: { n, position: { x: e.clientX, y: e.clientY } }
										)
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
		<>
			{layout.sections.map((s, si) => (
				<React.Fragment key={s.id}>{group(s, si)}</React.Fragment>
			))}
			{menu && onAddPage && (
				<Menu
					position={menu.position}
					anchor={menu.anchor}
					onClose={() => setMenu(undefined)}
				>
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
		</>
	)
}

// vim: ts=4
