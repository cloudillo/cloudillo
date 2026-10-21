// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { getAppBus } from '@cloudillo/core'
import { useReflowViewReport } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import type { NotilloEditor } from '../editor/schema.js'
import { cssString, firstHeading, formatBlockRangeNav, resolveBlockRange } from '../embed-range.js'

const NO_ELEMENT: React.RefObject<HTMLElement | null> = { current: null }

/** The resolved block range: its effective top-level ends, or the start block is gone. */
type RangeInfo = { missing: true } | { start: string; end: string; heading?: string }

/** Top-level blocks; their siblings are top-level too, so `~` stays at that level. */
const TOP_BLOCK = '.notillo-editor .bn-editor > .bn-block-group > .bn-block-outer'

export interface BlockRangeOptions {
	embedded?: boolean
	pageId: string
	/** A `blk:` range on this page: view mode shows only it, pick-view starts on it */
	rangeStart?: string
	rangeEnd?: string
	embedTitle?: string
}

/**
 * Block-range embeds: resolves the range, reports the embed view to the host and
 * returns the CSS that hides everything outside the range (view mode only).
 */
export function useBlockRange(
	editor: NotilloEditor,
	editorRef: React.RefObject<HTMLDivElement | null>,
	{ embedded, pageId, rangeStart, rangeEnd, embedTitle }: BlockRangeOptions
): string | undefined {
	const { t } = useTranslation()
	const pickView = getAppBus().pickView

	// Block range: view mode resolves `rangeStart..rangeEnd`, pick-view the same until the
	// user picks, then the selection widened to its top-level ancestors (no initial range ⇒
	// the whole page). Re-resolved on every change, as blocks sync in, move or vanish.
	const rangeMode = !!embedded && (pickView || !!rangeStart)
	const [rangeInfo, setRangeInfo] = React.useState<RangeInfo | undefined>()
	React.useEffect(() => {
		if (!rangeMode) {
			setRangeInfo(undefined)
			return
		}
		const topLevelId = (id: string) => {
			let top = id
			for (let p = editor.getParentBlock(id); p; p = editor.getParentBlock(p.id)) {
				top = p.id
			}
			return top
		}
		// setSelection throws on a single block or one without inline content, so the
		// initial range is reported as-is until the user actually picks
		let userPicked = false
		let positioning = false
		// Pick-view: the initial range only positions the UI, once its blocks have synced in.
		// The app passes it for the first visit of its page only.
		let positioned = !(pickView && rangeStart)
		let raf = 0
		const position = () => {
			if (!rangeStart) return
			const doc = editor.document
			const r = resolveBlockRange(doc, rangeStart, rangeEnd ?? rangeStart)
			if (!r) return
			const startId = doc[r.from].id
			const endId = doc[r.to].id
			positioning = true
			try {
				if (startId !== endId) editor.setSelection(startId, endId)
			} catch {
				// Cosmetic only: the range is reported regardless
			} finally {
				positioning = false
			}
			editorRef.current
				?.querySelector(`[data-id="${cssString(startId)}"]`)
				?.scrollIntoView({ block: 'start' })
		}
		const update = () => {
			let start = rangeStart
			let end = rangeEnd ?? rangeStart
			if (pickView && userPicked) {
				// Collapsed caret / node selection → the cursor block
				const sel = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block]
				start = topLevelId(sel[0].id)
				end = topLevelId(sel[sel.length - 1].id)
			}
			let next: RangeInfo | undefined
			if (start && end) {
				const doc = editor.document
				const r = resolveBlockRange(doc, start, end)
				next = r
					? {
							start: doc[r.from].id,
							end: doc[r.to].id,
							heading: firstHeading(doc.slice(r.from, r.to + 1))
						}
					: { missing: true }
			}
			setRangeInfo((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
			if (!positioned && next && 'start' in next) {
				positioned = true
				raf = requestAnimationFrame(position)
			}
		}
		update()
		const offChange = editor.onChange(update)
		// Emitted synchronously by tiptap; remote changes are excluded by default
		const offSelection = pickView
			? editor.onSelectionChange(() => {
					if (!positioning) userPicked = true
					update()
				})
			: undefined
		return () => {
			offChange?.()
			offSelection?.()
			cancelAnimationFrame(raf)
		}
	}, [editor, editorRef, rangeMode, pickView, rangeStart, rangeEnd])

	// Lives in the editor rather than the app: the element remounts per page
	// (`key={activePageId}`), and the report hook only attaches on mount / base change.
	const viewNav = rangeStart
		? formatBlockRangeNav(pageId, rangeStart, rangeEnd ?? rangeStart)
		: pageId
	const reportBaseFor = () => {
		if (!embedded) return undefined
		if (!rangeInfo) {
			// View-mode range not resolved yet
			if (!pickView && rangeStart) return undefined
			return {
				nav: pageId,
				viewId: pageId,
				named: true,
				title: embedTitle,
				a11yLabel: embedTitle ? t('Page "{{title}}"', { title: embedTitle }) : undefined
			}
		}
		if ('missing' in rangeInfo) return { nav: viewNav, missing: true, title: embedTitle }
		return {
			nav: pickView ? formatBlockRangeNav(pageId, rangeInfo.start, rangeInfo.end) : viewNav,
			title: embedTitle,
			a11yLabel:
				[embedTitle && t('Blocks from {{title}}', { title: embedTitle }), rangeInfo.heading]
					.filter(Boolean)
					.join(' — ') || undefined
		}
	}
	const reportBase = reportBaseFor()
	useReflowViewReport(reportBase ? editorRef : NO_ELEMENT, reportBase ?? {})

	// View mode shows only the range's top-level blocks (children travel with their
	// parent). An injected rule, not a class: ProseMirror rewrites block DOM and would
	// drop one. Until resolved, and when the start is gone, nothing is shown.
	return embedded && !pickView && rangeStart
		? rangeInfo && 'start' in rangeInfo
			? `${TOP_BLOCK}:not([data-id="${cssString(rangeInfo.start)}"], [data-id="${cssString(rangeInfo.start)}"] ~ .bn-block-outer), ${TOP_BLOCK}[data-id="${cssString(rangeInfo.end)}"] ~ .bn-block-outer { display: none; }`
			: `${TOP_BLOCK} { display: none; }`
		: undefined
}

// vim: ts=4
