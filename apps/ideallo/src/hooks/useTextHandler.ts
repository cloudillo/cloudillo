// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Hook for handling text creation
 */

import * as React from 'react'
import type * as Y from 'yjs'

import type { YIdealloDocument, ObjectId, NewTextInput } from '../crdt/index.js'
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
			if (textInput?.text.trim()) {
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
		if (!textInput?.text.trim()) {
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
