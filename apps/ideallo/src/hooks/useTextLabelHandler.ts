// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Hook for handling text label editing (double-click to enter rich text mode)
 */

import * as React from 'react'
import type * as Y from 'yjs'

import type { YIdealloDocument, TextObject } from '../crdt/index.js'
import type { TextEditState } from '../tools/types.js'

export interface UseTextLabelHandlerOptions {
	yDoc: Y.Doc
	doc: YIdealloDocument
	enabled?: boolean
}

export function useTextLabelHandler(_options: UseTextLabelHandlerOptions) {
	const [editingText, setEditingText] = React.useState<TextEditState | null>(null)

	const editingTextRef = React.useRef<TextEditState | null>(null)
	React.useEffect(() => {
		editingTextRef.current = editingText
	}, [editingText])

	const startEditing = React.useCallback((object: TextObject) => {
		setEditingText({
			id: object.id,
			x: object.x,
			y: object.y,
			width: object.width,
			height: object.height,
			text: object.text
		})
	}, [])

	const saveText = React.useCallback(() => {
		setEditingText(null)
	}, [])

	const cancelText = React.useCallback(() => {
		setEditingText(null)
	}, [])

	return React.useMemo(
		() => ({
			editingText,
			startEditing,
			saveText,
			cancelText
		}),
		[editingText, startEditing, saveText, cancelText]
	)
}

// vim: ts=4
