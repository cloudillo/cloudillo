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

// vim: ts=4
