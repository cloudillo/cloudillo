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
 * Hook for text styling operations (alignment, font size, bold, italic, underline)
 */

import * as React from 'react'
import * as Y from 'yjs'

import type { ObjectId, YPrezilloDocument } from '../crdt'
import { updateObjectTextStyle, resolveTextStyle } from '../crdt'

export interface UseTextStylingOptions {
	yDoc: Y.Doc
	doc: YPrezilloDocument
	selectedTextObject: { id: string; obj: any } | null
	selectedTextStyle: ReturnType<typeof resolveTextStyle> | null
}

export interface UseTextStylingResult {
	handleTextAlignChange: (align: 'left' | 'center' | 'right' | 'justify') => void
	handleVerticalAlignChange: (align: 'top' | 'middle' | 'bottom') => void
	handleFontSizeChange: (size: number) => void
	handleBoldToggle: () => void
	handleItalicToggle: () => void
	handleUnderlineToggle: () => void
}

export function useTextStyling({
	yDoc,
	doc,
	selectedTextObject,
	selectedTextStyle
}: UseTextStylingOptions): UseTextStylingResult {
	// Handle text alignment change
	const handleTextAlignChange = React.useCallback(
		(align: 'left' | 'center' | 'right' | 'justify') => {
			if (!selectedTextObject) return
			const taMap = { left: 'l', center: 'c', right: 'r', justify: 'j' } as const
			updateObjectTextStyle(yDoc, doc, selectedTextObject.id as ObjectId, {
				ta: taMap[align]
			})
		},
		[yDoc, doc, selectedTextObject]
	)

	// Handle vertical alignment change
	const handleVerticalAlignChange = React.useCallback(
		(align: 'top' | 'middle' | 'bottom') => {
			if (!selectedTextObject) return
			const vaMap = { top: 't', middle: 'm', bottom: 'b' } as const
			updateObjectTextStyle(yDoc, doc, selectedTextObject.id as ObjectId, {
				va: vaMap[align]
			})
		},
		[yDoc, doc, selectedTextObject]
	)

	// Handle font size change
	const handleFontSizeChange = React.useCallback(
		(size: number) => {
			if (!selectedTextObject) return
			updateObjectTextStyle(yDoc, doc, selectedTextObject.id as ObjectId, {
				fs: size
			})
		},
		[yDoc, doc, selectedTextObject]
	)

	// Handle bold toggle
	const handleBoldToggle = React.useCallback(() => {
		if (!selectedTextObject || !selectedTextStyle) return
		// Toggle bold: if currently bold, remove it (null to reset to default); otherwise set bold
		const newWeight = selectedTextStyle.fontWeight === 'bold' ? null : 'bold'
		updateObjectTextStyle(yDoc, doc, selectedTextObject.id as ObjectId, {
			fw: newWeight
		})
	}, [yDoc, doc, selectedTextObject, selectedTextStyle])

	// Handle italic toggle
	const handleItalicToggle = React.useCallback(() => {
		if (!selectedTextObject || !selectedTextStyle) return
		// Toggle italic: if currently italic, remove it (null); otherwise set true
		const newItalic = selectedTextStyle.fontItalic ? null : true
		updateObjectTextStyle(yDoc, doc, selectedTextObject.id as ObjectId, {
			fi: newItalic
		})
	}, [yDoc, doc, selectedTextObject, selectedTextStyle])

	// Handle underline toggle
	const handleUnderlineToggle = React.useCallback(() => {
		if (!selectedTextObject || !selectedTextStyle) return
		const currentDecoration = selectedTextStyle.textDecoration
		// Toggle underline: if currently underline, remove it (null); otherwise set underline
		const newDecoration = currentDecoration === 'underline' ? null : 'u'
		updateObjectTextStyle(yDoc, doc, selectedTextObject.id as ObjectId, {
			td: newDecoration
		})
	}, [yDoc, doc, selectedTextObject, selectedTextStyle])

	return {
		handleTextAlignChange,
		handleVerticalAlignChange,
		handleFontSizeChange,
		handleBoldToggle,
		handleItalicToggle,
		handleUnderlineToggle
	}
}

// vim: ts=4
