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
 * Dispatcher component that renders the appropriate component for each object type
 * Applies rotation transform around object's pivot point
 */

import * as React from 'react'
import type { IdealloObject } from '../crdt/index.js'
import { FreehandPath } from './FreehandPath.js'
import {
	RectRenderer,
	EllipseRenderer,
	LineRenderer,
	ArrowRenderer,
	PolygonRenderer
} from './ShapeRenderer.js'
import { TextLabel } from './TextLabel.js'
import { StickyNote } from './StickyNote.js'
import { StickyEditOverlay } from './StickyEditOverlay.js'
import { ImageRenderer } from './ImageRenderer.js'
import { getBoundsFromPoints } from '../utils/geometry.js'
import type { PolygonObject } from '../crdt/index.js'

export interface ObjectRendererProps {
	object: IdealloObject
	// Owner tag for image URLs
	ownerTag?: string
	// Current canvas scale/zoom for optimal image variant selection
	scale?: number
	// Sticky editing props (passed when this sticky is being edited)
	isEditing?: boolean
	onTextChange?: (text: string) => void
	onSave?: (text: string) => void
	onCancel?: () => void
	onDragStart?: (e: React.PointerEvent) => void
	// Double-click handler for entering edit mode
	onDoubleClick?: () => void
	// Eraser highlight (object is under eraser brush)
	isHighlighted?: boolean
}

// Calculate rotation center for an object using its pivot point
function getRotationCenter(obj: IdealloObject): { cx: number; cy: number } {
	const pivotX = obj.pivotX ?? 0.5
	const pivotY = obj.pivotY ?? 0.5

	switch (obj.type) {
		case 'freehand':
		case 'rect':
		case 'ellipse':
		case 'text':
		case 'sticky':
		case 'image':
			return {
				cx: obj.x + obj.width * pivotX,
				cy: obj.y + obj.height * pivotY
			}
		case 'polygon': {
			const bounds = getBoundsFromPoints((obj as PolygonObject).vertices)
			return {
				cx: bounds.x + bounds.width * pivotX,
				cy: bounds.y + bounds.height * pivotY
			}
		}
		case 'line':
		case 'arrow': {
			const minX = Math.min(obj.startX, obj.endX)
			const maxX = Math.max(obj.startX, obj.endX)
			const minY = Math.min(obj.startY, obj.endY)
			const maxY = Math.max(obj.startY, obj.endY)
			return {
				cx: minX + (maxX - minX) * pivotX,
				cy: minY + (maxY - minY) * pivotY
			}
		}
	}
}

// Render the appropriate component for the object type
function renderObject(
	object: IdealloObject,
	props: Pick<
		ObjectRendererProps,
		'ownerTag' | 'scale' | 'isEditing' | 'onTextChange' | 'onSave' | 'onCancel' | 'onDragStart'
	>
): React.ReactNode {
	switch (object.type) {
		case 'freehand':
			return <FreehandPath object={object} />
		case 'rect':
			return <RectRenderer object={object} />
		case 'ellipse':
			return <EllipseRenderer object={object} />
		case 'line':
			return <LineRenderer object={object} />
		case 'arrow':
			return <ArrowRenderer object={object} />
		case 'polygon':
			return <PolygonRenderer object={object} />
		case 'text':
			return <TextLabel object={object} />
		case 'sticky':
			// When editing, use the overlay instead of the display component
			if (props.isEditing && props.onSave && props.onCancel) {
				return (
					<StickyEditOverlay
						object={object}
						onSave={props.onSave}
						onCancel={props.onCancel}
						onTextChange={props.onTextChange}
						onDragStart={props.onDragStart}
					/>
				)
			}
			return <StickyNote object={object} />
		case 'image':
			return <ImageRenderer object={object} ownerTag={props.ownerTag} scale={props.scale} />
		default:
			return null
	}
}

export function ObjectRenderer({
	object,
	ownerTag,
	scale,
	isEditing,
	onTextChange,
	onSave,
	onCancel,
	onDragStart,
	onDoubleClick,
	isHighlighted = false
}: ObjectRendererProps) {
	const content = renderObject(object, {
		ownerTag,
		scale,
		isEditing,
		onTextChange,
		onSave,
		onCancel,
		onDragStart
	})
	if (!content) return null

	// Build class name with optional highlight
	const className = isHighlighted ? 'eraser-highlighted' : undefined

	// Handle double-click for entering edit mode (sticky notes)
	const handleDoubleClick = onDoubleClick
		? (e: React.MouseEvent) => {
				e.stopPropagation()
				onDoubleClick()
			}
		: undefined

	// Apply rotation if the object has a non-zero rotation
	if (object.rotation && Math.abs(object.rotation) > 0.1) {
		const { cx, cy } = getRotationCenter(object)
		return (
			<g
				transform={`rotate(${object.rotation} ${cx} ${cy})`}
				className={className}
				onDoubleClick={handleDoubleClick}
			>
				{content}
			</g>
		)
	}

	// Wrap in group if highlighted or has double-click handler
	if (isHighlighted || handleDoubleClick) {
		return (
			<g className={className} onDoubleClick={handleDoubleClick}>
				{content}
			</g>
		)
	}

	return content
}

// vim: ts=4
