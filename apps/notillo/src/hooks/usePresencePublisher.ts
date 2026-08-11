// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { BlockNoteEditor } from '@blocknote/core'
import type { RtdbPresence } from '@cloudillo/rtdb'
import { useEffect } from 'react'

/**
 * Publishes where this user is — which page, and which block the caret is in —
 * onto the RTDB presence channel.
 *
 * A sibling of `useEditorLocks`, not a replacement for it. The two look alike at
 * the wiring level (both follow `onSelectionChange`) but do different jobs and
 * have different lifetimes: a lock is behavioural and gates writes, so it exists
 * only for someone who can write; presence is informational, so a read-only
 * viewer publishes it and could never take a lock. Both firing on one selection
 * change is fine — they are independent commands on the same socket.
 *
 * Nothing here is scoped by an RTDB path. `page` and `block` are ordinary fields
 * of the free-form presence state, filtered client-side by whoever is looking —
 * the same way ideallo carries a cursor in awareness. The server never inspects
 * them.
 */
export function usePresencePublisher(
	editor: BlockNoteEditor | undefined,
	presence: RtdbPresence | undefined,
	pageId: string
): void {
	useEffect(() => {
		if (!presence) return

		// Before the caret has moved anywhere: opening a page is already worth
		// telling peers about, and the sidebar groups on `page` alone.
		presence.setState({ page: pageId })

		// `setState` replaces this app's half of the state wholesale, so the page
		// has to be repeated on every publish.
		let publishedBlockId: string | undefined
		const publish = () => {
			const textCursor = editor?.getTextCursorPosition()
			const blockId = textCursor?.block?.id
			if (blockId === publishedBlockId) return
			publishedBlockId = blockId
			presence.setState(blockId ? { page: pageId, block: blockId } : { page: pageId })
		}

		const unsubscribe = editor?.onSelectionChange(publish)

		return () => {
			unsubscribe?.()
			// A page switch remounts this hook, and React runs this cleanup before
			// the next effect — so clearing here cannot wipe the new page's state,
			// but it does stop the old page's block lingering in every peer's roster.
			presence.setState({})
		}
	}, [editor, presence, pageId])
}

// vim: ts=4
