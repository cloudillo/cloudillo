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
import type Quill from 'quill'
import type { IdealloObject, YIdealloDocument } from '../crdt/index.js'
import { getObjectYText } from '../crdt/index.js'
import { FreehandPath } from './FreehandPath.js'
import {
	RectRenderer,
	EllipseRenderer,
	LineRenderer,
	ArrowRenderer,
	PolygonRenderer
} from './ShapeRenderer.js'
import { TextLabel } from './TextLabel.js'
import { TextEditOverlay } from './TextEditOverlay.js'
import { StickyNote } from './StickyNote.js'
import { StickyEditOverlay } from './StickyEditOverlay.js'
import { ImageRenderer } from './ImageRenderer.js'
import { getBoundsFromPoints } from '../utils/geometry.js'
import type { PolygonObject } from '../crdt/index.js'

export interface ObjectRendererProps {
	object: IdealloObject
	/** Document for accessing Y.Text content */
	doc?: YIdealloDocument
	// Owner tag for image URLs
	ownerTag?: string
	// Current canvas scale/zoom for optimal image variant selection
	scale?: number
	// Sticky/text editing props (passed when this object is being edited)
	isEditing?: boolean
	onTextChange?: (text: string) => void
	onSave?: (text: string) => void
	onCancel?: () => void
	onDragStart?: (e: React.PointerEvent) => void
	// Double-click handler for entering edit mode
	onDoubleClick?: () => void
	// Quill ref for text formatting from PropertyBar
	quillRef?: React.MutableRefObject<Quill | null>
	// Callback when editor content height changes (for auto-grow)
	onHeightChange?: (height: number) => void
	// Eraser highlight (object is under eraser brush during drag)
	isHighlighted?: boolean
	// Hover effect (object is under cursor in select mode)
	isHovered?: boolean
	// Eraser hover effect (object is under eraser cursor)
	isEraserHovered?: boolean
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
		| 'doc'
		| 'ownerTag'
		| 'scale'
		| 'isEditing'
		| 'onTextChange'
		| 'onSave'
		| 'onCancel'
		| 'onDragStart'
		| 'quillRef'
		| 'onHeightChange'
		| 'isHovered'
		| 'isEraserHovered'
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
		case 'text': {
			const yText = props.doc ? getObjectYText(props.doc, object.id as any) : undefined
			if (props.isEditing && props.onCancel) {
				return (
					<TextEditOverlay
						object={object}
						yText={yText}
						onSave={props.onCancel}
						onCancel={props.onCancel}
						quillRef={props.quillRef}
						onHeightChange={props.onHeightChange}
					/>
				)
			}
			return <TextLabel object={object} yText={yText} />
		}
		case 'sticky': {
			const yText = props.doc ? getObjectYText(props.doc, object.id as any) : undefined
			// When editing, use the overlay instead of the display component
			if (props.isEditing && props.onSave && props.onCancel) {
				return (
					<StickyEditOverlay
						object={object}
						yText={yText}
						onSave={props.onSave}
						onCancel={props.onCancel}
						onTextChange={props.onTextChange}
						onDragStart={props.onDragStart}
						quillRef={props.quillRef}
						onHeightChange={props.onHeightChange}
					/>
				)
			}
			return <StickyNote object={object} yText={yText} />
		}
		case 'image':
			return (
				<ImageRenderer
					object={object}
					ownerTag={props.ownerTag}
					scale={props.scale}
					isHovered={props.isHovered}
					isEraserHovered={props.isEraserHovered}
				/>
			)
		default:
			return null
	}
}

export function ObjectRenderer({
	object,
	doc,
	ownerTag,
	scale,
	isEditing,
	onTextChange,
	onSave,
	onCancel,
	onDragStart,
	onDoubleClick,
	quillRef,
	onHeightChange,
	isHighlighted = false,
	isHovered = false,
	isEraserHovered = false
}: ObjectRendererProps) {
	const content = renderObject(object, {
		doc,
		ownerTag,
		scale,
		isEditing,
		onTextChange,
		onSave,
		onCancel,
		onDragStart,
		quillRef,
		onHeightChange,
		isHovered,
		isEraserHovered
	})
	if (!content) return null

	// Build class name with optional highlight/hover
	// Images handle hover effects internally to avoid flickering issues with the loading placeholder
	const isImage = object.type === 'image'
	const classNames: string[] = []
	if (isHighlighted) classNames.push('eraser-highlighted')
	if (isHovered && !isImage) classNames.push('object-hovered')
	if (isEraserHovered && !isImage) classNames.push('eraser-hovered')
	const className = classNames.length > 0 ? classNames.join(' ') : undefined

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

	// Always wrap in group to maintain consistent DOM structure
	// (conditional wrapping causes re-mounts which flicker images)
	return (
		<g className={className} onDoubleClick={handleDoubleClick}>
			{content}
		</g>
	)
}

// vim: ts=4
