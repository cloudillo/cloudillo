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
