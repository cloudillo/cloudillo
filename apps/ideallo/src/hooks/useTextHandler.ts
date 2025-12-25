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
 * Hook for handling text creation
 */

import * as React from 'react'
import * as Y from 'yjs'

import type { YIdealloDocument, ObjectId, TextObject, NewTextInput } from '../crdt/index.js'
import { addObject, DEFAULT_STYLE } from '../crdt/index.js'
import type { TextInputState } from '../tools/types.js'

export interface UseTextHandlerOptions {
	yDoc: Y.Doc
	doc: YIdealloDocument
	currentStyle: {
		strokeColor: string
		fillColor: string
		strokeWidth: number
	}
	enabled: boolean
	onObjectCreated?: (id: ObjectId) => void
}

const DEFAULT_TEXT_WIDTH = 200
const DEFAULT_TEXT_HEIGHT = 32
const DEFAULT_FONT_SIZE = 16

export function useTextHandler(options: UseTextHandlerOptions) {
	const { yDoc, doc, currentStyle, enabled, onObjectCreated } = options
	const [textInput, setTextInput] = React.useState<TextInputState | null>(null)
	const inputRef = React.useRef<HTMLInputElement | null>(null)

	const handlePointerDown = React.useCallback(
		(x: number, y: number) => {
			if (!enabled) return

			// If we already have an input, commit it first
			if (textInput && textInput.text.trim()) {
				commitText()
			}

			setTextInput({
				x,
				y,
				width: DEFAULT_TEXT_WIDTH,
				height: DEFAULT_TEXT_HEIGHT,
				text: ''
			})
		},
		[enabled, textInput]
	)

	const handleTextChange = React.useCallback((text: string) => {
		setTextInput((prev) => (prev ? { ...prev, text } : null))
	}, [])

	const commitText = React.useCallback(() => {
		if (!textInput || !textInput.text.trim()) {
			setTextInput(null)
			return
		}

		const obj: NewTextInput = {
			type: 'text',
			x: textInput.x,
			y: textInput.y,
			width: textInput.width,
			height: textInput.height,
			text: textInput.text,
			fontSize: DEFAULT_FONT_SIZE,
			rotation: 0,
			pivotX: 0.5,
			pivotY: 0.5,
			locked: false,
			style: {
				strokeColor: currentStyle.strokeColor,
				fillColor: 'transparent',
				strokeWidth: 0,
				strokeStyle: DEFAULT_STYLE.strokeStyle,
				opacity: DEFAULT_STYLE.opacity
			}
		}

		const objectId = addObject(yDoc, doc, obj)
		setTextInput(null)
		onObjectCreated?.(objectId)
	}, [textInput, yDoc, doc, currentStyle, onObjectCreated])

	const cancelText = React.useCallback(() => {
		setTextInput(null)
	}, [])

	// Focus input when created
	React.useEffect(() => {
		if (textInput && inputRef.current) {
			inputRef.current.focus()
		}
	}, [textInput])

	// Memoize return value to prevent infinite re-render loops
	return React.useMemo(
		() => ({
			textInput,
			inputRef,
			handlePointerDown,
			handleTextChange,
			commitText,
			cancelText
		}),
		[textInput, inputRef, handlePointerDown, handleTextChange, commitText, cancelText]
	)
}

// vim: ts=4
