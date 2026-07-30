// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Hook for handling shape creation (rect, ellipse, connector)
 * Broadcasts shape preview via awareness for real-time collaboration
 */

import * as React from 'react'
import type { Awareness } from 'y-protocols/awareness'
import type * as Y from 'yjs'

import type { BindLookupOptions, BindTarget, ShapeGeometry } from '../connectors/index.js'
import { findBindTargetShape, resolveBindTarget, toShapeGeometry } from '../connectors/index.js'
import type {
	ArrowStyle,
	ConnectorObject,
	EllipseObject,
	IdealloObject,
	ObjectId,
	PolygonObject,
	RectObject,
	Routing,
	YIdealloDocument
} from '../crdt/index.js'
import {
	addObject,
	DEFAULT_END_ARROW,
	DEFAULT_ROUTING,
	DEFAULT_START_ARROW,
	DEFAULT_STYLE,
	getAllObjects,
	getObject
} from '../crdt/index.js'
import { isDragShapeTool } from '../tools/catalog.js'
import { isCommittableShapePreview, takePending } from '../tools/lifecycle.js'
import { polygonPresetVertices } from '../tools/shape-presets.js'
import type { ShapePreview, ToolType } from '../tools/types.js'

export interface UseShapeHandlerOptions {
	yDoc: Y.Doc
	doc: YIdealloDocument
	awareness: Awareness | null
	currentStyle: {
		strokeColor: string
		fillColor: string
		strokeWidth: number
		routing?: Routing
		startArrow?: ArrowStyle
		endArrow?: ArrowStyle
	}
	activeTool: ToolType
	/** Canvas scale, for screen-space anchor snapping */
	scale?: number
	/** Sticky precise-placement toggle (mobile parity for the Alt modifier) */
	preciseMode?: boolean
	/**
	 * Shared, already-expanded objects for every bind-target lookup.
	 *
	 * Expanding the whole document on every pointermove is the thing this avoids; app.tsx
	 * memoises one pass per document revision and injects it. Omit it and the hook expands the
	 * document itself, which is fine outside the hot path.
	 */
	getResolvedObjects?: () => IdealloObject[]
	onObjectCreated?: (id: ObjectId) => void
}

export function useShapeHandler(options: UseShapeHandlerOptions) {
	const {
		yDoc,
		doc,
		awareness,
		currentStyle,
		activeTool,
		scale = 1,
		preciseMode = false,
		getResolvedObjects,
		onObjectCreated
	} = options
	/**
	 * Objects offered to the bind lookup. Resolved objects are a superset of expanded ones and
	 * findBindTargetShape reads only shape geometry, so the shared pass is interchangeable with
	 * a fresh expand here.
	 */
	const bindCandidates = React.useCallback(
		() => getResolvedObjects?.() ?? getAllObjects(doc),
		[doc, getResolvedObjects]
	)
	const [shapePreview, setShapePreview] = React.useState<ShapePreview | null>(null)
	const shapePreviewRef = React.useRef<ShapePreview | null>(null)
	/** Shape under the cursor before pointer-down, highlighted as a drop target */
	const [hoverTarget, setHoverTarget] = React.useState<ShapeGeometry | null>(null)

	// NOT useLatestRef: takePending clears this eagerly, and a later insertion-effect write would
	// resurrect the preview it just consumed.
	React.useEffect(() => {
		shapePreviewRef.current = shapePreview
	}, [shapePreview])

	// Broadcast shape preview via awareness. The connector fields are BINDINGS, never the
	// derived route - remote peers re-resolve it against the shapes they already have.
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
					style: preview.style,
					...(preview.startObjectId ? { startObjectId: preview.startObjectId } : {}),
					...(preview.startAnchor ? { startAnchor: preview.startAnchor } : {}),
					...(preview.endObjectId ? { endObjectId: preview.endObjectId } : {}),
					...(preview.endAnchor ? { endAnchor: preview.endAnchor } : {}),
					...(preview.routing ? { routing: preview.routing } : {}),
					...(preview.startArrow ? { startArrow: preview.startArrow } : {}),
					...(preview.endArrow ? { endArrow: preview.endArrow } : {})
				})
			} else {
				awareness.setLocalStateField('shape', undefined)
			}
		},
		[awareness]
	)

	const bindOptions = React.useCallback(
		(altKey: boolean, excludeId?: ObjectId): BindLookupOptions => ({
			scale,
			precise: altKey || preciseMode,
			excludeId
		}),
		[scale, preciseMode]
	)

	/**
	 * Hover before pointer-down: highlight whatever the connector could attach to.
	 *
	 * Runs UNTHROTTLED - the caller's 50 ms throttle exists for the awareness broadcast, and
	 * putting the local highlight behind it is the difference between the affordance feeling
	 * instant and feeling laggy.
	 */
	const handleHover = React.useCallback(
		(x: number, y: number, altKey = false) => {
			if (activeTool !== 'connector' || shapePreviewRef.current) return
			const target = findBindTargetShape(bindCandidates(), [x, y], bindOptions(altKey))
			setHoverTarget((prev) => (prev?.id === target?.id ? prev : target))
		},
		[activeTool, bindCandidates, bindOptions]
	)

	const clearHover = React.useCallback(() => {
		setHoverTarget(null)
	}, [])

	/**
	 * Abandon a drag in progress: no object, and the awareness ghost remotes are drawing goes too.
	 *
	 * Clears the REF as well as the state - handlePointerUp reads the ref, which the effect above
	 * only catches up on the next render, so leaving it live would commit the shape that was just
	 * cancelled on the release.
	 */
	const cancelPreview = React.useCallback(() => {
		if (!shapePreviewRef.current) return
		shapePreviewRef.current = null
		setShapePreview(null)
		setHoverTarget(null)
		broadcastShape(null)
	}, [broadcastShape])

	const handlePointerDown = React.useCallback(
		(x: number, y: number, altKey = false) => {
			// Also the narrowing that lets `activeTool` be the preview's `type` below
			if (!isDragShapeTool(activeTool)) return

			// Only the connector tool binds; a rect dropped on a rect is just a rect
			const bind =
				activeTool === 'connector'
					? resolveBindTarget(bindCandidates(), [x, y], bindOptions(altKey))
					: null

			const preview: ShapePreview = {
				type: activeTool,
				startX: x,
				startY: y,
				endX: x,
				endY: y,
				style: {
					strokeColor: currentStyle.strokeColor,
					fillColor: currentStyle.fillColor,
					strokeWidth: currentStyle.strokeWidth
				},
				...(activeTool === 'connector'
					? {
							routing: currentStyle.routing ?? DEFAULT_ROUTING,
							startArrow: currentStyle.startArrow ?? { ...DEFAULT_START_ARROW },
							endArrow: currentStyle.endArrow ?? { ...DEFAULT_END_ARROW }
						}
					: {}),
				...(bind ? { startObjectId: bind.objectId, startAnchor: bind.anchor } : {})
			}

			setShapePreview(preview)
			setHoverTarget(null)
			broadcastShape(preview)
		},
		[activeTool, currentStyle, broadcastShape, bindCandidates, bindOptions]
	)

	const handlePointerMove = React.useCallback(
		(x: number, y: number, altKey = false) => {
			const current = shapePreviewRef.current
			if (!current) return

			let bind: BindTarget | null = null
			if (current.type === 'connector') {
				// Suppress the source shape: a self-loop needs waypoints and is out of scope, so
				// the invitation is never offered rather than being refused on drop.
				bind = resolveBindTarget(
					bindCandidates(),
					[x, y],
					bindOptions(altKey, current.startObjectId)
				)
			}

			const updated: ShapePreview = {
				...current,
				endX: x,
				endY: y,
				endObjectId: bind?.objectId,
				endAnchor: bind?.anchor,
				targetObjectId: bind?.objectId
			}
			setShapePreview(updated)
			broadcastShape(updated)
		},
		[broadcastShape, bindCandidates, bindOptions]
	)

	const handlePointerUp = React.useCallback(() => {
		// Consumed, not just read: setShapePreview(null) does not take effect until the next
		// render, so a second release in the same frame would find the ref still populated and
		// commit the same preview again - one gesture, two objects. takePending empties the slot
		// on EVERY exit path below, including the early returns.
		const preview = takePending(shapePreviewRef)
		if (!preview) return

		const { type, startX, startY, endX, endY, style } = preview

		// Clear broadcast first
		broadcastShape(null)

		// Calculate normalized bounds (handle negative dimensions)
		const minX = Math.min(startX, endX)
		const minY = Math.min(startY, endY)
		const width = Math.abs(endX - startX)
		const height = Math.abs(endY - startY)

		// Too small to be a shape
		if (!isCommittableShapePreview(preview)) {
			setShapePreview(null)
			setHoverTarget(null)
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
		} else if (type === 'connector') {
			const obj: Omit<ConnectorObject, 'id'> = {
				type: 'connector',
				x: minX,
				y: minY,
				startX,
				startY,
				endX,
				endY,
				// Bindings survive from the draw gesture; pts stays as the bind-time snapshot
				...(preview.startObjectId
					? { startObjectId: preview.startObjectId, startAnchor: preview.startAnchor }
					: {}),
				...(preview.endObjectId
					? { endObjectId: preview.endObjectId, endAnchor: preview.endAnchor }
					: {}),
				routing: preview.routing ?? DEFAULT_ROUTING,
				startArrow: preview.startArrow ?? { ...DEFAULT_START_ARROW },
				endArrow: preview.endArrow ?? { ...DEFAULT_END_ARROW },
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
		} else if (type === 'diamond' || type === 'triangle') {
			// A `polygon`, not a type of its own: no new wire code, so an older peer still draws it.
			// No `snapped` flag either - that means "Smart Ink auto-detected this", and a tool
			// placement is deliberate.
			const obj: Omit<PolygonObject, 'id'> = {
				type: 'polygon',
				x: minX,
				y: minY,
				vertices: polygonPresetVertices(type, {
					x: minX,
					y: minY,
					width,
					height
				}),
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
		} else {
			setShapePreview(null)
			return
		}

		setShapePreview(null)
		setHoverTarget(null)
		onObjectCreated?.(objectId!)
	}, [yDoc, doc, broadcastShape, onObjectCreated])

	/**
	 * The shape whose anchor dots should be showing: the drop target mid-drag, or whatever the
	 * cursor is over before the drag starts.
	 */
	const connectorTarget = React.useMemo<ShapeGeometry | null>(() => {
		// Before pointer-down there is no preview, so fall back to the hover target
		if (shapePreview?.type !== 'connector') return hoverTarget
		if (!shapePreview.targetObjectId) return null
		const obj = getObject(doc, shapePreview.targetObjectId)
		return obj ? toShapeGeometry(obj) : null
	}, [shapePreview, hoverTarget, doc])

	// Memoize return value to prevent infinite re-render loops
	return React.useMemo(
		() => ({
			shapePreview,
			connectorTarget,
			handlePointerDown,
			handlePointerMove,
			handlePointerUp,
			handleHover,
			clearHover,
			cancelPreview
		}),
		[
			shapePreview,
			connectorTarget,
			handlePointerDown,
			handlePointerMove,
			handlePointerUp,
			handleHover,
			clearHover,
			cancelPreview
		]
	)
}

// vim: ts=4
