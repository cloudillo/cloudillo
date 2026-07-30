// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Tool system types for Ideallo
 */

import type { ObjectId } from '../crdt/index.js'
import type { AnchorPoint, ArrowStyle, Routing, Style } from '../crdt/runtime-types.js'

export type ToolType =
	| 'select'
	| 'pen'
	| 'eraser'
	| 'rect'
	| 'ellipse'
	// Both place a `polygon` object from a vertex preset - see tools/shape-presets.ts
	| 'diamond'
	| 'triangle'
	| 'connector'
	| 'text'
	| 'sticky'
	| 'image'
	| 'document'

/**
 * The tools whose gesture is a drag-out box, which is also exactly the set of previewable shapes.
 * `isDragShapeTool` in catalog.ts narrows to it from the tool's category.
 */
export type DragShapeTool = 'rect' | 'ellipse' | 'diamond' | 'triangle' | 'connector'

export interface ToolContext {
	currentStyle: Partial<Style>
}

/**
 * Shape preview during creation (before commit to CRDT).
 *
 * Broadcast verbatim over the `shape` awareness field, so it carries only replicable data - the
 * connector fields are the bindings, never the derived route. Both the local preview and the
 * remote ghost re-resolve the route against the shapes they already have.
 */
export interface ShapePreview {
	type: DragShapeTool
	startX: number
	startY: number
	endX: number
	endY: number
	style: {
		strokeColor: string
		fillColor: string
		strokeWidth: number
	}
	// Connector fields, present only while drawing a connector
	startObjectId?: ObjectId
	startAnchor?: AnchorPoint
	endObjectId?: ObjectId
	endAnchor?: AnchorPoint
	routing?: Routing
	startArrow?: ArrowStyle
	endArrow?: ArrowStyle
	/** Shape currently under the pointer, highlighted as a drop target */
	targetObjectId?: ObjectId
}

/**
 * Viewport point an editor was opened from.
 *
 * The editor replaces whatever was clicked, so the opening click never reaches its DOM; handing
 * the point along is what lets the caret land where the user aimed instead of at the end.
 */
export interface CaretPoint {
	clientX: number
	clientY: number
}

/**
 * The one editing slot, whatever kind of object is being typed into.
 *
 * One slot rather than one per type, because there is only ever ONE editor on screen and only one
 * rule for closing it - see useObjectTextEditor.
 */
export interface ObjectEditState {
	id: ObjectId
	x: number
	y: number
	width: number
	height: number
	/** Absent when the edit was started by creation or by keyboard */
	caretPoint?: CaretPoint
}

// vim: ts=4
