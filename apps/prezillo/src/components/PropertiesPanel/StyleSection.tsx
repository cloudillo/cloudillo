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

import * as React from 'react'
import * as Y from 'yjs'
import { PropertySection, PropertyField, NumberInput } from '@cloudillo/react'

import type { YPrezilloDocument, PrezilloObject, ObjectId } from '../../crdt'
import {
	resolveShapeStyle,
	resolveTextStyle,
	updateObject,
	updateObjectTextStyle
} from '../../crdt'
import { usePaletteValue } from '../../hooks'
import { PaletteColorPicker, ColorPickerValue } from './PaletteColorPicker'

export interface StyleSectionProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	object: PrezilloObject
}

export function StyleSection({ doc, yDoc, object }: StyleSectionProps) {
	// Get palette for color picker
	const palette = usePaletteValue(doc)

	// Check if this is a text object
	const isTextObject = object.type === 'text' || object.type === 'textbox'

	// Get resolved styles
	const stored = doc.o.get(object.id)
	const resolvedShapeStyle = stored ? resolveShapeStyle(doc, stored) : null
	const resolvedTextStyle = stored ? resolveTextStyle(doc, stored) : null

	// Get raw color values (may be palette refs or hex strings)
	const rawFillValue: ColorPickerValue | undefined = isTextObject
		? (stored?.ts?.fc ?? stored?.to?.fc)
		: (stored?.s?.f ?? stored?.so?.f)

	// For text objects, use text fill; for others, use shape fill
	const fillColor = isTextObject ? resolvedTextStyle?.fill : resolvedShapeStyle?.fill
	const hasStroke = !!(resolvedShapeStyle?.stroke && resolvedShapeStyle.stroke !== 'none')

	// Get raw stroke value (may be palette ref or hex string)
	const rawStrokeValue: ColorPickerValue | undefined = stored?.s?.s ?? stored?.so?.s

	const handleFillColorChange = React.useCallback(
		(value: ColorPickerValue) => {
			if (isTextObject) {
				// Update text style fill for text objects
				// ColorPickerValue is already in stored format (string | StoredPaletteRef)
				updateObjectTextStyle(yDoc, doc, object.id as ObjectId, { fc: value })
			} else {
				// Update shape style fill for other objects
				// For shape style, we need to update the stored style directly
				yDoc.transact(() => {
					const storedObj = doc.o.get(object.id)
					if (storedObj) {
						const newObj = { ...storedObj }
						if (!newObj.s) newObj.s = {}
						newObj.s = { ...newObj.s, f: value }
						doc.o.set(object.id, newObj)
					}
				}, yDoc.clientID)
			}
		},
		[yDoc, doc, object.id, isTextObject]
	)

	const handleStrokeColorChange = React.useCallback(
		(value: ColorPickerValue) => {
			// Update shape style stroke directly in stored format
			yDoc.transact(() => {
				const storedObj = doc.o.get(object.id)
				if (storedObj) {
					const newObj = { ...storedObj }
					if (!newObj.s) newObj.s = {}
					newObj.s = { ...newObj.s, s: value }
					doc.o.set(object.id, newObj)
				}
			}, yDoc.clientID)
		},
		[yDoc, doc, object.id]
	)

	const handleStrokeWidthChange = React.useCallback(
		(width: number) => {
			const style = object.style || {}
			updateObject(yDoc, doc, object.id as ObjectId, {
				style: { ...style, strokeWidth: Math.max(0, width) }
			})
		},
		[yDoc, doc, object.id, object.style]
	)

	if (!resolvedShapeStyle && !resolvedTextStyle) return null

	return (
		<PropertySection title="Style" defaultExpanded>
			{/* Fill (text color for text objects) */}
			<PropertyField label={isTextObject ? 'Color' : 'Fill'} labelWidth={40}>
				<PaletteColorPicker
					value={rawFillValue ?? fillColor ?? 'none'}
					onChange={handleFillColorChange}
					palette={palette}
					showGradients={!isTextObject}
					showTransparent={!isTextObject}
				/>
			</PropertyField>

			{/* Stroke - only show for non-text objects */}
			{!isTextObject && resolvedShapeStyle && (
				<>
					<PropertyField label="Stroke" labelWidth={40}>
						<PaletteColorPicker
							value={rawStrokeValue ?? resolvedShapeStyle.stroke ?? 'none'}
							onChange={handleStrokeColorChange}
							palette={palette}
							showGradients={false}
							showTransparent={true}
						/>
					</PropertyField>
					{hasStroke && (
						<PropertyField label="Width" labelWidth={40}>
							<NumberInput
								value={resolvedShapeStyle.strokeWidth}
								onChange={handleStrokeWidthChange}
								min={0}
								max={50}
								step={1}
								className="c-stroke-width-input"
							/>
						</PropertyField>
					)}
				</>
			)}
		</PropertySection>
	)
}

// vim: ts=4
