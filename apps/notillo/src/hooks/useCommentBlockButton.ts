// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useEffect, useRef } from 'react'

/**
 * Shows a floating comment button (💬+) at the top-right of editor blocks
 * on hover. Desktop-only enhancement — skipped on touch devices.
 *
 * Blocks that already have open comment threads (in existingBlockIds) are
 * skipped since they already have badges from useCommentIndicators.
 */
export function useCommentBlockButton(
	enabled: boolean,
	existingBlockIds: Set<string>,
	onCommentBlock: (blockId: string) => void
) {
	const onCommentBlockRef = useRef(onCommentBlock)
	onCommentBlockRef.current = onCommentBlock
	const existingBlockIdsRef = useRef(existingBlockIds)
	existingBlockIdsRef.current = existingBlockIds

	useEffect(() => {
		// Skip on touch-only devices
		if (!enabled || !window.matchMedia('(hover: hover)').matches) return

		const btn = document.createElement('button')
		btn.className = 'notillo-comment-block-btn'
		btn.textContent = '💬+'
		btn.title = 'Comment'

		const scrollArea = document.querySelector('.c-fcd-content-scroll')
		if (!scrollArea) return

		// Append to the scroll area so positioning is relative to it
		const scrollParent = scrollArea as HTMLElement
		const wasStatic = getComputedStyle(scrollParent).position === 'static'
		if (wasStatic) {
			scrollParent.style.position = 'relative'
		}
		scrollParent.appendChild(btn)

		let activeBlockId: string | null = null
		let hideTimeout: ReturnType<typeof setTimeout> | null = null

		function positionButton(blockOuter: HTMLElement) {
			const blockRect = blockOuter.getBoundingClientRect()
			const scrollRect = scrollParent.getBoundingClientRect()
			btn.style.top = `${blockRect.top - scrollRect.top + scrollParent.scrollTop + 2}px`
			btn.style.right = '4px'
			btn.classList.add('visible')
		}

		function handleMouseOver(e: MouseEvent) {
			const target = e.target as HTMLElement
			const blockOuter = target.closest('.bn-block-outer[data-id]') as HTMLElement | null
			if (!blockOuter) return

			const blockId = blockOuter.dataset.id
			if (!blockId || existingBlockIdsRef.current.has(blockId)) {
				// Block has existing threads — don't show button
				if (activeBlockId) {
					btn.classList.remove('visible')
					activeBlockId = null
				}
				return
			}

			if (hideTimeout) {
				clearTimeout(hideTimeout)
				hideTimeout = null
			}

			activeBlockId = blockId
			positionButton(blockOuter)
		}

		function handleMouseOut(e: MouseEvent) {
			const related = e.relatedTarget as HTMLElement | null
			// Don't hide if moving to the button itself
			if (related && btn.contains(related)) return
			// Don't hide if moving between child elements of the same block
			if (related) {
				const blockOuter = related.closest('.bn-block-outer[data-id]') as HTMLElement | null
				if (blockOuter?.dataset.id === activeBlockId) return
			}

			hideTimeout = setTimeout(() => {
				btn.classList.remove('visible')
				activeBlockId = null
				hideTimeout = null
			}, 100)
		}

		function handleButtonMouseEnter() {
			if (hideTimeout) {
				clearTimeout(hideTimeout)
				hideTimeout = null
			}
		}

		function handleButtonMouseLeave() {
			hideTimeout = setTimeout(() => {
				btn.classList.remove('visible')
				activeBlockId = null
				hideTimeout = null
			}, 100)
		}

		function handleButtonClick(e: MouseEvent) {
			e.preventDefault()
			e.stopPropagation()
			if (activeBlockId) {
				onCommentBlockRef.current(activeBlockId)
				btn.classList.remove('visible')
				activeBlockId = null
			}
		}

		function handleScroll() {
			btn.classList.remove('visible')
			activeBlockId = null
		}

		scrollParent.addEventListener('mouseover', handleMouseOver)
		scrollParent.addEventListener('mouseout', handleMouseOut)
		btn.addEventListener('mouseenter', handleButtonMouseEnter)
		btn.addEventListener('mouseleave', handleButtonMouseLeave)
		btn.addEventListener('click', handleButtonClick)
		scrollParent.addEventListener('scroll', handleScroll, { passive: true })

		return () => {
			scrollParent.removeEventListener('mouseover', handleMouseOver)
			scrollParent.removeEventListener('mouseout', handleMouseOut)
			btn.removeEventListener('mouseenter', handleButtonMouseEnter)
			btn.removeEventListener('mouseleave', handleButtonMouseLeave)
			btn.removeEventListener('click', handleButtonClick)
			scrollParent.removeEventListener('scroll', handleScroll)
			if (hideTimeout) clearTimeout(hideTimeout)
			btn.remove()
			if (wasStatic) {
				scrollParent.style.position = ''
			}
		}
	}, [enabled])
}

// vim: ts=4
