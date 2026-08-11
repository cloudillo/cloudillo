// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { BlockNoteEditor } from '@blocknote/core'
import { useEffect, useRef } from 'react'

import type { BlockLock } from './useBlockLocks.js'

/** A peer whose caret is in a block, as the presence roster describes them. */
export interface BlockPeer {
	/** Already resolved against the owner's node by `useDocPresence`. */
	name: string
	/** `idHue(idTag ?? connId)` — the platform-wide identity hue. */
	hue: number
}

/**
 * Injects a <style> element with CSS rules that target locked blocks by their
 * `data-id` attribute.  This survives ProseMirror DOM reconstruction — unlike
 * direct classList manipulation which gets wiped when ProseMirror patches the DOM.
 *
 * Locks and presence are marked by the SAME indicator on purpose. A peer editing
 * a block produces both — a soft lock and a presence entry naming the block — so
 * two independent stylesheets would stack two badges on one block. Presence wins
 * where it exists, because it carries a display name and an identity colour; a
 * block with a lock but no presence entry (a peer on an older client, or one whose
 * presence frame has not arrived yet) falls back to the warning colour and a bare
 * `userId`.
 */
export function useLockIndicators(
	_editor: BlockNoteEditor | undefined,
	locks: Map<string, BlockLock>,
	presence?: Map<string, BlockPeer>
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

	useEffect(() => {
		if (!styleRef.current) return

		// Both a selector's attribute value and a `content` string are CSS strings:
		// a backslash and a double quote need escaping, and a raw newline would
		// terminate the string and drop the whole rule. Belt and braces —
		// `readPresenceUser` already strips control characters from peer names.
		const cssString = (s: string) =>
			s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\A ')

		const rules: string[] = []
		// The union: a block can have a lock, a peer's caret, or both.
		const blockIds = new Set<string>(locks.keys())
		if (presence) for (const blockId of presence.keys()) blockIds.add(blockId)

		for (const blockId of blockIds) {
			const peer = presence?.get(blockId)
			const label = peer?.name || locks.get(blockId)?.userId || ''
			if (!label) continue
			const sel = `.bn-block-outer[data-id="${cssString(blockId)}"]`
			const safeLabel = cssString(label)

			// Only the hue is pinned here; the two lightness pairs live in CSS so a
			// theme flip recolours the indicator with no re-render — the same reason
			// the lock-only branch keeps `var(--col-warning)` rather than a resolved
			// colour. `body.dark` is how this codebase marks dark mode.
			if (peer) {
				rules.push(`${sel} {
	--notillo-peer-hue: ${peer.hue};
	--notillo-peer-col: lch(45 70 var(--notillo-peer-hue));
	--notillo-peer-fg: lch(98 10 var(--notillo-peer-hue));
}`)
				rules.push(`body.dark ${sel} {
	--notillo-peer-col: lch(68 70 var(--notillo-peer-hue));
	--notillo-peer-fg: lch(12 15 var(--notillo-peer-hue));
}`)
			} else {
				rules.push(`${sel} {
	--notillo-peer-col: var(--col-warning);
	--notillo-peer-fg: var(--col-on-warning);
}`)
			}

			rules.push(`${sel} {
	position: relative;
	border-left: 3px solid var(--notillo-peer-col);
	background: linear-gradient(90deg, color-mix(in srgb, var(--notillo-peer-col) 15%, transparent) 0%, transparent 100%);
	border-radius: 2px 0 0 2px;
	transition: background var(--duration-fast) var(--ease-default), border-color var(--duration-fast) var(--ease-default);
}`)
			rules.push(`${sel}::after {
	content: "${safeLabel}";
	position: absolute;
	top: 0;
	right: 0;
	display: inline-flex;
	align-items: center;
	padding: 0.125rem 0.5rem;
	background: var(--notillo-peer-col);
	color: var(--notillo-peer-fg);
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
	}, [locks, presence])
}

// vim: ts=4
