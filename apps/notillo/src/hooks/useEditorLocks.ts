// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useEffect, useRef, type RefObject } from 'react'

import type { BlockNoteEditor } from '@blocknote/core'
import type { RtdbClient } from '@cloudillo/rtdb'

export function useEditorLocks(
	editor: BlockNoteEditor | undefined,
	client: RtdbClient | undefined,
	userId: string | undefined
): RefObject<string | undefined> {
	const currentLockedBlockRef = useRef<string | undefined>(undefined)

	useEffect(() => {
		if (!editor || !client || !userId) return

		const handleSelectionChange = () => {
			const textCursor = editor.getTextCursorPosition()
			const currentBlockId = textCursor?.block?.id

			const prevBlockId = currentLockedBlockRef.current

			if (currentBlockId !== prevBlockId) {
				if (prevBlockId) {
					client.ref(`b/${prevBlockId}`).unlock().catch(console.error)
				}
				if (currentBlockId) {
					client.ref(`b/${currentBlockId}`).lock('soft').catch(console.error)
				}
				currentLockedBlockRef.current = currentBlockId
			}
		}

		const unsubscribe = editor.onSelectionChange(handleSelectionChange)

		return () => {
			unsubscribe()
			if (currentLockedBlockRef.current) {
				client.ref(`b/${currentLockedBlockRef.current}`).unlock().catch(console.error)
				currentLockedBlockRef.current = undefined
			}
		}
	}, [editor, client, userId])

	return currentLockedBlockRef
}

// vim: ts=4
