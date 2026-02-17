// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
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
