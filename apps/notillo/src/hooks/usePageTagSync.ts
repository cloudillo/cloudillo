// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { BlockNoteEditor } from '@blocknote/core'
import type { RtdbClient } from '@cloudillo/rtdb'
import { useEffect, useRef } from 'react'

import { extractTagsFromBlocks } from '../utils/tag-utils.js'

const TAG_SYNC_DEBOUNCE_MS = 1000

/**
 * Keep the page record's `tg` in step with the tags in its blocks.
 *
 * Returns a `flush` ref, mirroring `useDocumentSync`: publishing reads `tg` straight
 * out of RTDB — it feeds the tag listings, the per-tag fragments, the feed
 * `<category>` terms and `manifest.pages[].tags` — and at a second, this debounce is
 * the likelier of the two to still be pending when the author hits Publish.
 */
export function usePageTagSync(
	editor: BlockNoteEditor | undefined,
	client: RtdbClient | undefined,
	pageId: string | undefined,
	pageTags: string[] | undefined,
	readOnly: boolean
) {
	const lastSyncedTags = useRef<string | undefined>(undefined)
	const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const flush = useRef<() => void>(() => {})

	useEffect(() => {
		if (!editor || !client || !pageId || readOnly) return

		// Self-healing on mount: extract current tags and compare with stored
		const currentTags = extractTagsFromBlocks(editor.document)
		const currentKey = JSON.stringify(currentTags)
		const storedKey = JSON.stringify(pageTags ?? [])
		lastSyncedTags.current = storedKey

		if (currentKey !== storedKey) {
			// Stored tags are stale — correct them
			lastSyncedTags.current = currentKey
			client.collection('p').doc(pageId).update({ tg: currentTags }).catch(console.error)
		}

		/** The tags as of the last edit, captured then rather than read at fire time. */
		let pendingTags: string[] | undefined

		function writeTags(tags: string[]) {
			const key = JSON.stringify(tags)
			if (key === lastSyncedTags.current) return
			lastSyncedTags.current = key
			client!.collection('p').doc(pageId!).update({ tg: tags }).catch(console.error)
		}

		function flushPending() {
			if (!pendingTags) return
			const tags = pendingTags
			pendingTags = undefined
			writeTags(tags)
		}

		const unsubscribe = editor.onChange(() => {
			// Read now, written later. The teardown below flushes while the editor may
			// already be tearing down, and re-reading it there would yield nothing and
			// write `tg: []` over the page being left — the same hazard
			// `useDocumentSync`'s `flushPendingWrites` states and avoids the same way.
			pendingTags = extractTagsFromBlocks(editor!.document)
			if (debounceTimer.current) clearTimeout(debounceTimer.current)
			debounceTimer.current = setTimeout(flushPending, TAG_SYNC_DEBOUNCE_MS)
		})
		flush.current = flushPending

		return () => {
			unsubscribe()
			if (debounceTimer.current) clearTimeout(debounceTimer.current)
			// Flushed, not merely cleared — but from the captured value, never from the
			// editor. A no-op when nothing is pending.
			try {
				flushPending()
			} catch (err) {
				console.error('[Notillo] Failed to flush pending tags:', err)
			}
			flush.current = () => {}
		}
	}, [editor, client, pageId, readOnly])

	return { flush }
}

// vim: ts=4
