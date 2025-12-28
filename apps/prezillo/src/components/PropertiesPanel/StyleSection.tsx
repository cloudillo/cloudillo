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
import { PropertySection, PropertyField, ColorInput, NumberInput, Toggle } from '@cloudillo/react'

import type { YPrezilloDocument, PrezilloObject, ObjectId } from '../../crdt'
import {
	resolveShapeStyle,
	resolveTextStyle,
	updateObject,
	updateObjectTextStyle
} from '../../crdt'

export interface StyleSectionProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	object: PrezilloObject
}

export function StyleSection({ doc, yDoc, object }: StyleSectionProps) {
	// Check if this is a text object
	const isTextObject = object.type === 'text' || object.type === 'textbox'

	// Get resolved styles
	const stored = doc.o.get(object.id)
	const resolvedShapeStyle = stored ? resolveShapeStyle(doc, stored) : null
	const resolvedTextStyle = stored ? resolveTextStyle(doc, stored) : null

	// For text objects, use text fill; for others, use shape fill
	const fillColor = isTextObject ? resolvedTextStyle?.fill : resolvedShapeStyle?.fill
	const hasFill = !!(fillColor && fillColor !== 'none')
	const hasStroke = !!(resolvedShapeStyle?.stroke && resolvedShapeStyle.stroke !== 'none')

	const handleFillColorChange = React.useCallback(
		(color: string) => {
			if (isTextObject) {
				// Update text style fill for text objects
				updateObjectTextStyle(yDoc, doc, object.id as ObjectId, { fc: color })
			} else {
				// Update shape style fill for other objects
				const style = object.style || {}
				updateObject(yDoc, doc, object.id as ObjectId, {
					style: { ...style, fill: color }
				})
			}
		},
		[yDoc, doc, object.id, object.style, isTextObject]
	)

	const handleFillToggle = React.useCallback(
		(checked: boolean) => {
			if (isTextObject) {
				// Text objects always have fill, use default text color
				updateObjectTextStyle(yDoc, doc, object.id as ObjectId, {
					fc: checked ? '#333333' : '#cccccc'
				})
			} else {
				const style = object.style || {}
				// When turning on, always use a default color (since resolvedShapeStyle.fill would be 'none')
				updateObject(yDoc, doc, object.id as ObjectId, {
					style: { ...style, fill: checked ? '#cccccc' : 'none' }
				})
			}
		},
		[yDoc, doc, object.id, object.style, isTextObject]
	)

	const handleStrokeColorChange = React.useCallback(
		(color: string) => {
			const style = object.style || {}
			updateObject(yDoc, doc, object.id as ObjectId, {
				style: { ...style, stroke: color }
			})
		},
		[yDoc, doc, object.id, object.style]
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

	const handleStrokeToggle = React.useCallback(
		(checked: boolean) => {
			const style = object.style || {}
			// When turning on, always use a default color (since resolvedStyle.stroke would be 'none')
			updateObject(yDoc, doc, object.id as ObjectId, {
				style: { ...style, stroke: checked ? '#333333' : 'none' }
			})
		},
		[yDoc, doc, object.id, object.style]
	)

	if (!resolvedShapeStyle && !resolvedTextStyle) return null

	return (
		<PropertySection title="Style" defaultExpanded>
			{/* Fill (text color for text objects) */}
			<PropertyField label={isTextObject ? 'Color' : 'Fill'} labelWidth={40}>
				<div className="c-hbox g-1 items-center">
					{!isTextObject && (
						<Toggle
							checked={hasFill}
							onChange={(e) => handleFillToggle(e.target.checked)}
						/>
					)}
					{(isTextObject || hasFill) && fillColor && (
						<ColorInput
							value={fillColor}
							onChange={handleFillColorChange}
							showHex={false}
						/>
					)}
				</div>
			</PropertyField>

			{/* Stroke - only show for non-text objects */}
			{!isTextObject && resolvedShapeStyle && (
				<PropertyField label="Stroke" labelWidth={40}>
					<div className="c-hbox g-1 items-center">
						<Toggle
							checked={hasStroke}
							onChange={(e) => handleStrokeToggle(e.target.checked)}
						/>
						{hasStroke && (
							<>
								<ColorInput
									value={resolvedShapeStyle.stroke}
									onChange={handleStrokeColorChange}
									showHex={false}
								/>
								<NumberInput
									value={resolvedShapeStyle.strokeWidth}
									onChange={handleStrokeWidthChange}
									min={0}
									max={50}
									step={1}
									className="c-stroke-width-input"
								/>
							</>
						)}
					</div>
				</PropertyField>
			)}
		</PropertySection>
	)
}

// vim: ts=4
