// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import type * as Y from 'yjs'
import { PropertySection, PropertyField, NumberInput } from '@cloudillo/react'

import type { YPrezilloDocument, PrezilloObject, ObjectId } from '../../crdt'
import {
	resolveShapeStyle,
	resolveTextStyle,
	updateObject,
	updateObjectTextStyle,
	isInstance,
	isPropertyGroupLocked,
	unlockPropertyGroup,
	resetPropertyGroup
} from '../../crdt'
import { usePaletteValue } from '../../hooks'
import { PaletteColorPicker, type ColorPickerValue } from './PaletteColorPicker'
import { PropertyLockButton } from './PropertyLockButton'

export interface StyleSectionProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	object: PrezilloObject
}

export function StyleSection({ doc, yDoc, object }: StyleSectionProps) {
	const objectId = object.id as ObjectId

	// Get palette for color picker
	const palette = usePaletteValue(doc)

	// Check if this is a text-based object (text or statevar)
	const isTextObject = object.type === 'text' || object.type === 'statevar'

	// Check if this object is an instance of a template prototype
	const objectIsInstance = isInstance(doc, objectId)

	// Check lock state for style groups
	// For text objects, we use textStyle; for shape objects, we use shapeStyle
	const shapeStyleLocked = isPropertyGroupLocked(doc, objectId, 'shapeStyle')
	const textStyleLocked = isPropertyGroupLocked(doc, objectId, 'textStyle')

	// Determine which lock to use based on object type
	const styleLocked = isTextObject ? textStyleLocked : shapeStyleLocked
	const styleGroup = isTextObject ? 'textStyle' : 'shapeStyle'

	// Unlock/reset handlers
	const handleUnlockStyle = React.useCallback(() => {
		unlockPropertyGroup(yDoc, doc, objectId, styleGroup)
	}, [yDoc, doc, objectId, styleGroup])

	const handleResetStyle = React.useCallback(() => {
		resetPropertyGroup(yDoc, doc, objectId, styleGroup)
	}, [yDoc, doc, objectId, styleGroup])

	// Get resolved styles
	const stored = doc.o.get(object.id)
	const resolvedShapeStyle = stored ? resolveShapeStyle(doc, stored) : null
	const resolvedTextStyle = stored ? resolveTextStyle(doc, stored) : null

	// Get raw color values (may be palette refs or hex strings)
	const rawFillValue: ColorPickerValue | undefined = isTextObject ? stored?.ts?.fc : stored?.s?.f

	// For text objects, use text fill; for others, use shape fill
	const fillColor = isTextObject ? resolvedTextStyle?.fill : resolvedShapeStyle?.fill
	const hasStroke = !!(resolvedShapeStyle?.stroke && resolvedShapeStyle.stroke !== 'none')

	// Get raw stroke value (may be palette ref or hex string)
	const rawStrokeValue: ColorPickerValue | undefined = stored?.s?.s

	// Determine if style editing is disabled
	const styleDisabled = objectIsInstance && styleLocked

	const handleFillColorChange = React.useCallback(
		(value: ColorPickerValue) => {
			if (styleDisabled) return
			if (isTextObject) {
				// Update text style fill for text objects
				// ColorPickerValue is already in stored format (string | StoredPaletteRef)
				updateObjectTextStyle(yDoc, doc, objectId, { fc: value })
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
		[yDoc, doc, object.id, objectId, isTextObject, styleDisabled]
	)

	const handleStrokeColorChange = React.useCallback(
		(value: ColorPickerValue) => {
			if (styleDisabled) return
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
		[yDoc, doc, object.id, styleDisabled]
	)

	const handleStrokeWidthChange = React.useCallback(
		(width: number) => {
			if (styleDisabled) return
			const style = object.style || {}
			updateObject(yDoc, doc, objectId, {
				style: { ...style, strokeWidth: Math.max(0, width) }
			})
		},
		[yDoc, doc, objectId, object.style, styleDisabled]
	)

	if (!resolvedShapeStyle && !resolvedTextStyle) return null

	return (
		<PropertySection title="Style" defaultExpanded>
			{/* Lock button for entire style section */}
			<div className="c-hbox ai-center jc-end mb-1">
				<PropertyLockButton
					isInstance={objectIsInstance}
					isLocked={styleLocked}
					onUnlock={handleUnlockStyle}
					onReset={handleResetStyle}
				/>
			</div>

			<div className={styleDisabled ? 'c-property-field--locked' : ''}>
				{/* Fill (text color for text objects) */}
				<PropertyField label={isTextObject ? 'Color' : 'Fill'} labelWidth={40}>
					<PaletteColorPicker
						value={rawFillValue ?? fillColor ?? 'none'}
						onChange={handleFillColorChange}
						palette={palette}
						showGradients={!isTextObject}
						showTransparent={!isTextObject}
						disabled={styleDisabled}
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
								disabled={styleDisabled}
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
									disabled={styleDisabled}
								/>
							</PropertyField>
						)}
					</>
				)}
			</div>
		</PropertySection>
	)
}

// vim: ts=4
