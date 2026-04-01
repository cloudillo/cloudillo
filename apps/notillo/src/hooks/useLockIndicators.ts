// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useEffect, useRef } from 'react'
import type { BlockNoteEditor } from '@blocknote/core'
import type { BlockLock } from './useBlockLocks.js'

/**
 * Injects a <style> element with CSS rules that target locked blocks by their
 * `data-id` attribute.  This survives ProseMirror DOM reconstruction — unlike
 * direct classList manipulation which gets wiped when ProseMirror patches the DOM.
 */
export function useLockIndicators(
	_editor: BlockNoteEditor | undefined,
	locks: Map<string, BlockLock>
) {
	const styleRef = useRef<HTMLStyleElement | null>(null)

	// Create the <style> element once and remove it on unmount
	useEffect(() => {
		const style = document.createElement('style')
		style.setAttribute('data-notillo-locks', '')
		document.head.appendChild(style)
		styleRef.current = style
		return () => {
			style.remove()
			styleRef.current = null
		}
	}, [])

	// Update CSS rules when locks change
	useEffect(() => {
		if (!styleRef.current) return

		const rules: string[] = []
		for (const [blockId, lock] of locks) {
			const sel = `.bn-block-outer[data-id="${blockId}"]`
			const safeUserId = lock.userId.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

			rules.push(`${sel} {
	position: relative;
	border-left: 3px solid var(--col-warning);
	background: linear-gradient(90deg, color-mix(in srgb, var(--col-warning) 15%, transparent) 0%, transparent 100%);
	border-radius: 2px 0 0 2px;
	transition: background var(--duration-fast) var(--ease-default), border-color var(--duration-fast) var(--ease-default);
}`)
			rules.push(`${sel}::after {
	content: "${safeUserId}";
	position: absolute;
	top: 0;
	right: 0;
	display: inline-flex;
	align-items: center;
	padding: 0.125rem 0.5rem;
	background: var(--col-warning);
	color: var(--col-on-warning);
	border-radius: 0 0 0 var(--radius-sm);
	font-size: 0.7rem;
	font-weight: 500;
	white-space: nowrap;
	letter-spacing: 0.02em;
	pointer-events: none;
	z-index: 10;
}`)
		}

		styleRef.current.textContent = rules.join('\n')
	}, [locks])
}

// vim: ts=4
