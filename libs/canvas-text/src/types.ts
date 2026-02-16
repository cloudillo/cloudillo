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
 * Type definitions for @cloudillo/canvas-text
 */

/** Per-run style attributes from Quill Delta */
export interface RichTextRunStyle {
	bold?: boolean
	italic?: boolean
	underline?: boolean
	strike?: boolean
	font?: string
	size?: string // e.g., "32px"
	color?: string // e.g., "#ff0000"
	link?: string
}

/** A single run of text with consistent formatting */
export interface TextRun {
	text: string
	style: RichTextRunStyle
}

/** A single line of text with its runs and optional list attributes */
export interface TextLine {
	runs: TextRun[]
	listType?: 'bullet' | 'ordered'
	listIndex?: number
}

/** A run positioned in the layout */
export interface PositionedRun {
	text: string
	style: RichTextRunStyle
	x: number
	y: number
	width: number
}

/** A line positioned in the layout */
export interface PositionedLine {
	runs: PositionedRun[]
	y: number
	height: number
	lineWidth: number
	listType?: 'bullet' | 'ordered'
	listIndex?: number
}

/** Complete layout result */
export interface RichTextLayout {
	lines: PositionedLine[]
	totalHeight: number
}

/** Base text style - the object-level default style that Delta attributes override */
export interface BaseTextStyle {
	fontFamily: string
	fontSize: number
	fontWeight: 'normal' | 'bold' | number
	fontItalic: boolean
	textDecoration: 'none' | 'underline' | 'line-through'
	fill: string
	textAlign: 'left' | 'center' | 'right' | 'justify'
	verticalAlign: 'top' | 'middle' | 'bottom'
	lineHeight: number
	letterSpacing: number
	listBullet?: string
}

/** Bounds for text rendering */
export interface TextBounds {
	x: number
	y: number
	width: number
	height: number
}

/** Container style for display/editor wrapping div */
export interface ContainerStyle {
	background?: string
	padding?: number
	borderRadius?: number
	color?: string
	className?: string
}

/** Quill Delta operation (simplified type for our use) */
export interface DeltaOp {
	insert?: string
	attributes?: Record<string, unknown>
}

// vim: ts=4
