// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useEffect, useRef } from 'react'

import type { BlockNoteEditor } from '@blocknote/core'
import type { RtdbClient } from '@cloudillo/rtdb'
import { extractTagsFromBlocks } from '../utils/tag-utils.js'

const TAG_SYNC_DEBOUNCE_MS = 1000

export function usePageTagSync(
	editor: BlockNoteEditor | undefined,
	client: RtdbClient | undefined,
	pageId: string | undefined,
	pageTags: string[] | undefined,
	readOnly: boolean
) {
	const lastSyncedTags = useRef<string | undefined>(undefined)
	const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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

		function syncTags() {
			const tags = extractTagsFromBlocks(editor!.document)
			const key = JSON.stringify(tags)
			if (key !== lastSyncedTags.current) {
				lastSyncedTags.current = key
				client!.collection('p').doc(pageId!).update({ tg: tags }).catch(console.error)
			}
		}

		const unsubscribe = editor.onChange(() => {
			if (debounceTimer.current) clearTimeout(debounceTimer.current)
			debounceTimer.current = setTimeout(syncTags, TAG_SYNC_DEBOUNCE_MS)
		})

		return () => {
			unsubscribe()
			if (debounceTimer.current) clearTimeout(debounceTimer.current)
		}
	}, [editor, client, pageId, readOnly])
}

// vim: ts=4
