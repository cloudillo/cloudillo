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
 * Hook for handling shape creation (rect, ellipse, line, arrow)
 * Broadcasts shape preview via awareness for real-time collaboration
 */

import * as React from 'react'
import * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'

import type {
	YIdealloDocument,
	ObjectId,
	RectObject,
	EllipseObject,
	LineObject,
	ArrowObject
} from '../crdt/index.js'
import { addObject, DEFAULT_STYLE } from '../crdt/index.js'
import type { ShapePreview, ToolType } from '../tools/types.js'

export interface UseShapeHandlerOptions {
	yDoc: Y.Doc
	doc: YIdealloDocument
	awareness: Awareness | null
	currentStyle: {
		strokeColor: string
		fillColor: string
		strokeWidth: number
	}
	activeTool: ToolType
	onObjectCreated?: (id: ObjectId) => void
}

export function useShapeHandler(options: UseShapeHandlerOptions) {
	const { yDoc, doc, awareness, currentStyle, activeTool, onObjectCreated } = options
	const [shapePreview, setShapePreview] = React.useState<ShapePreview | null>(null)
	const shapePreviewRef = React.useRef<ShapePreview | null>(null)

	// Keep ref in sync for use in callbacks
	React.useEffect(() => {
		shapePreviewRef.current = shapePreview
	}, [shapePreview])

	const isShapeTool =
		activeTool === 'rect' ||
		activeTool === 'ellipse' ||
		activeTool === 'line' ||
		activeTool === 'arrow'

	// Broadcast shape preview via awareness
	const broadcastShape = React.useCallback(
		(preview: ShapePreview | null) => {
			if (!awareness) return

			if (preview) {
				awareness.setLocalStateField('shape', {
					type: preview.type,
					startX: preview.startX,
					startY: preview.startY,
					endX: preview.endX,
					endY: preview.endY,
					style: preview.style
				})
			} else {
				awareness.setLocalStateField('shape', undefined)
			}
		},
		[awareness]
	)

	const handlePointerDown = React.useCallback(
		(x: number, y: number) => {
			if (!isShapeTool) return

			const preview: ShapePreview = {
				type: activeTool as 'rect' | 'ellipse' | 'line' | 'arrow',
				startX: x,
				startY: y,
				endX: x,
				endY: y,
				style: {
					strokeColor: currentStyle.strokeColor,
					fillColor: currentStyle.fillColor,
					strokeWidth: currentStyle.strokeWidth
				}
			}

			setShapePreview(preview)
			broadcastShape(preview)
		},
		[isShapeTool, activeTool, currentStyle, broadcastShape]
	)

	const handlePointerMove = React.useCallback(
		(x: number, y: number) => {
			if (!shapePreviewRef.current) return

			const updated = { ...shapePreviewRef.current, endX: x, endY: y }
			setShapePreview(updated)
			broadcastShape(updated)
		},
		[broadcastShape]
	)

	const handlePointerUp = React.useCallback(() => {
		if (!shapePreviewRef.current) return

		const { type, startX, startY, endX, endY, style } = shapePreviewRef.current

		// Clear broadcast first
		broadcastShape(null)

		// Calculate normalized bounds (handle negative dimensions)
		const minX = Math.min(startX, endX)
		const minY = Math.min(startY, endY)
		const width = Math.abs(endX - startX)
		const height = Math.abs(endY - startY)

		// Skip if too small
		if (width < 5 && height < 5) {
			setShapePreview(null)
			return
		}

		let objectId: ObjectId

		if (type === 'rect') {
			const obj: Omit<RectObject, 'id'> = {
				type: 'rect',
				x: minX,
				y: minY,
				width,
				height,
				rotation: 0,
				pivotX: 0.5,
				pivotY: 0.5,
				locked: false,
				style: {
					strokeColor: style.strokeColor,
					fillColor: style.fillColor,
					strokeWidth: style.strokeWidth,
					strokeStyle: DEFAULT_STYLE.strokeStyle,
					opacity: DEFAULT_STYLE.opacity
				}
			}
			objectId = addObject(yDoc, doc, obj)
		} else if (type === 'ellipse') {
			const obj: Omit<EllipseObject, 'id'> = {
				type: 'ellipse',
				x: minX,
				y: minY,
				width,
				height,
				rotation: 0,
				pivotX: 0.5,
				pivotY: 0.5,
				locked: false,
				style: {
					strokeColor: style.strokeColor,
					fillColor: style.fillColor,
					strokeWidth: style.strokeWidth,
					strokeStyle: DEFAULT_STYLE.strokeStyle,
					opacity: DEFAULT_STYLE.opacity
				}
			}
			objectId = addObject(yDoc, doc, obj)
		} else if (type === 'line') {
			const obj: Omit<LineObject, 'id'> = {
				type: 'line',
				x: minX,
				y: minY,
				startX,
				startY,
				endX,
				endY,
				rotation: 0,
				pivotX: 0.5,
				pivotY: 0.5,
				locked: false,
				style: {
					strokeColor: style.strokeColor,
					fillColor: 'transparent',
					strokeWidth: style.strokeWidth,
					strokeStyle: DEFAULT_STYLE.strokeStyle,
					opacity: DEFAULT_STYLE.opacity
				}
			}
			objectId = addObject(yDoc, doc, obj)
		} else if (type === 'arrow') {
			const obj: Omit<ArrowObject, 'id'> = {
				type: 'arrow',
				x: minX,
				y: minY,
				startX,
				startY,
				endX,
				endY,
				arrowheadPosition: 'end',
				rotation: 0,
				pivotX: 0.5,
				pivotY: 0.5,
				locked: false,
				style: {
					strokeColor: style.strokeColor,
					fillColor: 'transparent',
					strokeWidth: style.strokeWidth,
					strokeStyle: DEFAULT_STYLE.strokeStyle,
					opacity: DEFAULT_STYLE.opacity
				}
			}
			objectId = addObject(yDoc, doc, obj)
		} else {
			setShapePreview(null)
			return
		}

		setShapePreview(null)
		onObjectCreated?.(objectId!)
	}, [yDoc, doc, broadcastShape, onObjectCreated])

	// Memoize return value to prevent infinite re-render loops
	return React.useMemo(
		() => ({
			shapePreview,
			handlePointerDown,
			handlePointerMove,
			handlePointerUp
		}),
		[shapePreview, handlePointerDown, handlePointerMove, handlePointerUp]
	)
}

// vim: ts=4
