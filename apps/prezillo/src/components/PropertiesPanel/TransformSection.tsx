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
	updateObjectPosition,
	updateObjectSize,
	updateObjectRotation,
	updateObject
} from '../../crdt'
import { useLockableProperty } from '../../hooks'
import type { PropertyPreview } from './PrezilloPropertiesPanel'
import { PropertyGroupHeader } from './PropertyGroupHeader'

export interface TransformSectionProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	object: PrezilloObject
	onPreview?: (preview: PropertyPreview | null) => void
}

export function TransformSection({ doc, yDoc, object, onPreview }: TransformSectionProps) {
	const objectId = object.id as ObjectId

	// Use centralized hook for lockable property groups
	const position = useLockableProperty(yDoc, doc, objectId, 'position')
	const size = useLockableProperty(yDoc, doc, objectId, 'size')
	const rotation = useLockableProperty(yDoc, doc, objectId, 'rotation')
	const opacity = useLockableProperty(yDoc, doc, objectId, 'opacity')

	// Value change handlers (only work when unlocked)
	const handleXChange = React.useCallback(
		(value: number) => {
			if (position.isDisabled) return
			updateObjectPosition(yDoc, doc, objectId, value, object.y)
		},
		[yDoc, doc, objectId, object.y, position.isDisabled]
	)

	const handleYChange = React.useCallback(
		(value: number) => {
			if (position.isDisabled) return
			updateObjectPosition(yDoc, doc, objectId, object.x, value)
		},
		[yDoc, doc, objectId, object.x, position.isDisabled]
	)

	const handleWidthChange = React.useCallback(
		(value: number) => {
			if (size.isDisabled) return
			updateObjectSize(yDoc, doc, objectId, Math.max(1, value), object.height)
		},
		[yDoc, doc, objectId, object.height, size.isDisabled]
	)

	const handleHeightChange = React.useCallback(
		(value: number) => {
			if (size.isDisabled) return
			updateObjectSize(yDoc, doc, objectId, object.width, Math.max(1, value))
		},
		[yDoc, doc, objectId, object.width, size.isDisabled]
	)

	const handleRotationChange = React.useCallback(
		(value: number) => {
			if (rotation.isDisabled) return
			// Normalize rotation to 0-360
			const normalized = ((value % 360) + 360) % 360
			updateObjectRotation(yDoc, doc, objectId, normalized)
		},
		[yDoc, doc, objectId, rotation.isDisabled]
	)

	const handleOpacityChange = React.useCallback(
		(value: number) => {
			if (opacity.isDisabled) return
			// Convert percentage to 0-1
			const opacityValue = Math.max(0, Math.min(100, value)) / 100
			updateObject(yDoc, doc, objectId, { opacity: opacityValue })
			// Clear preview on commit
			onPreview?.(null)
		},
		[yDoc, doc, objectId, onPreview, opacity.isDisabled]
	)

	const handleOpacityScrub = React.useCallback(
		(value: number) => {
			if (opacity.isDisabled) return
			// Convert percentage to 0-1 for preview
			const opacityValue = Math.max(0, Math.min(100, value)) / 100
			onPreview?.({ objectId, opacity: opacityValue })
		},
		[objectId, onPreview, opacity.isDisabled]
	)

	return (
		<PropertySection title="Transform" defaultExpanded>
			{/* Position group (X, Y) */}
			<PropertyGroupHeader
				label="Position"
				isInstance={position.isInstance}
				isLocked={position.isLocked}
				onUnlock={position.handleUnlock}
				onReset={position.handleReset}
			/>
			<div className={`c-hbox g-2 ${position.isDisabled ? 'c-property-field--locked' : ''}`}>
				<PropertyField label="X" labelWidth={20}>
					<NumberInput
						value={Math.round(object.x)}
						onChange={handleXChange}
						step={1}
						className="c-input--full"
						disabled={position.isDisabled}
					/>
				</PropertyField>
				<PropertyField label="Y" labelWidth={20}>
					<NumberInput
						value={Math.round(object.y)}
						onChange={handleYChange}
						step={1}
						className="c-input--full"
						disabled={position.isDisabled}
					/>
				</PropertyField>
			</div>

			{/* Size group (W, H) */}
			<PropertyGroupHeader
				label="Size"
				isInstance={size.isInstance}
				isLocked={size.isLocked}
				onUnlock={size.handleUnlock}
				onReset={size.handleReset}
				className="mt-2"
			/>
			<div className={`c-hbox g-2 ${size.isDisabled ? 'c-property-field--locked' : ''}`}>
				<PropertyField label="W" labelWidth={20}>
					<NumberInput
						value={Math.round(object.width)}
						onChange={handleWidthChange}
						min={1}
						step={1}
						className="c-input--full"
						disabled={size.isDisabled}
					/>
				</PropertyField>
				<PropertyField label="H" labelWidth={20}>
					<NumberInput
						value={Math.round(object.height)}
						onChange={handleHeightChange}
						min={1}
						step={1}
						className="c-input--full"
						disabled={size.isDisabled}
					/>
				</PropertyField>
			</div>

			{/* Rotation and Opacity row */}
			<div className="c-hbox g-2 mt-2">
				{/* Rotation */}
				<div className="flex-1">
					<PropertyGroupHeader
						label="Rot"
						isInstance={rotation.isInstance}
						isLocked={rotation.isLocked}
						onUnlock={rotation.handleUnlock}
						onReset={rotation.handleReset}
					/>
					<div className={rotation.isDisabled ? 'c-property-field--locked' : ''}>
						<NumberInput
							value={Math.round(object.rotation)}
							onChange={handleRotationChange}
							min={0}
							max={360}
							step={1}
							suffix="°"
							className="c-input--full"
							disabled={rotation.isDisabled}
						/>
					</div>
				</div>

				{/* Opacity */}
				<div className="flex-1">
					<PropertyGroupHeader
						label="Op"
						isInstance={opacity.isInstance}
						isLocked={opacity.isLocked}
						onUnlock={opacity.handleUnlock}
						onReset={opacity.handleReset}
					/>
					<div className={opacity.isDisabled ? 'c-property-field--locked' : ''}>
						<NumberInput
							value={Math.round(object.opacity * 100)}
							onChange={handleOpacityChange}
							onScrub={handleOpacityScrub}
							min={0}
							max={100}
							step={1}
							suffix="%"
							className="c-input--full"
							disabled={opacity.isDisabled}
						/>
					</div>
				</div>
			</div>
		</PropertySection>
	)
}

// vim: ts=4
