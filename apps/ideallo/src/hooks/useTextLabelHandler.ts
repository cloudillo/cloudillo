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

/**
 * Hook for handling text label editing (double-click to enter rich text mode)
 */

import * as React from 'react'
import * as Y from 'yjs'

import type { YIdealloDocument, ObjectId, TextObject } from '../crdt/index.js'
import { getObjectYText } from '../crdt/index.js'
import type { TextEditState } from '../tools/types.js'

export interface UseTextLabelHandlerOptions {
	yDoc: Y.Doc
	doc: YIdealloDocument
	enabled?: boolean
}

export function useTextLabelHandler(options: UseTextLabelHandlerOptions) {
	const { doc } = options

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
