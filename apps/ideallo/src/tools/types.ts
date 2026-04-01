// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Tool system types for Ideallo
 */

import type { ObjectId } from '../crdt/index.js'
import type { Style } from '../crdt/runtime-types.js'

export type ToolType =
	| 'select'
	| 'pen'
	| 'eraser'
	| 'rect'
	| 'ellipse'
	| 'line'
	| 'arrow'
	| 'text'
	| 'sticky'
	| 'image'
	| 'document'

export interface ToolContext {
	currentStyle: Partial<Style>
}

/**
 * Shape preview during creation (before commit to CRDT)
 */
export interface ShapePreview {
	type: 'rect' | 'ellipse' | 'line' | 'arrow'
	startX: number
	startY: number
	endX: number
	endY: number
	style: {
		strokeColor: string
		fillColor: string
		strokeWidth: number
	}
}

/**
 * Text input state for text tool
 */
export interface TextInputState {
	x: number
	y: number
	width: number
	height: number
	text: string
}

/**
 * Sticky note input state (similar to text but with larger default size)
 */
export interface StickyInputState {
	id?: ObjectId // Set after object is created in CRDT
	x: number
	y: number
	width: number
	height: number
	text: string
}

/**
 * Text label edit state (for double-click editing of existing text objects)
 */
export interface TextEditState {
	id: ObjectId
	x: number
	y: number
	width: number
	height: number
	text: string
}

// vim: ts=4
