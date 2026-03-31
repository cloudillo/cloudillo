// This file is part of the Cloudillo Platform.
// Copyright (C) 2026  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { useEffect, useRef, useMemo } from 'react'
import type { CommentThread } from '@cloudillo/react'

import { anchorBlockId } from '../comments/utils.js'

/**
 * Injects CSS rules that show comment badges (::after pseudo-elements) on
 * editor blocks that have comment threads. Uses the same <style> injection
 * pattern as useLockIndicators — no DOM manipulation inside the editor tree,
 * so it's safe from MutationObserver loops.
 *
 * Clicks on blocks with badges are handled via event delegation on the
 * scroll container, since ::after pseudo-elements can't have click handlers.
 */
export function useCommentIndicators(
	threads: CommentThread[],
	onBadgeClick: (blockId: string) => void
) {
	const styleRef = useRef<HTMLStyleElement | null>(null)
	const onBadgeClickRef = useRef(onBadgeClick)
	onBadgeClickRef.current = onBadgeClick

	// Build block→threads map and counts (memoized)
	const { blockThreadMap, blockCounts } = useMemo(() => {
		const map = new Map<string, CommentThread[]>()
		const counts = new Map<string, number>()
		for (const thread of threads) {
			if (thread.status !== 'open') continue
			const blockId = anchorBlockId(thread.anchor)
			if (blockId) {
				const list = map.get(blockId) ?? []
				list.push(thread)
				map.set(blockId, list)
				counts.set(blockId, (counts.get(blockId) ?? 0) + 1)
			}
		}
		return { blockThreadMap: map, blockCounts: counts }
	}, [threads])

	// Create <style> element once, clean up on unmount
	useEffect(() => {
		const style = document.createElement('style')
		style.setAttribute('data-notillo-comments', '')
		document.head.appendChild(style)
		styleRef.current = style
		return () => {
			style.remove()
			styleRef.current = null
		}
	}, [])

	// Update CSS rules when block counts change
	useEffect(() => {
		if (!styleRef.current) return

		const rules: string[] = []
		for (const [blockId, count] of blockCounts) {
			const eid = CSS.escape(blockId)
			const sel = `.bn-block-outer[data-id="${eid}"]`
			const label = count > 1 ? `\\1F4AC  ${count}` : '\\1F4AC'

			rules.push(`${sel} { position: relative; }`)
			rules.push(`${sel}::after {
	content: "${label}";
	position: absolute;
	top: 2px;
	right: 4px;
	display: inline-flex;
	align-items: center;
	gap: 2px;
	padding: 2px 6px;
	background: color-mix(in srgb, var(--col-primary) 15%, transparent);
	color: var(--col-primary);
	border-radius: var(--radius-sm);
	font-size: 0.7rem;
	font-weight: 600;
	white-space: nowrap;
	pointer-events: none;
	z-index: 5;
}`)
		}

		styleRef.current.textContent = rules.join('\n')
	}, [blockCounts])

	// Event delegation: clicks on blocks with comment badges open the popup.
	// ::after pseudo-elements have pointer-events: none, so the click lands
	// on the .bn-block-outer itself. We check if that block has comments.
	const blockCountsRef = useRef(blockCounts)
	blockCountsRef.current = blockCounts

	useEffect(() => {
		function handleClick(e: MouseEvent) {
			const target = e.target as HTMLElement
			const blockOuter = target.closest('.bn-block-outer[data-id]') as HTMLElement | null
			if (!blockOuter) return

			const blockId = blockOuter.dataset.id
			if (!blockId || !blockCountsRef.current.has(blockId)) return

			// Check if click was in the badge area (top-right corner of block)
			const rect = blockOuter.getBoundingClientRect()
			if (e.clientX > rect.right - 50 && e.clientY < rect.top + 24) {
				e.preventDefault()
				onBadgeClickRef.current(blockId)
			}
		}

		document.addEventListener('click', handleClick, true)
		return () => document.removeEventListener('click', handleClick, true)
	}, [])

	return { blockThreadMap }
}

// vim: ts=4
