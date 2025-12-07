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
import type { PropertyPreview } from './PrezilloPropertiesPanel'

export interface TransformSectionProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	object: PrezilloObject
	onPreview?: (preview: PropertyPreview | null) => void
}

export function TransformSection({ doc, yDoc, object, onPreview }: TransformSectionProps) {
	const handleXChange = React.useCallback(
		(value: number) => {
			updateObjectPosition(yDoc, doc, object.id as ObjectId, value, object.y)
		},
		[yDoc, doc, object.id, object.y]
	)

	const handleYChange = React.useCallback(
		(value: number) => {
			updateObjectPosition(yDoc, doc, object.id as ObjectId, object.x, value)
		},
		[yDoc, doc, object.id, object.x]
	)

	const handleWidthChange = React.useCallback(
		(value: number) => {
			updateObjectSize(yDoc, doc, object.id as ObjectId, Math.max(1, value), object.height)
		},
		[yDoc, doc, object.id, object.height]
	)

	const handleHeightChange = React.useCallback(
		(value: number) => {
			updateObjectSize(yDoc, doc, object.id as ObjectId, object.width, Math.max(1, value))
		},
		[yDoc, doc, object.id, object.width]
	)

	const handleRotationChange = React.useCallback(
		(value: number) => {
			// Normalize rotation to 0-360
			const normalized = ((value % 360) + 360) % 360
			updateObjectRotation(yDoc, doc, object.id as ObjectId, normalized)
		},
		[yDoc, doc, object.id]
	)

	const handleOpacityChange = React.useCallback(
		(value: number) => {
			// Convert percentage to 0-1
			const opacity = Math.max(0, Math.min(100, value)) / 100
			updateObject(yDoc, doc, object.id as ObjectId, { opacity })
			// Clear preview on commit
			onPreview?.(null)
		},
		[yDoc, doc, object.id, onPreview]
	)

	const handleOpacityScrub = React.useCallback(
		(value: number) => {
			// Convert percentage to 0-1 for preview
			const opacity = Math.max(0, Math.min(100, value)) / 100
			onPreview?.({ objectId: object.id as ObjectId, opacity })
		},
		[object.id, onPreview]
	)

	return (
		<PropertySection title="Transform" defaultExpanded>
			<div className="c-hbox g-2">
				<PropertyField label="X" labelWidth={20}>
					<NumberInput
						value={Math.round(object.x)}
						onChange={handleXChange}
						step={1}
						className="c-input--full"
					/>
				</PropertyField>
				<PropertyField label="Y" labelWidth={20}>
					<NumberInput
						value={Math.round(object.y)}
						onChange={handleYChange}
						step={1}
						className="c-input--full"
					/>
				</PropertyField>
			</div>
			<div className="c-hbox g-2">
				<PropertyField label="W" labelWidth={20}>
					<NumberInput
						value={Math.round(object.width)}
						onChange={handleWidthChange}
						min={1}
						step={1}
						className="c-input--full"
					/>
				</PropertyField>
				<PropertyField label="H" labelWidth={20}>
					<NumberInput
						value={Math.round(object.height)}
						onChange={handleHeightChange}
						min={1}
						step={1}
						className="c-input--full"
					/>
				</PropertyField>
			</div>
			<div className="c-hbox g-2">
				<PropertyField label="Rot" labelWidth={30}>
					<NumberInput
						value={Math.round(object.rotation)}
						onChange={handleRotationChange}
						min={0}
						max={360}
						step={1}
						suffix="°"
						className="c-input--full"
					/>
				</PropertyField>
				<PropertyField label="Op" labelWidth={30}>
					<NumberInput
						value={Math.round(object.opacity * 100)}
						onChange={handleOpacityChange}
						onScrub={handleOpacityScrub}
						min={0}
						max={100}
						step={1}
						suffix="%"
						className="c-input--full"
					/>
				</PropertyField>
			</div>
		</PropertySection>
	)
}

// vim: ts=4
